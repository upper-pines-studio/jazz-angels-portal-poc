import { insertRow } from '../../../core/module';
import type { ActionRule, AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import {
  ARCHIVE_FIELDS,
  archiveFields,
  normaliseArchived,
  restoreFields,
} from '../../../core/archive';
import { sliceNullsAsMissing, withoutNulls } from '../../../core/rows';
import type { OptionalFields } from '../../../core/rows';
import { can } from '../../../core/permissions';
import { makeCoreSeed } from '../../../core/seed';
import { programName, targetName } from '../../../core/derive';
import { money } from '../../../core/format';
import { acceptableSuggestions, backupCarry, isReportOpen, splitByPercent } from './money';
import { inFlightRefusal } from './inflight';
import { newRegisterLinks, officeLinkProblem } from './officeDocuments';
import {
  renewInputProblem,
  renewalDates,
  renewalRefusal,
  renewalStartedText,
  renewalTemplateId,
  renewedAsText,
  withRenewalLinks,
} from './renewals';
import { changeProblem, giveProblem, resolveTarget, shareTo } from './shares';
import { availableTransitions, isPostAward, phaseLabel } from './phases';
import { makeEmpty, makeSeed } from './seed';
import { grantsTables } from './tables';
import { instantiateDocumentRegister, instantiateTemplate } from './templates';
import type { PortalState, ProgramId, Role } from '../../../core/types';
import type {
  Activity,
  Allocation,
  AwardTerm,
  DocumentKind,
  BudgetLine,
  ChecklistTemplate,
  Expense,
  Funder,
  Grant,
  GrantDocument,
  GrantFile,
  GrantShare,
  GrantsState,
  GiveShareInput,
  NewGrantInput,
  Payment,
  RenewGrantInput,
  Phase,
  ReminderDefaults,
  ReminderPlan,
  Report,
  ShareChange,
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
  grantShares: GrantShare;
}

type CollectionKey = keyof Collections;

type InsertAction = {
  [K in CollectionKey]: { type: 'insert'; key: K; item: Collections[K] };
}[CollectionKey];

type UpdateAction = {
  [K in CollectionKey]: { type: 'update'; key: K; id: string; patch: Partial<Collections[K]> };
}[CollectionKey];

/**
 * Every change the grants slice makes: a row added, changed or taken away, or
 * several of those as one change. What follows from an action (a new grant's
 * checklist, the parts a reassigned transaction replaces, the files that move
 * with them) is worked out in `createActions`, which reads the state and sends
 * every row it writes, with absolute values (#127). The rest are the demo's
 * stand-in for the QuickBooks sync, the QuickBooks settings and the report
 * reminders, which are not rows with ids: see the reducer.
 */
export type GrantsAction =
  | InsertAction
  | UpdateAction
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'batch'; actions: GrantsAction[] }
  | { type: 'sync'; at: string }
  | { type: 'set-quickbooks'; patch: Partial<GrantsState['quickbooks']> }
  | { type: 'save-reminder-plan'; plan: ReminderPlan }
  | { type: 'reset-reminder-plan'; reportId: string }
  | { type: 'set-reminder-defaults'; patch: Partial<ReminderDefaults> };

const DOLLARS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function withId<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map(row => (row.id === id ? { ...row, ...patch } : row));
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

    case 'insert':
      // Sent twice (a retry), it is still one row.
      return insertRow(state, action.key, action.item);

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

    // The rest are not rows with ids, so the guard in eslint.config.js lets them through by name.
    // eslint-disable-next-line no-restricted-syntax -- the demo's stand-in for the QuickBooks sync; with the backend the sync writes transactions itself (decision 0008)
    case 'sync': {
      // A transaction already pulled is not pulled twice.
      const pulled = new Set(state.transactions.map(t => t.id));
      return {
        ...state,
        quickbooks: { ...state.quickbooks, lastSyncedAt: action.at },
        transactions: [...state.incoming.filter(t => !pulled.has(t.id)), ...state.transactions],
        incoming: [],
      };
    }

    // eslint-disable-next-line no-restricted-syntax -- one settings object, not rows with ids: the patch is the change
    case 'set-quickbooks':
      return { ...state, quickbooks: { ...state.quickbooks, ...action.patch } };

    // eslint-disable-next-line no-restricted-syntax -- a report has at most one plan, found by its reportId, not an id of its own
    case 'save-reminder-plan':
      return {
        ...state,
        reminderPlans: [
          ...state.reminderPlans.filter(p => p.reportId !== action.plan.reportId),
          action.plan,
        ],
      };

    // eslint-disable-next-line no-restricted-syntax -- as save-reminder-plan: by reportId
    case 'reset-reminder-plan':
      return {
        ...state,
        reminderPlans: state.reminderPlans.filter(p => p.reportId !== action.reportId),
      };

    // eslint-disable-next-line no-restricted-syntax -- one settings object, not rows with ids: the patch is the change
    case 'set-reminder-defaults':
      return { ...state, reminderDefaults: { ...state.reminderDefaults, ...action.patch } };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// The rows a compound change writes (#127)
// ---------------------------------------------------------------------------

/** An activity row's id, made before the change is sent, and when and by whom. */
interface Stamp {
  id: string;
  at: string;
  whoId: string;
}

const insertOf = <K extends CollectionKey>(key: K, item: Collections[K]): GrantsAction =>
  ({ type: 'insert', key, item }) as GrantsAction;

const removeOf = (key: CollectionKey, id: string): GrantsAction => ({ type: 'remove', key, id });

const updateOf = <K extends CollectionKey>(
  key: K,
  id: string,
  patch: Partial<Collections[K]>,
): GrantsAction => ({ type: 'update', key, id, patch }) as GrantsAction;

/** The update, or nothing when the row is gone or already reads so. */
function updateIfChanged<K extends CollectionKey>(
  state: GrantsState,
  key: K,
  id: string,
  patch: Partial<Collections[K]>,
): GrantsAction[] {
  const row = (state[key] as Array<{ id: string }>).find(r => r.id === id);
  if (!row) return [];
  const was = row as unknown as Record<string, unknown>;
  const same = Object.entries(patch).every(([field, value]) => was[field] === value);
  return same ? [] : [updateOf(key, id, patch)];
}

/** The patch that makes `row` read exactly as `next`: `next`'s fields, and any it lacks cleared. */
function replacing<T extends object>(row: T, next: T): Partial<T> {
  const cleared = Object.keys(row)
    .filter(field => !(field in next))
    .map(field => [field, undefined]);
  return { ...Object.fromEntries(cleared), ...next };
}

/**
 * Several items' rows in one change, each worked out from the state the items
 * before it leave, as the batch will apply them.
 */
function inTurn<T>(
  state: GrantsState,
  items: readonly T[],
  rowsFor: (state: GrantsState, item: T) => GrantsAction[],
): GrantsAction[] {
  const all: GrantsAction[] = [];
  let now = state;
  for (const item of items) {
    const rows = rowsFor(now, item);
    now = rows.reduce(reducer, now);
    all.push(...rows);
  }
  return all;
}

interface NewGrant {
  grant: Grant;
  funder?: Funder;
  templateId?: string | null;
  excludeTemplateItemIds?: string[];
  includeDocumentRegister: boolean;
  /** By kind, the office document a register row uses (#68): see `newRegisterLinks`. */
  officeDocumentLinks?: Partial<Record<DocumentKind, string>>;
  budgetLines?: BudgetLine[];
  payments?: Payment[];
  reports?: Report[];
  activity: Stamp;
  /** The activity row's text, when it is not "Grant added" (a renewal's). */
  text?: string;
}

/**
 * A new grant's rows: its funder when that is new too, the grant, its
 * checklist from the template as it stands now (`${grant.id}-t1…`), its
 * document register (`${grant.id}-d1…`), a grant brought in's budget,
 * payments and reports, and one activity row.
 */
function newGrantRows(state: GrantsState, input: NewGrant): GrantsAction[] {
  const { grant } = input;
  const template = input.templateId
    ? state.templates.find(t => t.id === input.templateId)
    : undefined;

  // A grant brought in has passed the earlier phases elsewhere: no tasks for them.
  const tasks: Task[] = template
    ? instantiateTemplate(
        template,
        grant,
        input.excludeTemplateItemIds,
        grant.broughtIn?.phase,
      ).map((task, index) => ({ ...task, id: `${grant.id}-t${index + 1}` }))
    : [];

  const documents: GrantDocument[] = input.includeDocumentRegister
    ? instantiateDocumentRegister(
        grant.id,
        grant.createdAt,
        grant.broughtIn ? 'submitted' : 'needed',
        input.officeDocumentLinks,
      ).map((doc, index) => ({ ...doc, id: `${grant.id}-d${index + 1}` }))
    : [];

  return [
    ...(input.funder ? [insertOf('funders', input.funder)] : []),
    insertOf('grants', grant),
    ...tasks.map(task => insertOf('tasks', task)),
    ...documents.map(doc => insertOf('documents', doc)),
    ...(input.budgetLines ?? []).map(line => insertOf('budgetLines', line)),
    ...(input.payments ?? []).map(payment => insertOf('payments', payment)),
    ...(input.reports ?? []).map(report => insertOf('reports', report)),
    insertOf('activity', {
      id: input.activity.id,
      grantId: grant.id,
      at: input.activity.at,
      whoId: input.activity.whoId,
      // One row for a grant brought in, never one per phase it passed.
      text: input.text ?? (grant.broughtIn ? broughtInText(grant.broughtIn.phase) : 'Grant added'),
    }),
  ];
}

/**
 * A move to a new phase: the phase and the dates it implies, merged into the
 * grant's dates as they stand, and the transition's label in the log.
 */
function transitionRows(
  state: GrantsState,
  grantId: string,
  to: Phase,
  payload: TransitionPayload,
  activity: Stamp,
): GrantsAction[] {
  const grant = state.grants.find(g => g.id === grantId);
  if (!grant) return [];

  const date = payload.date ?? activity.at.slice(0, 10);
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

  return [
    updateOf('grants', grant.id, patch),
    insertOf('activity', { ...activity, grantId: grant.id, text: `${label}${reason}` }),
  ];
}

/**
 * Every expense on one line moved to another line of the same grant, only
 * its line changing, and one activity row. Nothing for a refused move or a
 * line with no expenses.
 */
function moveExpensesRows(
  state: GrantsState,
  fromLineId: string,
  toLineId: string,
  activity: Stamp,
): GrantsAction[] {
  if (moveExpensesRefusal(state, fromLineId, toLineId)) return [];
  const from = state.budgetLines.find(l => l.id === fromLineId)!;
  const to = state.budgetLines.find(l => l.id === toLineId)!;
  const moving = state.expenses.filter(e => e.budgetLineId === from.id);
  if (moving.length === 0) return [];
  const total = moving.reduce((sum, e) => sum + e.amount, 0);
  const n = moving.length;
  return [
    // Only the line changes: ids, notes, backup and transaction links stay as they are.
    ...moving.map(e => updateOf('expenses', e.id, { budgetLineId: to.id })),
    insertOf('activity', {
      ...activity,
      grantId: from.grantId,
      text: `Moved ${n} ${n === 1 ? 'expense' : 'expenses'} ($${DOLLARS.format(total)}) from ${from.category} to ${to.category}`,
    }),
  ];
}

/** One part of an assignment, with the ids made for it before the change is sent. */
type AssignedPart = Allocation & { expenseId: string; activityId: string };

/** Who assigned a transaction, on what day, and when the log rows say it happened. */
interface Assigner {
  by: string;
  date: string;
  at: string;
  whoId: string;
}

/**
 * A QuickBooks transaction put on one line, or split across several. The
 * transaction's row says who assigned it. Reassigning keeps the backup
 * (`backupCarry`): a part that stays on its line keeps its expense, updated;
 * every other old part is removed, and its files move and its note goes to
 * the part that takes them. Each new part is a new expense, with the
 * transaction's memo as its note, and each part logs one row.
 */
function assignRows(
  state: GrantsState,
  id: string,
  parts: AssignedPart[],
  who: Assigner,
): GrantsAction[] {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx || !parts.length) return [];

  const old = state.expenses.filter(e => e.transactionId === tx.id);
  const carry = backupCarry(old, parts);
  const expenses: Expense[] = parts.map((part, i) => {
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

  const split = parts.length > 1;
  const activity: Activity[] = parts.map(part => {
    const line = state.budgetLines.find(l => l.id === part.budgetLineId);
    return {
      id: part.activityId,
      grantId: part.grantId,
      at: who.at,
      whoId: who.whoId,
      text: `Assigned $${DOLLARS.format(part.amount)} from ${tx.payee} to ${line?.category ?? 'a budget line'}${
        split ? ` (split of $${DOLLARS.format(tx.amount)})` : ''
      }`,
    };
  });

  return [
    updateOf('transactions', tx.id, {
      status: 'assigned',
      assignedById: who.by,
      assignedAt: who.date,
    }),
    // Reassigning replaces whatever the transaction was on before.
    ...old.filter(e => !carry.kept.includes(e)).map(e => removeOf('expenses', e.id)),
    ...expenses.flatMap((expense, i) => {
      const kept = carry.kept[i];
      return kept
        ? updateIfChanged(state, 'expenses', kept.id, replacing(kept, expense))
        : [insertOf('expenses', expense)];
    }),
    ...state.files.flatMap(f => {
      const to = f.expenseId ? movedTo.get(f.expenseId) : undefined;
      return to
        ? updateIfChanged(state, 'files', f.id, { grantId: to.grantId, expenseId: to.id })
        : [];
    }),
    ...activity.map(row => insertOf('activity', row)),
  ];
}

/**
 * A transaction set aside or sent back: its status, who did it (cleared on
 * Send back), and its parts removed with the files that back them up, since
 * backup belongs to the expense.
 */
function transactionStatusRows(
  state: GrantsState,
  id: string,
  status: 'to-assign' | 'not-grant-funded',
  by?: string,
  date?: string,
): GrantsAction[] {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return [];
  const parts = state.expenses.filter(e => e.transactionId === tx.id);
  const ids = new Set(parts.map(e => e.id));
  return [
    updateOf('transactions', tx.id, {
      status,
      assignedById: status === 'to-assign' ? undefined : by,
      assignedAt: status === 'to-assign' ? undefined : date,
    }),
    ...state.files
      .filter(f => f.expenseId && ids.has(f.expenseId))
      .map(f => removeOf('files', f.id)),
    ...parts.map(e => removeOf('expenses', e.id)),
  ];
}

/**
 * One transaction put back as the snapshot has it: its status, its parts and
 * their files as they were. A part it has now that the snapshot lacks is
 * removed. Backup added to its parts since then follows the same rule as a
 * reassign, so it is not lost; with no part to go to, it goes, as it does on
 * Send back.
 */
function restoreTransactionRows(state: GrantsState, snap: TransactionSnapshot): GrantsAction[] {
  if (!state.transactions.some(t => t.id === snap.id)) return [];
  const now = state.expenses.filter(e => e.transactionId === snap.id);
  const nowIds = new Set(now.map(e => e.id));
  const back = new Map(snap.files.map(f => [f.id, f]));
  const backIds = new Set(snap.expenses.map(e => e.id));
  const carry = backupCarry(now, snap.expenses);
  const target = new Map<string, Expense>();
  carry.kept.forEach((e, i) => e && target.set(e.id, snap.expenses[i]));
  carry.moved.forEach(m => target.set(m.from.id, snap.expenses[m.to]));

  const expenses = snap.expenses.flatMap(e => {
    const row = state.expenses.find(x => x.id === e.id);
    return row
      ? updateIfChanged(state, 'expenses', e.id, replacing(row, e))
      : [insertOf('expenses', e)];
  });
  const files = state.files.flatMap(f => {
    const was = back.get(f.id);
    if (was) return updateIfChanged(state, 'files', f.id, replacing(f, was));
    if (!f.expenseId || !nowIds.has(f.expenseId)) return [];
    const to = target.get(f.expenseId);
    return to
      ? updateIfChanged(state, 'files', f.id, { grantId: to.grantId, expenseId: to.id })
      : [removeOf('files', f.id)];
  });
  const gone = snap.files.filter(f => !state.files.some(x => x.id === f.id));

  return [
    updateOf('transactions', snap.id, {
      status: snap.status,
      assignedById: snap.assignedById,
      assignedAt: snap.assignedAt,
    }),
    ...now.filter(e => !backIds.has(e.id)).map(e => removeOf('expenses', e.id)),
    ...expenses,
    ...files,
    ...gone.map(f => insertOf('files', f)),
  ];
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
  /**
   * "Start next year's" (#67): a new grant at Prospect from this year's, which
   * it names as the grant it renews. It copies the funder, programs (as the
   * input gives them), restriction, owner, whether an LOI is needed and the
   * budget's lines (category, planned amount, QuickBooks accounts; not the
   * class), and gets the renewal checklist and the document register. Nothing
   * else is copied. Both grants log a line, all in one change. Returns the
   * new grant's id.
   */
  renewGrant(input: RenewGrantInput): string;
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
  /** Point a register row at an office document (#68): it shows that document's version instead of its own link. */
  linkDocument(id: string, officeDocumentId: string): void;
  /** Stop a register row using an office document; its own link shows again. */
  unlinkDocument(id: string): void;

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

  /**
   * Give some of a grant's money to a program's fiscal year or to a project
   * (decision 0006), and log it. A program's year defaults to the one the
   * grant period starts in. Giving again to the same program year or project
   * adds to the share it already has. Returns the share's id. Warnings
   * (`giveWarnings`) never stop it.
   */
  giveShare(input: GiveShareInput): string;
  /** Change a share's amount, or the fiscal year a program share counts toward, and log it. */
  changeShare(id: string, change: ShareChange): void;
  /** Take a share back: the money is not yet given again. Logged on the grant. */
  takeBackShare(id: string): void;

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
  getState: () => PortalState,
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

  /** An activity row to send in a batch with the change it describes. */
  const activityRow = (grantId: string, text: string): GrantsAction => ({
    type: 'insert',
    key: 'activity',
    item: { id: newId('act'), grantId, at: now(), whoId, text },
  });

  const insert = <K extends CollectionKey>(key: K, item: Collections[K]) => {
    send({ type: 'insert', key, item } as GrantsAction);
  };
  const update = <K extends CollectionKey>(key: K, id: string, patch: Partial<Collections[K]>) => {
    send({ type: 'update', key, id, patch } as GrantsAction);
  };
  const remove = (key: CollectionKey, id: string) => send({ type: 'remove', key, id });

  /** Several rows as one change, saved together or not at all; nothing to send when there are none. */
  const sendRows = (actions: GrantsAction[]) => {
    if (actions.length) send({ type: 'batch', actions });
  };

  /** An activity row's id and when, for a change that logs one. */
  const stamp = (): Stamp => ({ id: newId('act'), at: now(), whoId });

  /** An assignment's rows, its ids made now so Try again sends the same ones. */
  const assignment = (state: GrantsState, id: string, parts: Allocation[]) =>
    assignRows(
      state,
      id,
      parts.map(part => ({ ...part, expenseId: newId('ex'), activityId: newId('act') })),
      { by: user.id, date: today, at: now(), whoId },
    );

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

      const state = getState();
      const rows = newGrantRows(state.grants, {
        grant,
        funder,
        templateId: input.templateId,
        excludeTemplateItemIds: input.excludeTemplateItemIds,
        includeDocumentRegister: input.includeDocumentRegister ?? true,
        officeDocumentLinks: newRegisterLinks(state, grant),
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
        activity: stamp(),
      });
      sendRows(rows);
      return grantId;
    },
    renewGrant(input) {
      const state = getState().grants;
      const last = state.grants.find(g => g.id === input.grantId);
      if (!last) return '';
      const grantId = newId('g');
      const grant: Grant = {
        id: grantId,
        funderId: last.funderId,
        title: input.title.trim(),
        programs: [...input.programs],
        restriction: last.restriction,
        ownerId: input.ownerId,
        phase: 'prospect',
        loiRequired: last.loiRequired,
        // Only the deadlines, the period and when to start: never a submitted or decided date.
        dates: renewalDates(input.dates),
        createdAt: today,
        renewsGrantId: last.id,
      };
      if (input.amountRequested !== undefined) grant.amountRequested = input.amountRequested;
      if (!grant.loiRequired) delete grant.dates.loiDue;
      // The QuickBooks class names last year's grant, so the lines come without it.
      const budgetLines: BudgetLine[] = state.budgetLines
        .filter(l => l.grantId === last.id)
        .map(l => {
          const line: BudgetLine = {
            id: newId('bl'),
            grantId,
            category: l.category,
            planned: l.planned,
          };
          if (l.accountCodes) line.accountCodes = [...l.accountCodes];
          return line;
        });
      // Two rows in one change: the renewal's a moment later, so it reads first, newest first.
      const at = now();
      const later = new Date(Date.parse(at) + 1).toISOString();
      sendRows([
        ...newGrantRows(state, {
          grant,
          templateId: renewalTemplateId(state.templates),
          includeDocumentRegister: true,
          officeDocumentLinks: newRegisterLinks(getState(), grant),
          budgetLines,
          activity: { id: newId('act'), at: later, whoId },
          text: renewalStartedText(last.title),
        }),
        insertOf('activity', {
          id: newId('act'),
          grantId: last.id,
          at,
          whoId,
          text: renewedAsText(grant.title),
        }),
      ]);
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
      sendRows(transitionRows(getState().grants, grantId, to, payload, stamp()));
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
      const task = getState().grants.tasks.find(t => t.id === id);
      if (!task) return;
      // Sent as the value it is ticked to, never as a flip, so sent twice it stays ticked.
      const done = !task.done;
      update('tasks', id, { done, doneAt: done ? today : undefined });
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
    linkDocument(id, officeDocumentId) {
      update('documents', id, { updatedAt: today, officeDocumentId });
    },
    unlinkDocument(id) {
      update('documents', id, { updatedAt: today, officeDocumentId: undefined });
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
      const state = getState().grants;
      if (moveExpensesRefusal(state, fromLineId, toLineId)) return false;
      sendRows(moveExpensesRows(state, fromLineId, toLineId, stamp()));
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
        sendRows(transactionStatusRows(getState().grants, expense.transactionId, 'to-assign'));
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
      sendRows(assignment(getState().grants, id, parts));
    },
    markNotGrantFunded(id) {
      sendRows(transactionStatusRows(getState().grants, id, 'not-grant-funded', user.id, today));
    },
    unassignTransaction(id) {
      sendRows(transactionStatusRows(getState().grants, id, 'to-assign'));
    },
    restoreTransactions(snapshots) {
      sendRows(inTurn(getState().grants, snapshots, restoreTransactionRows));
    },
    acceptSuggestions() {
      const waiting = acceptableSuggestions(getState() as PortalState);
      // Each proposal's rows read the state the ones before it leave, in one change.
      const rows = inTurn(getState().grants, waiting, (state, { tx, suggestion }) => {
        if (suggestion.kind === 'line') {
          return assignment(state, tx.id, [
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
          return assignment(
            state,
            tx.id,
            suggestion.rule.parts.map((p, i) => ({
              grantId: p.grantId,
              budgetLineId: p.budgetLineId,
              amount: amounts[i],
            })),
          );
        }
        return transactionStatusRows(state, tx.id, 'not-grant-funded', user.id, today);
      });
      sendRows(rows);
      return waiting.length;
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

    giveShare(input) {
      const state = getState() as PortalState;
      const grant = state.grants.grants.find(g => g.id === input.grantId);
      if (!grant) return '';
      const target = resolveTarget(state, grant, input.target, today);
      const name = targetName(state, target);
      const existing = shareTo(state, grant.id, target);
      const id = existing?.id ?? newId('gs');
      const share: GrantsAction = existing
        ? {
            type: 'update',
            key: 'grantShares',
            id,
            patch: { amount: existing.amount + input.amount },
          }
        : {
            type: 'insert',
            key: 'grantShares',
            item: { id, grantId: grant.id, target, amount: input.amount },
          };
      // The share and its activity row are one change: saved together or not at all.
      send({
        type: 'batch',
        actions: [share, activityRow(grant.id, `Gave ${money(input.amount)} to ${name}`)],
      });
      return id;
    },
    changeShare(id, change) {
      const state = getState() as PortalState;
      const share = state.grants.grantShares.find(s => s.id === id);
      if (!share) return;
      const patch: Partial<GrantShare> = {};
      const said: string[] = [];
      if (change.amount !== undefined && change.amount !== share.amount) {
        patch.amount = change.amount;
        said.push(`from ${money(share.amount)} to ${money(change.amount)}`);
      }
      if (
        change.fiscalYear !== undefined &&
        share.target.kind === 'program' &&
        change.fiscalYear !== share.target.fiscalYear
      ) {
        patch.target = { ...share.target, fiscalYear: change.fiscalYear };
        said.push(`from ${share.target.fiscalYear} to ${change.fiscalYear}`);
      }
      if (said.length === 0) return;
      // The year is said in the change itself when it moves.
      const what =
        share.target.kind === 'program' && patch.target
          ? programName(state, share.target.programId)
          : targetName(state, share.target);
      send({
        type: 'batch',
        actions: [
          { type: 'update', key: 'grantShares', id, patch },
          activityRow(share.grantId, `Changed the share to ${what} ${said.join(' and ')}`),
        ],
      });
    },
    takeBackShare(id) {
      const state = getState() as PortalState;
      const share = state.grants.grantShares.find(s => s.id === id);
      if (!share) return;
      send({
        type: 'batch',
        actions: [
          { type: 'remove', key: 'grantShares', id },
          activityRow(
            share.grantId,
            `Took back ${money(share.amount)} from ${targetName(state, share.target)}`,
          ),
        ],
      });
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
      const source = getState().grants.templates.find(t => t.id === id);
      if (!source) return newTemplateId;
      // The copy's items get ids of its own: `${newTemplateId}-i1…`.
      insert('templates', {
        ...source,
        id: newTemplateId,
        name: `${source.name} (copy)`,
        items: source.items.map((item, index) => ({
          ...item,
          id: `${newTemplateId}-i${index + 1}`,
        })),
      });
      return newTemplateId;
    },
  };
}

/** A grants payload as saved: an older grant may carry `program` in place of `programs`. */
type SavedGrants = Omit<GrantsState, 'grants'> & { grants: Array<Grant & { program?: ProgramId }> };

/**
 * The fields each grants record may leave out. Stored as `null`, each loads as
 * a missing field; a `null` in any other field rejects the slice (decision
 * 0008, 2A). A grant's dates are all optional, so a `null` date is dropped too.
 */
const OPTIONAL: OptionalFields<SavedGrants> = {
  funders: [
    'contactName',
    'contactEmail',
    'contactPhone',
    'website',
    'cycleNotes',
    'notes',
    ...ARCHIVE_FIELDS,
  ],
  grants: [
    'amountRequested',
    'amountAwarded',
    'notes',
    'broughtIn',
    'renewsGrantId',
    'program',
    ...ARCHIVE_FIELDS,
  ],
  tasks: ['dueDate', 'assigneeId', 'doneAt'],
  documents: ['url', 'officeDocumentId'],
  payments: ['receivedDate', 'sourcePage'],
  budgetLines: ['accountCodes', 'classId'],
  expenses: ['note', 'transactionId', 'backupNote'],
  reports: ['submittedDate'],
  activity: ['whoId', 'who'],
  templates: ['description'],
  transactions: ['classId', 'assignedById', 'assignedAt'],
  incoming: ['classId', 'assignedById', 'assignedAt'],
  files: ['pages', 'expenseId'],
  terms: ['page'],
};

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

/**
 * May this role start next year's grant from this one (#67)? It adds a grant
 * ("Grants" edit) with budget lines on it ("Award, budget, reports" edit):
 * Admin, Director and Office manager. The button and the store both ask this.
 */
export function mayRenew(role: Role): boolean {
  return can(role, 'grants', 'edit') && can(role, 'award', 'edit');
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
  // A renewal is a new grant with last year's budget lines on it: both rows.
  renewGrant: (user, state, input) => {
    if (!mayRenew(user.role)) return false;
    return renewalRefusal(state, input?.grantId) ?? renewInputProblem(state, input) ?? true;
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

  // A row may use an office document of its kind, or any one when it is Other (#68).
  addDocument: (user, state, input) =>
    can(user.role, 'grants', 'edit') &&
    (officeLinkProblem(state, input.kind, input.officeDocumentId) ?? true),
  updateDocument: (user, state, id, patch) => {
    if (!can(user.role, 'grants', 'edit')) return false;
    const row = state.grants.documents.find(d => d.id === id);
    if (!row) return true;
    const officeDocumentId =
      'officeDocumentId' in patch ? patch.officeDocumentId : row.officeDocumentId;
    if (officeDocumentId === row.officeDocumentId && (patch.kind ?? row.kind) === row.kind)
      return true;
    return (
      officeLinkProblem(state, patch.kind ?? row.kind, officeDocumentId, row.officeDocumentId) ??
      true
    );
  },
  deleteDocument: 'grants',
  linkDocument: (user, state, id, officeDocumentId) => {
    if (!can(user.role, 'grants', 'edit')) return false;
    const row = state.grants.documents.find(d => d.id === id);
    if (!row) return true;
    return officeLinkProblem(state, row.kind, officeDocumentId, row.officeDocumentId) ?? true;
  },
  unlinkDocument: 'grants',

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

  // A grant's shares are money (decision 0001, "Grant shares", #53). A
  // warning never stops one; only what cannot be saved is refused, with why.
  giveShare: (user, state, input) =>
    can(user.role, 'grant-shares', 'edit') && (giveProblem(state, input) ?? true),
  changeShare: (user, state, id, change) =>
    can(user.role, 'grant-shares', 'edit') && (changeProblem(state, id, change) ?? true),
  takeBackShare: 'grant-shares',

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
  grantShares: 'the share',
};

/** A change in plain words, for "Couldn't save …". */
export function describeChange(action: GrantsAction): string | undefined {
  switch (action.type) {
    case 'batch': {
      const rows = action.actions;
      // A new grant, its funder first when that is new too.
      if (rows.some(a => a.type === 'insert' && a.key === 'grants')) return 'the grant';
      // Assigning, setting aside, sending back and Undo all write the transaction's own row.
      if (rows.some(a => a.type === 'update' && a.key === 'transactions')) {
        return 'the transaction';
      }
      // Expenses moved to another line, and the row that logs it.
      const moved = (a: GrantsAction) => a.type === 'update' && a.key === 'expenses';
      const logged = (a: GrantsAction) => a.type === 'insert' && a.key === 'activity';
      if (rows.some(moved) && rows.every(a => moved(a) || logged(a))) {
        return 'the moved expenses';
      }
      return rows[0] && describeChange(rows[0]);
    }
    case 'update':
      return 'archivedAt' in action.patch ? 'the archive change' : ROW_WORDS[action.key];
    case 'insert':
    case 'remove':
      return ROW_WORDS[action.key];
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
  tables: grantsTables,
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
    const loaded = sliceNullsAsMissing(raw as SavedGrants, OPTIONAL);
    if (!loaded) return undefined;
    const candidate = loaded as unknown as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    if (!candidate.quickbooks || !candidate.reminderDefaults) return undefined;
    const state = candidate as unknown as GrantsState;
    const staff = makeCoreSeed().staff;
    return {
      ...state,
      funders: state.funders.map(normaliseArchived),
      // A renewal whose last year's grant is no longer saved loads as a plain grant.
      grants: withRenewalLinks(
        state.grants.map(g => normaliseArchived(withPrograms(withDates(g)))),
      ),
      activity: state.activity.map(row => creditActivity(row, staff)),
      // Saved before shares existed: none (decision 0006).
      grantShares: Array.isArray(candidate.grantShares)
        ? (candidate.grantShares as unknown[]).filter(isGrantShare)
        : [],
    };
  },
};

/** A saved share that can be read: a grant, a program year or a project, and an amount. */
function isGrantShare(raw: unknown): raw is GrantShare {
  const s = raw as Partial<GrantShare> | null;
  if (!s || typeof s.id !== 'string' || typeof s.grantId !== 'string') return false;
  if (typeof s.amount !== 'number') return false;
  const t = s.target;
  if (t?.kind === 'program') {
    return typeof t.programId === 'string' && typeof t.fiscalYear === 'string';
  }
  return t?.kind === 'project' && typeof t.projectId === 'string';
}

/** A grant with its `null` dates left out: every date is optional. */
function withDates(saved: Grant): Grant {
  const dates: unknown = saved.dates;
  if (!dates || typeof dates !== 'object' || !Object.values(dates).includes(null)) return saved;
  return { ...saved, dates: withoutNulls(saved.dates) };
}

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
