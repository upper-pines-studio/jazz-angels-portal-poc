import type { ActionRule, AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import { archiveFields, normaliseArchived, restoreFields } from '../../../core/archive';
import { can } from '../../../core/permissions';
import { makeCoreSeed } from '../../../core/seed';
import { acceptableSuggestions, backupCarry, isReportOpen, splitByPercent } from './money';
import { inFlightRefusal } from './inflight';
import { availableTransitions, isPostAward, phaseLabel } from './phases';
import { makeEmpty, makeSeed } from './seed';
import { instantiateDocumentRegister, instantiateTemplate } from './templates';
import type { PortalState, ProgramId, Role } from '../../../core/types';
import type {
  Activity,
  Allocation,
  AwardTerm,
  BudgetLine,
  ChecklistTemplate,
  Expense,
  Funder,
  Grant,
  GrantDocument,
  GrantFile,
  GrantsState,
  NewGrantInput,
  Payment,
  Phase,
  ReminderDefaults,
  ReminderPlan,
  Report,
  SplitRule,
  Task,
  Transaction,
  TransactionSnapshot,
  TransitionPayload,
} from './types';

/**
 * The grants slice: its reducer, its actions, and the `declare module` that
 * hangs both off the portal store. Screens reach them as `state.grants.*` and
 * `actions.grants.*`.
 */

declare module '../../../core/types' {
  interface PortalState {
    grants: GrantsState;
  }
  interface PortalActions {
    grants: GrantsActions;
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

interface Collections {
  funders: Funder;
  grants: Grant;
  tasks: Task;
  documents: GrantDocument;
  payments: Payment;
  budgetLines: BudgetLine;
  expenses: Expense;
  reports: Report;
  activity: Activity;
  templates: ChecklistTemplate;
  transactions: Transaction;
  splitRules: SplitRule;
  files: GrantFile;
  terms: AwardTerm;
}

type CollectionKey = keyof Collections;

type InsertAction = {
  [K in CollectionKey]: { type: 'insert'; key: K; item: Collections[K] };
}[CollectionKey];

type UpdateAction = {
  [K in CollectionKey]: { type: 'update'; key: K; id: string; patch: Partial<Collections[K]> };
}[CollectionKey];

export type GrantsAction =
  | InsertAction
  | UpdateAction
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'batch'; actions: GrantsAction[] }
  | {
      /**
       * A new grant with its checklist, documents and one activity row. A grant
       * brought in already under way (`grant.broughtIn`) carries its budget,
       * payments and reports too, all in this one change.
       */
      type: 'add-grant';
      grant: Grant;
      funder?: Funder;
      templateId?: string | null;
      excludeTemplateItemIds?: string[];
      includeDocumentRegister: boolean;
      budgetLines?: BudgetLine[];
      payments?: Payment[];
      reports?: Report[];
      activityId: string;
      at: string;
      whoId: string;
    }
  | {
      type: 'transition';
      grantId: string;
      to: Phase;
      payload: TransitionPayload;
      activityId: string;
      at: string;
      whoId: string;
    }
  | { type: 'toggle-task'; id: string; date: string }
  | { type: 'duplicate-template'; id: string; newTemplateId: string }
  | {
      /** Put a QuickBooks transaction on one line, or split it across several. */
      type: 'assign-transaction';
      id: string;
      parts: Array<Allocation & { expenseId: string; activityId: string }>;
      by: string;
      date: string;
      at: string;
      whoId: string;
    }
  | {
      /** Every expense on one budget line moves to another line on the same grant. */
      type: 'move-expenses';
      fromLineId: string;
      toLineId: string;
      activityId: string;
      at: string;
      whoId: string;
    }
  | {
      type: 'set-transaction-status';
      id: string;
      status: 'to-assign' | 'not-grant-funded';
      by?: string;
      date?: string;
    }
  | {
      /** Put transactions back exactly as they stood: status, parts, notes and backup. */
      type: 'restore-transactions';
      snapshots: TransactionSnapshot[];
    }
  | { type: 'sync'; at: string }
  | { type: 'set-quickbooks'; patch: Partial<GrantsState['quickbooks']> }
  | { type: 'save-reminder-plan'; plan: ReminderPlan }
  | { type: 'reset-reminder-plan'; reportId: string }
  | { type: 'set-reminder-defaults'; patch: Partial<ReminderDefaults> };

const DOLLARS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function withId<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map(row => (row.id === id ? { ...row, ...patch } : row));
}

/**
 * Put one transaction back as the snapshot has it. Backup added to its parts
 * since then follows the same rule as a reassign, so it is not lost; with no
 * parts to go to, it goes, as it does on Send back.
 */
function restoreTransaction(state: GrantsState, snap: TransactionSnapshot): GrantsState {
  if (!state.transactions.some(t => t.id === snap.id)) return state;
  const now = state.expenses.filter(e => e.transactionId === snap.id);
  const nowIds = new Set(now.map(e => e.id));
  const back = new Set(snap.files.map(f => f.id));
  const carry = backupCarry(now, snap.expenses);
  const target = new Map<string, Expense>();
  carry.kept.forEach((e, i) => e && target.set(e.id, snap.expenses[i]));
  carry.moved.forEach(m => target.set(m.from.id, snap.expenses[m.to]));
  const files = state.files.flatMap(f => {
    if (back.has(f.id)) return [];
    if (!f.expenseId || !nowIds.has(f.expenseId)) return [f];
    const to = target.get(f.expenseId);
    return to ? [{ ...f, grantId: to.grantId, expenseId: to.id }] : [];
  });
  return {
    ...state,
    expenses: [...state.expenses.filter(e => !nowIds.has(e.id)), ...snap.expenses],
    files: [...files, ...snap.files],
    transactions: withId(state.transactions, snap.id, {
      status: snap.status,
      assignedById: snap.assignedById,
      assignedAt: snap.assignedAt,
    }),
  };
}

/** Why expenses may not move from one line to the other, or undefined when they may. */
export function moveExpensesRefusal(
  state: GrantsState,
  fromLineId: string,
  toLineId: string,
): string | undefined {
  const from = state.budgetLines.find(l => l.id === fromLineId);
  const to = state.budgetLines.find(l => l.id === toLineId);
  if (!from || !to) return 'That budget line is no longer on the grant.';
  if (from.id === to.id) return 'Pick a different line to move the expenses to.';
  if (from.grantId !== to.grantId) return 'Expenses move only between lines on the same grant.';
  return undefined;
}

/**
 * The one activity row a grant brought in already under way gets. It matches
 * none of the stepper's `ENTERED` patterns, so it dates no phase.
 */
export function broughtInText(phase: Phase): string {
  return `Brought into the portal at ${phaseLabel(phase)}`;
}

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: GrantsState, action: GrantsAction): GrantsState {
  switch (action.type) {
    case 'batch':
      return action.actions.reduce(reducer, state);

    case 'insert': {
      const rows = state[action.key] as unknown[];
      return { ...state, [action.key]: [...rows, action.item] } as GrantsState;
    }

    case 'update': {
      const rows = state[action.key] as Array<{ id: string }>;
      return {
        ...state,
        [action.key]: withId(rows, action.id, action.patch as Partial<{ id: string }>),
      } as GrantsState;
    }

    case 'remove': {
      const rows = state[action.key] as Array<{ id: string }>;
      return { ...state, [action.key]: rows.filter(row => row.id !== action.id) } as GrantsState;
    }

    case 'add-grant': {
      const { grant } = action;
      const template = action.templateId
        ? state.templates.find(t => t.id === action.templateId)
        : undefined;

      // A grant brought in has passed the earlier phases elsewhere: no tasks for them.
      const tasks: Task[] = template
        ? instantiateTemplate(
            template,
            grant,
            action.excludeTemplateItemIds,
            grant.broughtIn?.phase,
          ).map((task, index) => ({ ...task, id: `${grant.id}-t${index + 1}` }))
        : [];

      const documents: GrantDocument[] = action.includeDocumentRegister
        ? instantiateDocumentRegister(
            grant.id,
            grant.createdAt,
            grant.broughtIn ? 'submitted' : 'needed',
          ).map((doc, index) => ({
            ...doc,
            id: `${grant.id}-d${index + 1}`,
          }))
        : [];

      return {
        ...state,
        funders: action.funder ? [...state.funders, action.funder] : state.funders,
        grants: [...state.grants, grant],
        tasks: [...state.tasks, ...tasks],
        documents: [...state.documents, ...documents],
        budgetLines: [...state.budgetLines, ...(action.budgetLines ?? [])],
        payments: [...state.payments, ...(action.payments ?? [])],
        reports: [...state.reports, ...(action.reports ?? [])],
        activity: [
          ...state.activity,
          {
            id: action.activityId,
            grantId: grant.id,
            at: action.at,
            whoId: action.whoId,
            // One row for a grant brought in, never one per phase it passed.
            text: grant.broughtIn ? broughtInText(grant.broughtIn.phase) : 'Grant added',
          },
        ],
      };
    }

    case 'transition': {
      const grant = state.grants.find(g => g.id === action.grantId);
      if (!grant) return state;

      const { to, payload } = action;
      const date = payload.date ?? action.at.slice(0, 10);
      const dates = { ...grant.dates };
      const patch: Partial<Grant> = { phase: to };

      if (to === 'submitted') dates.submitted = date;
      if (to === 'awarded' || to === 'declined' || to === 'withdrawn') dates.decided = date;
      if (to === 'awarded') {
        if (typeof payload.amountAwarded === 'number') patch.amountAwarded = payload.amountAwarded;
        if (payload.periodStart) dates.periodStart = payload.periodStart;
        if (payload.periodEnd) dates.periodEnd = payload.periodEnd;
      }
      patch.dates = dates;

      const label = availableTransitions(grant).find(t => t.to === to)?.label ?? `Moved to ${to}`;
      const reason = payload.reason ? ` — ${payload.reason}` : '';

      return {
        ...state,
        grants: withId(state.grants, grant.id, patch),
        activity: [
          ...state.activity,
          {
            id: action.activityId,
            grantId: grant.id,
            at: action.at,
            whoId: action.whoId,
            text: `${label}${reason}`,
          },
        ],
      };
    }

    case 'toggle-task': {
      const task = state.tasks.find(t => t.id === action.id);
      if (!task) return state;
      const done = !task.done;
      return {
        ...state,
        tasks: withId(state.tasks, action.id, { done, doneAt: done ? action.date : undefined }),
      };
    }

    case 'duplicate-template': {
      const source = state.templates.find(t => t.id === action.id);
      if (!source) return state;
      const copy: ChecklistTemplate = {
        ...source,
        id: action.newTemplateId,
        name: `${source.name} (copy)`,
        items: source.items.map((item, index) => ({
          ...item,
          id: `${action.newTemplateId}-i${index + 1}`,
        })),
      };
      return { ...state, templates: [...state.templates, copy] };
    }

    case 'assign-transaction': {
      const tx = state.transactions.find(t => t.id === action.id);
      if (!tx || !action.parts.length) return state;

      // Reassigning keeps the backup: a part that stays on its line keeps its
      // expense, and a part that goes hands its files and note on (`backupCarry`).
      const old = state.expenses.filter(e => e.transactionId === tx.id);
      const carry = backupCarry(old, action.parts);
      const expenses: Expense[] = action.parts.map((part, i) => {
        const kept = carry.kept[i];
        const notes = [kept, ...carry.moved.filter(m => m.to === i).map(m => m.from)]
          .map(e => e?.backupNote?.trim())
          .filter((n): n is string => !!n);
        const expense: Expense = {
          ...(kept ?? { note: tx.memo || undefined }),
          id: kept?.id ?? part.expenseId,
          grantId: part.grantId,
          budgetLineId: part.budgetLineId,
          date: tx.date,
          payee: tx.payee,
          amount: part.amount,
          transactionId: tx.id,
        };
        if (notes.length) expense.backupNote = notes.join('\n');
        else delete expense.backupNote;
        return expense;
      });
      const movedTo = new Map(carry.moved.map(m => [m.from.id, expenses[m.to]]));

      const split = action.parts.length > 1;
      const activity: Activity[] = action.parts.map(part => {
        const line = state.budgetLines.find(l => l.id === part.budgetLineId);
        return {
          id: part.activityId,
          grantId: part.grantId,
          at: action.at,
          whoId: action.whoId,
          text: `Assigned $${DOLLARS.format(part.amount)} from ${tx.payee} to ${line?.category ?? 'a budget line'}${
            split ? ` (split of $${DOLLARS.format(tx.amount)})` : ''
          }`,
        };
      });

      return {
        ...state,
        // Reassigning replaces whatever the transaction was on before.
        expenses: [...state.expenses.filter(e => e.transactionId !== tx.id), ...expenses],
        files: state.files.map(f => {
          const to = f.expenseId ? movedTo.get(f.expenseId) : undefined;
          return to ? { ...f, grantId: to.grantId, expenseId: to.id } : f;
        }),
        transactions: withId(state.transactions, tx.id, {
          status: 'assigned',
          assignedById: action.by,
          assignedAt: action.date,
        }),
        activity: [...state.activity, ...activity],
      };
    }

    case 'restore-transactions':
      return action.snapshots.reduce(restoreTransaction, state);

    case 'move-expenses': {
      if (moveExpensesRefusal(state, action.fromLineId, action.toLineId)) return state;
      const from = state.budgetLines.find(l => l.id === action.fromLineId)!;
      const to = state.budgetLines.find(l => l.id === action.toLineId)!;
      const moving = state.expenses.filter(e => e.budgetLineId === from.id);
      if (moving.length === 0) return state;
      const total = moving.reduce((sum, e) => sum + e.amount, 0);
      const n = moving.length;
      // Only the line changes: ids, notes, backup and transaction links stay as they are.
      return {
        ...state,
        expenses: state.expenses.map(e =>
          e.budgetLineId === from.id ? { ...e, budgetLineId: to.id } : e,
        ),
        activity: [
          ...state.activity,
          {
            id: action.activityId,
            grantId: from.grantId,
            at: action.at,
            whoId: action.whoId,
            text: `Moved ${n} ${n === 1 ? 'expense' : 'expenses'} ($${DOLLARS.format(total)}) from ${from.category} to ${to.category}`,
          },
        ],
      };
    }

    case 'set-transaction-status': {
      const tx = state.transactions.find(t => t.id === action.id);
      if (!tx) return state;
      const parts = new Set(state.expenses.filter(e => e.transactionId === tx.id).map(e => e.id));
      return {
        ...state,
        expenses: state.expenses.filter(e => !parts.has(e.id)),
        // Backup belongs to the expense, so it goes when the expense does.
        files: state.files.filter(f => !f.expenseId || !parts.has(f.expenseId)),
        transactions: withId(state.transactions, tx.id, {
          status: action.status,
          assignedById: action.status === 'to-assign' ? undefined : action.by,
          assignedAt: action.status === 'to-assign' ? undefined : action.date,
        }),
      };
    }

    case 'sync':
      return {
        ...state,
        quickbooks: { ...state.quickbooks, lastSyncedAt: action.at },
        transactions: [...state.incoming, ...state.transactions],
        incoming: [],
      };

    case 'set-quickbooks':
      return { ...state, quickbooks: { ...state.quickbooks, ...action.patch } };

    case 'save-reminder-plan':
      return {
        ...state,
        reminderPlans: [
          ...state.reminderPlans.filter(p => p.reportId !== action.plan.reportId),
          action.plan,
        ],
      };

    case 'reset-reminder-plan':
      return {
        ...state,
        reminderPlans: state.reminderPlans.filter(p => p.reportId !== action.reportId),
      };

    case 'set-reminder-defaults':
      return { ...state, reminderDefaults: { ...state.reminderDefaults, ...action.patch } };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface GrantsActions {
  /** Create a funder. Returns the new funder id. */
  addFunder(input: Omit<Funder, 'id'>): string;
  updateFunder(id: string, patch: Partial<Funder>): void;
  /**
   * Archive a funder (decision 0002): off the Funders list and the Add grant
   * picker. Its grants stay as they are; nothing cascades.
   */
  archiveFunder(id: string): void;
  restoreFunder(id: string): void;

  /**
   * Create a grant plus its checklist, document register and "Grant added"
   * activity. With `input.inFlight`, bring in a grant already under way at
   * Awarded, Active or Reporting: its award, budget lines, payments and
   * reports, no tasks for the phases it passed, and one "Brought into the
   * portal at …" row, all in one change.
   */
  addGrant(input: NewGrantInput): string;
  updateGrant(id: string, patch: Partial<Grant>): void;
  /**
   * Archive a grant (decision 0002) and log "Archived": it leaves the pipeline,
   * the deadlines, the reminders and the spending screens, and stays in the
   * funder's history, the All view of Budget vs. actual and the activity log.
   */
  archiveGrant(id: string): void;
  /** Put an archived grant back where it was, and log "Restored". */
  restoreGrant(id: string): void;
  /** Move a grant to a new phase, record the dates it implies, and log activity. */
  transition(grantId: string, to: Phase, payload?: TransitionPayload): void;

  addTask(input: Omit<Task, 'id'>): string;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;

  addDocument(input: Omit<GrantDocument, 'id' | 'updatedAt'> & { updatedAt?: string }): string;
  updateDocument(id: string, patch: Partial<GrantDocument>): void;
  deleteDocument(id: string): void;

  addPayment(input: Omit<Payment, 'id'>): string;
  updatePayment(id: string, patch: Partial<Payment>): void;
  deletePayment(id: string): void;
  /** Stamp a payment received and log activity. */
  markPaymentReceived(id: string, date: string): void;

  addBudgetLine(input: Omit<BudgetLine, 'id'>): string;
  updateBudgetLine(id: string, patch: Partial<BudgetLine>): void;
  deleteBudgetLine(id: string): void;
  /**
   * Move every expense on one line to another line of the same grant, in one
   * change with one activity row. Returns false, changing nothing, when either
   * line is missing or they are on different grants.
   */
  moveExpenses(fromLineId: string, toLineId: string): boolean;

  addExpense(input: Omit<Expense, 'id'>): string;
  updateExpense(id: string, patch: Partial<Expense>): void;
  /** An expense that came from QuickBooks goes back to "to assign", every part of it. */
  deleteExpense(id: string): void;

  /**
   * Pull what is waiting in QuickBooks. Read-only: nothing is written back.
   * Returns how many transactions arrived.
   */
  syncQuickBooks(): number;
  setQuickBooksConnected(connected: boolean): void;
  /** Put a transaction on one budget line, or split it across several. The parts must add up. */
  assignTransaction(id: string, parts: Allocation[]): void;
  /** Set a transaction aside: overhead that no grant pays for. */
  markNotGrantFunded(id: string): void;
  /** Send a transaction back to "to assign" and take its expenses off the budget. */
  unassignTransaction(id: string): void;
  /** Undo: put transactions back exactly as `transactionSnapshot` found them, backup included. */
  restoreTransactions(snapshots: TransactionSnapshot[]): void;
  /** Accept every proposal that is waiting. Returns how many were accepted. */
  acceptSuggestions(): number;
  /** "Always split this payee this way." Replaces any rule the payee already has. */
  saveSplitRule(input: Omit<SplitRule, 'id'>): string;
  deleteSplitRule(id: string): void;

  /** Store a file with a grant, or as backup for one expense. */
  addFile(input: Omit<GrantFile, 'id' | 'uploadedById' | 'uploadedAt'>): string;
  updateFile(id: string, patch: Partial<GrantFile>): void;
  deleteFile(id: string): void;

  addTerm(input: Omit<AwardTerm, 'id' | 'order'>): string;
  updateTerm(id: string, patch: Partial<AwardTerm>): void;
  deleteTerm(id: string): void;

  /** Set when one report's reminder emails go out, and to whom. */
  saveReminderPlan(plan: ReminderPlan): void;
  /** Put a report back on the office defaults. */
  resetReminderPlan(reportId: string): void;
  updateReminderDefaults(patch: Partial<ReminderDefaults>): void;

  addReport(input: Omit<Report, 'id'>): string;
  updateReport(id: string, patch: Partial<Report>): void;
  /** Remove a report and the reminder plan it had. */
  deleteReport(id: string): void;
  /** Stamp a report submitted and log activity. */
  markReportSubmitted(id: string, date: string): void;

  /** Free-text note on the activity timeline. Returns the activity row id. */
  addNote(grantId: string, text: string): string;

  addTemplate(input: Omit<ChecklistTemplate, 'id'>): string;
  updateTemplate(id: string, patch: Partial<ChecklistTemplate>): void;
  deleteTemplate(id: string): void;
  /** Copy a template, its items included. Returns the new template id. */
  duplicateTemplate(id: string): string;
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

function createActions(
  dispatch: (action: AnyAction) => void,
  getState: () => { grants: GrantsState },
  ctx: SliceContext,
): GrantsActions {
  const { today, newId, user } = ctx;
  /** Every action leaves this module namespaced, so the store can route it. */
  const send = (action: GrantsAction) => dispatch({ ...action, type: `grants/${action.type}` });

  /** Every row this module writes about a person names the one signed in. */
  const whoId = user.id;
  const now = () => new Date().toISOString();

  const logActivity = (grantId: string, text: string): string => {
    const id = newId('act');
    send({
      type: 'insert',
      key: 'activity',
      item: { id, grantId, at: now(), whoId, text },
    });
    return id;
  };

  const insert = <K extends CollectionKey>(key: K, item: Collections[K]) => {
    send({ type: 'insert', key, item } as GrantsAction);
  };
  const update = <K extends CollectionKey>(key: K, id: string, patch: Partial<Collections[K]>) => {
    send({ type: 'update', key, id, patch } as GrantsAction);
  };
  const remove = (key: CollectionKey, id: string) => send({ type: 'remove', key, id });

  const assignAction = (id: string, parts: Allocation[]): GrantsAction => ({
    type: 'assign-transaction',
    id,
    parts: parts.map(part => ({ ...part, expenseId: newId('ex'), activityId: newId('act') })),
    by: user.id,
    date: today,
    at: now(),
    whoId,
  });

  return {
    addFunder(input) {
      const id = newId('f');
      insert('funders', { ...input, id });
      return id;
    },
    updateFunder(id, patch) {
      update('funders', id, patch);
    },
    archiveFunder(id) {
      update('funders', id, archiveFields(user, today));
    },
    restoreFunder(id) {
      update('funders', id, restoreFields());
    },

    addGrant(input) {
      const createdAt = today;
      const grantId = newId('g');

      let funder: Funder | undefined;
      let funderId = input.funderId ?? '';
      if (input.newFunder) {
        funderId = newId('f');
        funder = { ...input.newFunder, id: funderId };
      }

      const flight = input.inFlight;
      const phase = input.phase ?? 'prospect';
      const grant: Grant = {
        id: grantId,
        funderId,
        title: input.title,
        programs: [...input.programs],
        restriction: input.restriction,
        ownerId: input.ownerId,
        phase,
        loiRequired: input.loiRequired,
        amountRequested: input.amountRequested,
        dates: input.dates ?? {},
        notes: input.notes,
        createdAt,
      };
      if (flight) {
        grant.amountAwarded = flight.amountAwarded;
        grant.broughtIn = { phase, on: today };
      }

      send({
        type: 'add-grant',
        grant,
        funder,
        templateId: input.templateId,
        excludeTemplateItemIds: input.excludeTemplateItemIds,
        includeDocumentRegister: input.includeDocumentRegister ?? true,
        budgetLines: flight?.budgetLines?.map(line => ({
          id: newId('bl'),
          grantId,
          category: line.category.trim(),
          planned: line.planned,
        })),
        payments: flight?.payments?.map(p => ({
          id: newId('pay'),
          grantId,
          label: p.label.trim(),
          expectedDate: p.expectedDate,
          amount: p.amount,
          ...(p.receivedDate ? { receivedDate: p.receivedDate } : {}),
        })),
        reports: flight?.reports?.map(r => ({
          id: newId('rep'),
          grantId,
          kind: r.kind,
          dueDate: r.dueDate,
          status: r.status,
          ...(r.submittedDate ? { submittedDate: r.submittedDate } : {}),
        })),
        activityId: newId('act'),
        at: now(),
        whoId,
      });
      return grantId;
    },
    updateGrant(id, patch) {
      update('grants', id, patch);
    },
    archiveGrant(id) {
      // The grant and its activity row are one change: saved together or not at all.
      send({
        type: 'batch',
        actions: [
          { type: 'update', key: 'grants', id, patch: archiveFields(user, today) },
          {
            type: 'insert',
            key: 'activity',
            item: { id: newId('act'), grantId: id, at: now(), whoId, text: 'Archived' },
          },
        ],
      });
    },
    restoreGrant(id) {
      send({
        type: 'batch',
        actions: [
          { type: 'update', key: 'grants', id, patch: restoreFields() },
          {
            type: 'insert',
            key: 'activity',
            item: { id: newId('act'), grantId: id, at: now(), whoId, text: 'Restored' },
          },
        ],
      });
    },
    transition(grantId, to, payload = {}) {
      send({
        type: 'transition',
        grantId,
        to,
        payload,
        activityId: newId('act'),
        at: now(),
        whoId,
      });
    },

    addTask(input) {
      const id = newId('t');
      insert('tasks', { ...input, id });
      return id;
    },
    updateTask(id, patch) {
      update('tasks', id, patch);
    },
    toggleTask(id) {
      send({ type: 'toggle-task', id, date: today });
    },
    deleteTask(id) {
      remove('tasks', id);
    },

    addDocument(input) {
      const id = newId('d');
      insert('documents', { ...input, id, updatedAt: input.updatedAt ?? today });
      return id;
    },
    updateDocument(id, patch) {
      update('documents', id, { updatedAt: today, ...patch });
    },
    deleteDocument(id) {
      remove('documents', id);
    },

    addPayment(input) {
      const id = newId('pay');
      insert('payments', { ...input, id });
      return id;
    },
    updatePayment(id, patch) {
      update('payments', id, patch);
    },
    deletePayment(id) {
      remove('payments', id);
    },
    markPaymentReceived(id, date) {
      const payment = getState().grants.payments.find(p => p.id === id);
      update('payments', id, { receivedDate: date });
      if (payment) {
        logActivity(
          payment.grantId,
          `Payment received: $${payment.amount.toLocaleString('en-US')} (${payment.label})`,
        );
      }
    },

    addBudgetLine(input) {
      const id = newId('bl');
      insert('budgetLines', { ...input, id });
      return id;
    },
    updateBudgetLine(id, patch) {
      update('budgetLines', id, patch);
    },
    deleteBudgetLine(id) {
      remove('budgetLines', id);
    },
    moveExpenses(fromLineId, toLineId) {
      if (moveExpensesRefusal(getState().grants, fromLineId, toLineId)) return false;
      send({
        type: 'move-expenses',
        fromLineId,
        toLineId,
        activityId: newId('act'),
        at: now(),
        whoId,
      });
      return true;
    },

    addExpense(input) {
      const id = newId('ex');
      insert('expenses', { ...input, id });
      return id;
    },
    updateExpense(id, patch) {
      update('expenses', id, patch);
    },
    deleteExpense(id) {
      const expense = getState().grants.expenses.find(e => e.id === id);
      if (expense?.transactionId) {
        send({ type: 'set-transaction-status', id: expense.transactionId, status: 'to-assign' });
        return;
      }
      // Backup belongs to the expense, so it goes when the expense does.
      const files = getState().grants.files.filter(f => f.expenseId === id);
      send({
        type: 'batch',
        actions: [
          ...files.map((f): GrantsAction => ({ type: 'remove', key: 'files', id: f.id })),
          { type: 'remove', key: 'expenses', id },
        ],
      });
    },

    syncQuickBooks() {
      const arrived = getState().grants.incoming.length;
      const clock = new Date();
      const time = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
      send({ type: 'sync', at: `${today}T${time}` });
      return arrived;
    },
    setQuickBooksConnected(connected) {
      send({ type: 'set-quickbooks', patch: { connected } });
    },
    assignTransaction(id, parts) {
      send(assignAction(id, parts));
    },
    markNotGrantFunded(id) {
      send({
        type: 'set-transaction-status',
        id,
        status: 'not-grant-funded',
        by: user.id,
        date: today,
      });
    },
    unassignTransaction(id) {
      send({ type: 'set-transaction-status', id, status: 'to-assign' });
    },
    restoreTransactions(snapshots) {
      if (snapshots.length) send({ type: 'restore-transactions', snapshots });
    },
    acceptSuggestions() {
      const waiting = acceptableSuggestions(getState() as PortalState);
      const actions: GrantsAction[] = waiting.map(({ tx, suggestion }) => {
        if (suggestion.kind === 'line') {
          return assignAction(tx.id, [
            {
              grantId: suggestion.grantId,
              budgetLineId: suggestion.budgetLineId,
              amount: tx.amount,
            },
          ]);
        }
        if (suggestion.kind === 'split') {
          const amounts = splitByPercent(
            tx.amount,
            suggestion.rule.parts.map(p => p.percent),
          );
          return assignAction(
            tx.id,
            suggestion.rule.parts.map((p, i) => ({
              grantId: p.grantId,
              budgetLineId: p.budgetLineId,
              amount: amounts[i],
            })),
          );
        }
        return {
          type: 'set-transaction-status',
          id: tx.id,
          status: 'not-grant-funded',
          by: user.id,
          date: today,
        };
      });
      if (actions.length) send({ type: 'batch', actions });
      return actions.length;
    },
    saveSplitRule(input) {
      const existing = getState().grants.splitRules.find(r => r.payee === input.payee);
      if (existing) {
        update('splitRules', existing.id, input);
        return existing.id;
      }
      const id = newId('rule');
      insert('splitRules', { ...input, id });
      return id;
    },
    deleteSplitRule(id) {
      remove('splitRules', id);
    },

    addFile(input) {
      const id = newId('file');
      insert('files', { ...input, id, uploadedById: user.id, uploadedAt: today });
      return id;
    },
    updateFile(id, patch) {
      update('files', id, patch);
    },
    deleteFile(id) {
      remove('files', id);
    },

    addTerm(input) {
      const id = newId('term');
      const order = getState().grants.terms.filter(t => t.grantId === input.grantId).length + 1;
      insert('terms', { ...input, id, order });
      return id;
    },
    updateTerm(id, patch) {
      update('terms', id, patch);
    },
    deleteTerm(id) {
      remove('terms', id);
    },

    saveReminderPlan(plan) {
      send({ type: 'save-reminder-plan', plan });
    },
    resetReminderPlan(reportId) {
      send({ type: 'reset-reminder-plan', reportId });
    },
    updateReminderDefaults(patch) {
      send({ type: 'set-reminder-defaults', patch });
    },

    addReport(input) {
      const id = newId('rep');
      insert('reports', { ...input, id });
      return id;
    },
    updateReport(id, patch) {
      update('reports', id, patch);
    },
    deleteReport(id) {
      send({
        type: 'batch',
        actions: [
          { type: 'reset-reminder-plan', reportId: id },
          { type: 'remove', key: 'reports', id },
        ],
      });
    },
    markReportSubmitted(id, date) {
      const report = getState().grants.reports.find(r => r.id === id);
      update('reports', id, { submittedDate: date, status: 'submitted' });
      if (report) {
        logActivity(
          report.grantId,
          `${report.kind === 'final' ? 'Final' : 'Interim'} report submitted`,
        );
      }
    },

    addNote(grantId, text) {
      return logActivity(grantId, text);
    },

    addTemplate(input) {
      const id = newId('tpl');
      insert('templates', {
        ...input,
        id,
        items: input.items.map((item, index) => ({ ...item, id: `${id}-i${index + 1}` })),
      });
      return id;
    },
    updateTemplate(id, patch) {
      update('templates', id, patch);
    },
    deleteTemplate(id) {
      remove('templates', id);
    },
    duplicateTemplate(id) {
      const newTemplateId = newId('tpl');
      send({ type: 'duplicate-template', id, newTemplateId });
      return newTemplateId;
    },
  };
}

/**
 * The collections a grants payload must carry. A payload saved before the
 * money side existed lacks the last six, so it is rejected and reseeded.
 */
const COLLECTIONS: Array<keyof GrantsState> = [
  'accounts',
  'classes',
  'transactions',
  'incoming',
  'splitRules',
  'files',
  'terms',
  'reminderPlans',
  'funders',
  'grants',
  'tasks',
  'documents',
  'payments',
  'budgetLines',
  'expenses',
  'reports',
  'activity',
  'templates',
];

// ---------------------------------------------------------------------------
// Who may change what (decision 0001)
// ---------------------------------------------------------------------------

/**
 * May this role move a grant to this phase? Any move needs the pipeline row;
 * a move into an awarded phase records the award, so it needs "Award, budget,
 * reports" too. Declined and withdrawn are pipeline outcomes. The phase
 * buttons and the store both ask this.
 */
export function mayMoveTo(role: Role, to: Phase): boolean {
  return can(role, 'grants', 'edit') && (!isPostAward(to) || can(role, 'award', 'edit'));
}

/** A file that backs up an expense is money; any other file goes with the grant. */
function fileSubject(expenseId: string | undefined) {
  return expenseId ? 'award' : 'grants';
}

const fileRule: ActionRule<[string, ...unknown[]]> = (user, state, id) =>
  can(user.role, fileSubject(state.grants.files.find(f => f.id === id)?.expenseId), 'edit');

/** Why a budget line with expenses on it is not removed. */
export const LINE_IN_USE_REFUSAL =
  'This line has expenses on it. Move them to another line first, then remove it.';

/** Why a received payment is not deleted. */
export const PAYMENT_RECEIVED_REFUSAL =
  'A payment that has arrived stays on the record. Clear its received date first if it was entered by mistake.';

/** Why a report that has been sent is not deleted. */
export const REPORT_SENT_REFUSAL =
  'A report that has been sent stays on the record. Set its status back first if it was marked by mistake.';

/**
 * What each action needs. The rows are the table's: "Grants: pipeline,
 * checklist, deadlines" (`grants`), "Award, budget, reports" (`award`),
 * "Transactions: assign, split" and the two QuickBooks rows.
 */
const rules: ModuleSlice<GrantsState, GrantsActions>['rules'] = {
  addFunder: 'grants',
  updateFunder: 'grants',
  // Whoever may edit a grant or a funder may archive and restore it (decision 0002).
  archiveFunder: 'grants',
  restoreFunder: 'grants',
  // Bringing in a grant already under way records its award, so it needs
  // "Award, budget, reports" too, and an input the store would not write is refused.
  addGrant: (user, _state, input) => {
    if (!can(user.role, 'grants', 'edit')) return false;
    if (!input?.inFlight) return true;
    if (!can(user.role, 'award', 'edit')) return false;
    return inFlightRefusal(input) ?? true;
  },
  archiveGrant: 'grants',
  restoreGrant: 'grants',
  // The amount awarded is the award's; the rest of a grant's record is the pipeline's.
  updateGrant: (user, _state, _id, patch) =>
    can(user.role, 'grants', 'edit') &&
    (patch.amountAwarded === undefined || can(user.role, 'award', 'edit')),
  transition: (user, _state, _grantId, to) => mayMoveTo(user.role, to),

  addTask: 'grants',
  updateTask: 'grants',
  toggleTask: 'grants',
  deleteTask: 'grants',

  addDocument: 'grants',
  updateDocument: 'grants',
  deleteDocument: 'grants',

  addPayment: 'award',
  updatePayment: 'award',
  // A payment that has arrived is money on the record (decision 0002): it is not
  // removed. One entered by mistake has its received date cleared first.
  deletePayment: (user, state, id) => {
    if (!can(user.role, 'award', 'edit')) return false;
    return state.grants.payments.find(p => p.id === id)?.receivedDate
      ? PAYMENT_RECEIVED_REFUSAL
      : true;
  },
  markPaymentReceived: 'award',

  addBudgetLine: 'award',
  updateBudgetLine: 'award',
  // A line with expenses on it is money (decision 0002): they move first (moveExpenses).
  deleteBudgetLine: (user, state, id) => {
    if (!can(user.role, 'award', 'edit')) return false;
    return state.grants.expenses.some(e => e.budgetLineId === id) ? LINE_IN_USE_REFUSAL : true;
  },
  moveExpenses: 'award',

  addExpense: 'award',
  updateExpense: 'award',
  deleteExpense: 'award',

  syncQuickBooks: 'quickbooks-sync',
  setQuickBooksConnected: 'quickbooks-connect',
  assignTransaction: 'transactions',
  markNotGrantFunded: 'transactions',
  unassignTransaction: 'transactions',
  restoreTransactions: 'transactions',
  acceptSuggestions: 'transactions',
  saveSplitRule: 'transactions',
  deleteSplitRule: 'transactions',

  addFile: (user, _state, input) => can(user.role, fileSubject(input.expenseId), 'edit'),
  updateFile: fileRule,
  deleteFile: fileRule,

  addTerm: 'award',
  updateTerm: 'award',
  deleteTerm: 'award',

  // Report reminders are deadlines.
  saveReminderPlan: 'grants',
  resetReminderPlan: 'grants',
  updateReminderDefaults: 'grants',

  addReport: 'award',
  updateReport: 'award',
  // A report sent to the funder is history (decision 0002), like a payment that
  // has arrived: it is not removed. One marked sent by mistake has its status set back first.
  deleteReport: (user, state, id) => {
    if (!can(user.role, 'award', 'edit')) return false;
    const report = state.grants.reports.find(r => r.id === id);
    return report && !isReportOpen(report) ? REPORT_SENT_REFUSAL : true;
  },
  markReportSubmitted: 'award',

  addNote: 'grants',

  addTemplate: 'grants',
  updateTemplate: 'grants',
  deleteTemplate: 'grants',
  duplicateTemplate: 'grants',
};

/** What each collection's rows are called, for "Couldn't save …". */
const ROW_WORDS: Record<CollectionKey, string> = {
  funders: 'the funder',
  grants: 'the grant',
  tasks: 'the task',
  documents: 'the document',
  payments: 'the payment',
  budgetLines: 'the budget line',
  expenses: 'the expense',
  reports: 'the report',
  activity: 'the note',
  templates: 'the checklist template',
  transactions: 'the transaction',
  splitRules: 'the split rule',
  files: 'the file',
  terms: 'the award term',
};

/** A change in plain words, for "Couldn't save …". */
export function describeChange(action: GrantsAction): string | undefined {
  switch (action.type) {
    case 'batch':
      return action.actions[0] && describeChange(action.actions[0]);
    case 'update':
      return 'archivedAt' in action.patch ? 'the archive change' : ROW_WORDS[action.key];
    case 'insert':
    case 'remove':
      return ROW_WORDS[action.key];
    case 'add-grant':
    case 'transition':
      return 'the grant';
    case 'toggle-task':
      return 'the task';
    case 'duplicate-template':
      return 'the checklist template';
    case 'assign-transaction':
    case 'set-transaction-status':
    case 'restore-transactions':
      return 'the transaction';
    case 'move-expenses':
      return 'the moved expenses';
    case 'sync':
    case 'set-quickbooks':
      return 'the QuickBooks settings';
    case 'save-reminder-plan':
    case 'reset-reminder-plan':
      return 'the reminders';
    case 'set-reminder-defaults':
      return 'the reminder defaults';
  }
  return undefined;
}

export const grantsSlice: ModuleSlice<GrantsState, GrantsActions> = {
  id: 'grants',
  seed: () => makeSeed(),
  empty: () => makeEmpty(),
  reducer(state, action) {
    if (!action.type.startsWith('grants/')) return state;
    return reducer(state, { ...action, type: action.type.slice('grants/'.length) } as GrantsAction);
  },
  createActions,
  rules,
  describe(action) {
    if (!action.type.startsWith('grants/')) return undefined;
    return describeChange({
      ...action,
      type: action.type.slice('grants/'.length),
    } as GrantsAction);
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = raw as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    if (!candidate.quickbooks || !candidate.reminderDefaults) return undefined;
    const state = candidate as unknown as GrantsState;
    const staff = makeCoreSeed().staff;
    return {
      ...state,
      funders: state.funders.map(normaliseArchived),
      grants: state.grants.map(g => normaliseArchived(withPrograms(g))),
      activity: state.activity.map(row => creditActivity(row, staff)),
    };
  },
};

/**
 * A grant saved before a grant could name several programs has `program`, one
 * id; it loads as `programs` with that one in it. A saved list stays as it is.
 */
export function withPrograms(saved: Grant): Grant {
  const { program, ...rest } = saved as Grant & { program?: ProgramId };
  if (Array.isArray(rest.programs) && rest.programs.length > 0) return rest;
  return { ...rest, programs: typeof program === 'string' ? [program] : [] };
}

/**
 * Rows saved before activity carried a staff id named the person instead.
 * A name that matches a seeded person becomes their id; any other name is
 * kept as written, so nothing anyone did loses its credit.
 */
export function creditActivity(
  row: Activity,
  staff: ReadonlyArray<{ id: string; name: string }>,
): Activity {
  if (row.whoId || typeof row.who !== 'string') return row;
  const match = staff.find(s => s.name === row.who);
  if (!match) return row;
  const { who: _who, ...rest } = row;
  return { ...rest, whoId: match.id };
}
