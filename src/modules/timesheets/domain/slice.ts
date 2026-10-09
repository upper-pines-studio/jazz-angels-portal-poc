import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import type { PortalState } from '../../../core/types';
import {
  OWN_HOURS_REFUSAL,
  entriesForWeek,
  mayApprove,
  mayLogFor,
  ownDrafts,
  weekStart,
} from './derive';
import { makeEmpty, makeSeed } from './seed';
import type { TimeEntry, TimeEntryStatus, TimesheetsActions, TimesheetsState } from './types';

/**
 * The timesheets slice: its reducer, its actions, and the `declare module` that
 * hangs both off the portal store. Screens reach them as `state.timesheets.*`
 * and `actions.timesheets.*`.
 */

declare module '../../../core/types' {
  interface PortalState {
    timesheets: TimesheetsState;
  }
  interface PortalActions {
    timesheets: TimesheetsActions;
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Every change the timesheets slice makes: an entry added, changed or taken
 * away. Which changes are allowed (only a draft is submitted, an approval
 * stands) is decided in `createActions`, which reads the state first, so one
 * repository `apply` covers every module.
 */
export type TimesheetsAction =
  | { type: 'insert'; key: 'entries'; item: TimeEntry }
  | { type: 'update'; key: 'entries'; id: string; patch: Partial<TimeEntry> }
  | { type: 'remove'; key: 'entries'; id: string }
  | { type: 'batch'; actions: TimesheetsAction[] };

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: TimesheetsState, action: TimesheetsAction): TimesheetsState {
  const rows = state.entries;
  switch (action.type) {
    case 'batch':
      return action.actions.reduce(reducer, state);

    case 'insert':
      // Sent twice (a retry), it is still one entry.
      if (rows.some(e => e.id === action.item.id)) return state;
      return { ...state, entries: [...rows, action.item] };

    case 'update':
      if (!rows.some(e => e.id === action.id)) return state;
      return {
        ...state,
        entries: rows.map(e => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };

    case 'remove':
      if (!rows.some(e => e.id === action.id)) return state;
      return { ...state, entries: rows.filter(e => e.id !== action.id) };

    default:
      return state;
  }
}

/** A change in plain words, for "Couldn't save …". */
export function describeChange(action: TimesheetsAction): string | undefined {
  if (action.type === 'batch') return action.actions[0] && describeChange(action.actions[0]);
  if (action.type === 'update' && action.patch.status === 'approved') return 'the approval';
  return 'the hours';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Hours are logged and approved in quarter-hour steps, never less. */
export function toQuarterHours(hours: number): number {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}

function createActions(
  dispatch: (action: AnyAction) => void,
  getState: () => PortalState,
  ctx: SliceContext,
): TimesheetsActions {
  const { today, newId, user } = ctx;
  /** Every action leaves this module namespaced, so the store can route it. */
  const send = (action: TimesheetsAction) =>
    dispatch({ ...action, type: `timesheets/${action.type}` });
  const entryOf = (id: string) => getState().timesheets.entries.find(e => e.id === id);

  return {
    logHours(input) {
      const id = newId('te');
      send({
        type: 'insert',
        key: 'entries',
        item: {
          id,
          staffId: input.staffId,
          date: input.date,
          programId: input.programId,
          ensembleId: input.ensembleId,
          activity: input.activity,
          hours: toQuarterHours(input.hours),
          status: input.status ?? 'draft',
        },
      });
      return id;
    },
    submitEntry(id) {
      // Only a draft can be handed over; a submitted or approved entry stands.
      if (entryOf(id)?.status !== 'draft') return;
      send({ type: 'update', key: 'entries', id, patch: { status: 'submitted' } });
    },
    submitWeek(weekStartISO) {
      // Only the signed-in person's own drafts; a submitted or approved entry stands.
      // Any day of the week means its Monday-to-Sunday week.
      const drafts = ownDrafts(user, entriesForWeek(getState(), weekStart(weekStartISO)));
      if (drafts.length === 0) return 0;
      send({
        type: 'batch',
        actions: drafts.map(e => ({
          type: 'update',
          key: 'entries',
          id: e.id,
          patch: { status: 'submitted' },
        })),
      });
      return drafts.length;
    },
    approveEntry(id) {
      const entry = entryOf(id);
      if (!entry || entry.status === 'approved') return;
      send({
        type: 'update',
        key: 'entries',
        id,
        patch: { status: 'approved', approvedBy: user.id, approvedAt: today },
      });
    },
    deleteEntry(id) {
      send({ type: 'remove', key: 'entries', id });
    },
  };
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

const STATUSES: TimeEntryStatus[] = ['draft', 'submitted', 'approved'];

export const timesheetsSlice: ModuleSlice<TimesheetsState, TimesheetsActions> = {
  id: 'timesheets',
  seed: () => makeSeed(),
  empty: () => makeEmpty(),
  reducer(state, action) {
    if (!action.type.startsWith('timesheets/')) return state;
    return reducer(state, {
      ...action,
      type: action.type.slice('timesheets/'.length),
    } as TimesheetsAction);
  },
  createActions,
  describe(action) {
    if (!action.type.startsWith('timesheets/')) return undefined;
    return describeChange({
      ...action,
      type: action.type.slice('timesheets/'.length),
    } as TimesheetsAction);
  },
  rules: {
    // Everyone logs their own hours and nobody else's (decision 0001).
    logHours: (user, _state, input) => mayLogFor(user, input.staffId),
    submitEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      return !!entry && mayLogFor(user, entry.staffId);
    },
    // The action itself takes only the signed-in person's drafts.
    submitWeek: user => mayLogFor(user, user.id),
    deleteEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      return !!entry && mayLogFor(user, entry.staffId);
    },
    approveEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      if (!entry) return false;
      if (entry.staffId === user.id) return OWN_HOURS_REFUSAL;
      return mayApprove(user, entry);
    },
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = raw as Partial<TimesheetsState>;
    if (!Array.isArray(candidate.entries)) return undefined;
    return {
      entries: candidate.entries.map(entry => ({
        ...entry,
        hours: typeof entry.hours === 'number' ? entry.hours : 0,
        status: STATUSES.includes(entry.status) ? entry.status : 'draft',
      })),
    };
  },
};
