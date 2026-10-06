import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import type { PortalState } from '../../../core/types';
import { OWN_HOURS_REFUSAL, mayApprove, mayLogFor } from './derive';
import { makeSeed } from './seed';
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

export type TimesheetsAction =
  | { type: 'log'; entry: TimeEntry }
  | { type: 'submit'; id: string }
  | { type: 'approve'; id: string; by: string; at: string }
  | { type: 'delete'; id: string };

function patch(
  state: TimesheetsState,
  id: string,
  change: (entry: TimeEntry) => TimeEntry | undefined,
): TimesheetsState {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return state;
  const next = change(entry);
  if (!next) return state;
  return { ...state, entries: state.entries.map(e => (e.id === id ? next : e)) };
}

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: TimesheetsState, action: TimesheetsAction): TimesheetsState {
  switch (action.type) {
    case 'log':
      return { ...state, entries: [...state.entries, action.entry] };

    case 'submit':
      // Only a draft can be handed over; a submitted or approved entry stands.
      return patch(state, action.id, entry =>
        entry.status === 'draft' ? { ...entry, status: 'submitted' } : undefined,
      );

    case 'approve':
      return patch(state, action.id, entry =>
        entry.status === 'approved'
          ? undefined
          : { ...entry, status: 'approved', approvedBy: action.by, approvedAt: action.at },
      );

    case 'delete':
      return { ...state, entries: state.entries.filter(e => e.id !== action.id) };

    default:
      return state;
  }
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
  _getState: () => PortalState,
  ctx: SliceContext,
): TimesheetsActions {
  const { today, newId, user } = ctx;
  /** Every action leaves this module namespaced, so the store can route it. */
  const send = (action: TimesheetsAction) =>
    dispatch({ ...action, type: `timesheets/${action.type}` });

  return {
    logHours(input) {
      const id = newId('te');
      send({
        type: 'log',
        entry: {
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
      send({ type: 'submit', id });
    },
    approveEntry(id) {
      send({ type: 'approve', id, by: user.id, at: today });
    },
    deleteEntry(id) {
      send({ type: 'delete', id });
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
  reducer(state, action) {
    if (!action.type.startsWith('timesheets/')) return state;
    return reducer(state, {
      ...action,
      type: action.type.slice('timesheets/'.length),
    } as TimesheetsAction);
  },
  createActions,
  rules: {
    // Everyone logs their own hours and nobody else's (decision 0001).
    logHours: (user, _state, input) => mayLogFor(user, input.staffId),
    submitEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      return !!entry && mayLogFor(user, entry.staffId);
    },
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
