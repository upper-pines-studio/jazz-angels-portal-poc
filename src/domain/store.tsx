import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { toISO } from './format';
import { availableTransitions } from './phases';
import * as repository from './repository';
import { CURRENT_USER } from './seed';
import { instantiateDocumentRegister, instantiateTemplate } from './templates';
import type {
  Activity,
  AppSettings,
  AppState,
  BudgetLine,
  ChecklistTemplate,
  Expense,
  Funder,
  Grant,
  GrantDocument,
  NewGrantInput,
  Payment,
  Phase,
  Program,
  Report,
  StaffMember,
  Task,
  TransitionPayload,
} from './types';

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** `crypto.randomUUID()` where available, with a plain fallback for old runtimes. */
export function newId(prefix: string): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  const raw =
    typeof cryptoObj?.randomUUID === 'function'
      ? cryptoObj.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw.replace(/-/g, '').slice(0, 10)}`;
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
  staff: StaffMember;
  programs: Program;
  templates: ChecklistTemplate;
}

type CollectionKey = keyof Collections;

type InsertAction = {
  [K in CollectionKey]: { type: 'insert'; key: K; item: Collections[K] };
}[CollectionKey];

type UpdateAction = {
  [K in CollectionKey]: { type: 'update'; key: K; id: string; patch: Partial<Collections[K]> };
}[CollectionKey];

export type StoreAction =
  | { type: 'set-state'; state: AppState }
  | InsertAction
  | UpdateAction
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'batch'; actions: StoreAction[] }
  | { type: 'update-settings'; patch: Partial<AppSettings> }
  | {
      type: 'add-grant';
      grant: Grant;
      funder?: Funder;
      templateId?: string | null;
      excludeTemplateItemIds?: string[];
      includeDocumentRegister: boolean;
      activityId: string;
      at: string;
      who: string;
    }
  | {
      type: 'transition';
      grantId: string;
      to: Phase;
      payload: TransitionPayload;
      activityId: string;
      at: string;
      who: string;
    }
  | { type: 'toggle-task'; id: string; date: string }
  | { type: 'duplicate-template'; id: string; newTemplateId: string };

function withId<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function reducer(state: AppState, action: StoreAction): AppState {
  switch (action.type) {
    case 'set-state':
      return action.state;

    case 'batch':
      return action.actions.reduce(reducer, state);

    case 'insert': {
      const rows = state[action.key] as unknown[];
      return { ...state, [action.key]: [...rows, action.item] } as AppState;
    }

    case 'update': {
      const rows = state[action.key] as Array<{ id: string }>;
      return {
        ...state,
        [action.key]: withId(rows, action.id, action.patch as Partial<{ id: string }>),
      } as AppState;
    }

    case 'remove': {
      const rows = state[action.key] as Array<{ id: string }>;
      return { ...state, [action.key]: rows.filter((row) => row.id !== action.id) } as AppState;
    }

    case 'update-settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'add-grant': {
      const template = action.templateId
        ? state.templates.find((t) => t.id === action.templateId)
        : undefined;

      const tasks: Task[] = template
        ? instantiateTemplate(template, action.grant, action.excludeTemplateItemIds).map(
            (task, index) => ({ ...task, id: `${action.grant.id}-t${index + 1}` }),
          )
        : [];

      const documents: GrantDocument[] = action.includeDocumentRegister
        ? instantiateDocumentRegister(action.grant.id, action.grant.createdAt).map((doc, index) => ({
            ...doc,
            id: `${action.grant.id}-d${index + 1}`,
          }))
        : [];

      return {
        ...state,
        funders: action.funder ? [...state.funders, action.funder] : state.funders,
        grants: [...state.grants, action.grant],
        tasks: [...state.tasks, ...tasks],
        documents: [...state.documents, ...documents],
        activity: [
          ...state.activity,
          {
            id: action.activityId,
            grantId: action.grant.id,
            at: action.at,
            who: action.who,
            text: 'Grant added',
          },
        ],
      };
    }

    case 'transition': {
      const grant = state.grants.find((g) => g.id === action.grantId);
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

      const label =
        availableTransitions(grant).find((t) => t.to === to)?.label ?? `Moved to ${to}`;
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
            who: action.who,
            text: `${label}${reason}`,
          },
        ],
      };
    }

    case 'toggle-task': {
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task) return state;
      const done = !task.done;
      return {
        ...state,
        tasks: withId(state.tasks, action.id, { done, doneAt: done ? action.date : undefined }),
      };
    }

    case 'duplicate-template': {
      const source = state.templates.find((t) => t.id === action.id);
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

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface Actions {
  /** Create a funder. Returns the new funder id. */
  addFunder(input: Omit<Funder, 'id'>): string;
  updateFunder(id: string, patch: Partial<Funder>): void;

  /** Create a grant plus its checklist, document register and "Grant added" activity. */
  addGrant(input: NewGrantInput): string;
  updateGrant(id: string, patch: Partial<Grant>): void;
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
  /** Stamp a payment received and log activity. */
  markPaymentReceived(id: string, date: string): void;

  addBudgetLine(input: Omit<BudgetLine, 'id'>): string;
  updateBudgetLine(id: string, patch: Partial<BudgetLine>): void;
  deleteBudgetLine(id: string): void;

  addExpense(input: Omit<Expense, 'id'>): string;
  deleteExpense(id: string): void;

  addReport(input: Omit<Report, 'id'>): string;
  updateReport(id: string, patch: Partial<Report>): void;
  /** Stamp a report submitted and log activity. */
  markReportSubmitted(id: string, date: string): void;

  /** Free-text note on the activity timeline. Returns the activity row id. */
  addNote(grantId: string, text: string): string;

  addTemplate(input: Omit<ChecklistTemplate, 'id'>): string;
  updateTemplate(id: string, patch: Partial<ChecklistTemplate>): void;
  deleteTemplate(id: string): void;
  /** Copy a template, its items included. Returns the new template id. */
  duplicateTemplate(id: string): string;

  addStaff(input: Omit<StaffMember, 'id'>): string;
  updateStaff(id: string, patch: Partial<StaffMember>): void;

  updateSettings(patch: Partial<AppSettings>): void;

  /** Throw the working data away and reload the demo data set. */
  resetDemo(): void;
  /** Replace all data from an exported file. Throws on an unreadable file. */
  importJson(text: string): void;
  /** The whole data set as pretty JSON, for the download button. */
  exportJson(): string;
}

export interface StoreValue {
  state: AppState;
  /** Today as an ISO `YYYY-MM-DD` string; pass it to every derive function. */
  today: string;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, repository.load);
  const today = useMemo(() => toISO(new Date()), []);

  // The repository is the only writer; every change is persisted.
  useEffect(() => {
    repository.save(state);
  }, [state]);

  // `state` is read only by exportJson, which always wants the latest value.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const actions = useMemo<Actions>(() => {
    const who = CURRENT_USER.name;
    const now = () => new Date().toISOString();

    const logActivity = (grantId: string, text: string): string => {
      const id = newId('act');
      dispatch({
        type: 'insert',
        key: 'activity',
        item: { id, grantId, at: now(), who, text },
      });
      return id;
    };

    const insert = <K extends CollectionKey>(key: K, item: Collections[K]) => {
      dispatch({ type: 'insert', key, item } as StoreAction);
    };
    const update = <K extends CollectionKey>(key: K, id: string, patch: Partial<Collections[K]>) => {
      dispatch({ type: 'update', key, id, patch } as StoreAction);
    };
    const remove = (key: CollectionKey, id: string) => dispatch({ type: 'remove', key, id });

    return {
      addFunder(input) {
        const id = newId('f');
        insert('funders', { ...input, id });
        return id;
      },
      updateFunder(id, patch) {
        update('funders', id, patch);
      },

      addGrant(input) {
        const createdAt = toISO(new Date());
        const grantId = newId('g');

        let funder: Funder | undefined;
        let funderId = input.funderId ?? '';
        if (input.newFunder) {
          funderId = newId('f');
          funder = { ...input.newFunder, id: funderId };
        }

        const grant: Grant = {
          id: grantId,
          funderId,
          title: input.title,
          program: input.program,
          restriction: input.restriction,
          ownerId: input.ownerId,
          phase: input.phase ?? 'prospect',
          loiRequired: input.loiRequired,
          amountRequested: input.amountRequested,
          dates: input.dates ?? {},
          notes: input.notes,
          createdAt,
        };

        dispatch({
          type: 'add-grant',
          grant,
          funder,
          templateId: input.templateId,
          excludeTemplateItemIds: input.excludeTemplateItemIds,
          includeDocumentRegister: input.includeDocumentRegister ?? true,
          activityId: newId('act'),
          at: now(),
          who,
        });
        return grantId;
      },
      updateGrant(id, patch) {
        update('grants', id, patch);
      },
      transition(grantId, to, payload = {}) {
        dispatch({
          type: 'transition',
          grantId,
          to,
          payload,
          activityId: newId('act'),
          at: now(),
          who,
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
        dispatch({ type: 'toggle-task', id, date: toISO(new Date()) });
      },
      deleteTask(id) {
        remove('tasks', id);
      },

      addDocument(input) {
        const id = newId('d');
        insert('documents', { ...input, id, updatedAt: input.updatedAt ?? toISO(new Date()) });
        return id;
      },
      updateDocument(id, patch) {
        update('documents', id, { updatedAt: toISO(new Date()), ...patch });
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
      markPaymentReceived(id, date) {
        const payment = stateRef.current.payments.find((p) => p.id === id);
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

      addExpense(input) {
        const id = newId('ex');
        insert('expenses', { ...input, id });
        return id;
      },
      deleteExpense(id) {
        remove('expenses', id);
      },

      addReport(input) {
        const id = newId('rep');
        insert('reports', { ...input, id });
        return id;
      },
      updateReport(id, patch) {
        update('reports', id, patch);
      },
      markReportSubmitted(id, date) {
        const report = stateRef.current.reports.find((r) => r.id === id);
        update('reports', id, { submittedDate: date, status: 'submitted' });
        if (report) {
          logActivity(report.grantId, `${report.kind === 'final' ? 'Final' : 'Interim'} report submitted`);
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
        dispatch({ type: 'duplicate-template', id, newTemplateId });
        return newTemplateId;
      },

      addStaff(input) {
        const id = newId('s');
        insert('staff', { ...input, id });
        return id;
      },
      updateStaff(id, patch) {
        update('staff', id, patch);
      },

      updateSettings(patch) {
        dispatch({ type: 'update-settings', patch });
      },

      resetDemo() {
        dispatch({ type: 'set-state', state: repository.reset() });
      },
      importJson(text) {
        dispatch({ type: 'set-state', state: repository.importJson(text) });
      },
      exportJson() {
        return repository.exportJson(stateRef.current);
      },
    };
  }, []);

  const value = useMemo<StoreValue>(() => ({ state, today, actions }), [state, today, actions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The one hook every screen uses. Must be inside a `<StoreProvider>`. */
export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside a <StoreProvider>');
  return value;
}
