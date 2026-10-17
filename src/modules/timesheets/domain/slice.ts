import { insertRow } from '../../../core/module';
import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import type { PortalState } from '../../../core/types';
import {
  APPROVED_REFUSAL,
  CHANGE_DRAFT_ONLY_REFUSAL,
  DRAFT_ONLY_REFUSAL,
  OWN_HOURS_REFUSAL,
  OWN_SEND_BACK_REFUSAL,
  SEND_BACK_APPROVED_ONLY_REFUSAL,
  SEND_BACK_REASON_REFUSAL,
  entriesForWeek,
  mayApprove,
  mayLogFor,
  nextEventId,
  ownDrafts,
  rebuildHistory,
  weekStart,
} from './derive';
import { makeEmpty, makeSeed } from './seed';
import type {
  TimeEntry,
  TimeEntryEvent,
  TimeEntryEventKind,
  TimeEntryFieldChanges,
  TimeEntryStatus,
  TimesheetsActions,
  TimesheetsState,
} from './types';

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

/** What an update may set: anything but the id and the history, which is only added to. */
export type TimeEntryPatch = Partial<Omit<TimeEntry, 'id' | 'history'>>;

/**
 * Every change the timesheets slice makes: an entry added, changed or taken
 * away. An update that records a step carries its `event`, which the reducer
 * adds to the entry's history in the same change, so the step and the status
 * it describes save or roll back together (decision 0005). Which changes are allowed (only a draft is changed, submitted or
 * deleted, only a submitted entry is recalled, only an approved one is sent
 * back) is decided in `createActions`, which reads the state first, so one
 * repository `apply` covers every module.
 */
export type TimesheetsAction =
  | { type: 'insert'; key: 'entries'; item: TimeEntry }
  | { type: 'update'; key: 'entries'; id: string; patch: TimeEntryPatch; event?: TimeEntryEvent }
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
      return insertRow(state, 'entries', action.item);

    case 'update': {
      if (!rows.some(e => e.id === action.id)) return state;
      // The history is never replaced through a patch, only added to through `event`.
      const patch: Partial<TimeEntry> = { ...action.patch };
      delete patch.id;
      delete patch.history;
      const event = action.event;
      return {
        ...state,
        entries: rows.map(e => {
          if (e.id !== action.id) return e;
          const history = e.history ?? [];
          // Sent twice (a retry), it is still one step.
          const add = event && !history.some(h => h.id === event.id);
          return { ...e, ...patch, history: add ? [...history, event] : history };
        }),
      };
    }

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
  if (action.type === 'update' && action.patch.sentBackBy) return 'sending the hours back';
  return 'the hours';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Hours are logged and approved in quarter-hour steps, never less. */
export function toQuarterHours(hours: number): number {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}

/** The fields a change to a draft alters, each with its value before and after. */
function fieldChanges(
  entry: TimeEntry,
  next: Omit<TimeEntryPatch, 'status'>,
): TimeEntryFieldChanges {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of ['date', 'programId', 'ensembleId', 'activity', 'hours'] as const) {
    if (entry[key] !== next[key]) changes[key] = { from: entry[key], to: next[key] };
  }
  return changes as TimeEntryFieldChanges;
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
  /**
   * An update that records one step in the entry's history, credited to the
   * signed-in person and today, in the same change.
   */
  const step = (
    entry: TimeEntry,
    kind: TimeEntryEventKind,
    patch: TimeEntryPatch,
    extra: Pick<TimeEntryEvent, 'reason' | 'changes'> = {},
  ): TimesheetsAction => ({
    type: 'update',
    key: 'entries',
    id: entry.id,
    patch,
    event: { id: nextEventId(entry), kind, whoId: user.id, at: today, ...extra },
  });
  /** Submitting clears the office's reason: the person has dealt with it. Who and when stay. */
  const submitStep = (entry: TimeEntry): TimesheetsAction =>
    step(
      entry,
      'submitted',
      entry.sentBackReason
        ? { status: 'submitted', sentBackReason: undefined }
        : { status: 'submitted' },
    );

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
          history: [{ id: `${id}:1`, kind: 'logged', whoId: user.id, at: today }],
        },
      });
      return id;
    },
    submitEntry(id) {
      // Only a draft can be handed over; a submitted or approved entry stands.
      const entry = entryOf(id);
      if (entry?.status !== 'draft') return;
      send(submitStep(entry));
    },
    submitWeek(weekStartISO) {
      // Only the signed-in person's own drafts; a submitted or approved entry stands.
      // Any day of the week means its Monday-to-Sunday week.
      const drafts = ownDrafts(user, entriesForWeek(getState(), weekStart(weekStartISO)));
      if (drafts.length === 0) return 0;
      send({ type: 'batch', actions: drafts.map(submitStep) });
      return drafts.length;
    },
    approveEntry(id) {
      const entry = entryOf(id);
      if (!entry || entry.status === 'approved') return;
      send(step(entry, 'approved', { status: 'approved', approvedBy: user.id, approvedAt: today }));
    },
    sendBackEntry(id, reason) {
      // Only an approved entry goes back, and only with a reason to fix it by.
      // The approval it clears from the entry stays in the history.
      const why = reason.trim();
      const entry = entryOf(id);
      if (entry?.status !== 'approved' || !why) return;
      send(
        step(
          entry,
          'sent-back',
          {
            status: 'draft',
            approvedBy: undefined,
            approvedAt: undefined,
            sentBackBy: user.id,
            sentBackAt: today,
            sentBackReason: why,
          },
          { reason: why },
        ),
      );
    },
    changeEntry(id, changes) {
      // Only a draft changes; submitted and approved hours stand.
      const entry = entryOf(id);
      if (entry?.status !== 'draft') return;
      const next = {
        date: changes.date,
        programId: changes.programId,
        ensembleId: changes.ensembleId,
        activity: changes.activity,
        hours: toQuarterHours(changes.hours),
      };
      const altered = fieldChanges(entry, next);
      // Saved as it was, nothing happened, so there is nothing to record.
      if (Object.keys(altered).length === 0) return;
      send(step(entry, 'changed', next, { changes: altered }));
    },
    recallEntry(id) {
      // Only a submitted entry comes back; a draft is already back, an approval stands.
      const entry = entryOf(id);
      if (entry?.status !== 'submitted') return;
      send(step(entry, 'recalled', { status: 'draft' }));
    },
    deleteEntry(id) {
      // Only a draft is a mistake to take away; submitted and approved hours stay.
      if (entryOf(id)?.status !== 'draft') return;
      send({ type: 'remove', key: 'entries', id });
    },
  };
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

const STATUSES: TimeEntryStatus[] = ['draft', 'submitted', 'approved'];
const KINDS: TimeEntryEventKind[] = [
  'logged',
  'changed',
  'submitted',
  'recalled',
  'approved',
  'sent-back',
];

/** A saved step the dialog can read: an id, a kind it knows and who did it. */
function isEvent(raw: unknown): raw is TimeEntryEvent {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Partial<TimeEntryEvent>;
  return (
    typeof e.id === 'string' && typeof e.whoId === 'string' && !!e.kind && KINDS.includes(e.kind)
  );
}

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
    // Your own, while it is still a draft (decision 0002: approved hours are money).
    deleteEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      if (!entry || !mayLogFor(user, entry.staffId)) return false;
      return entry.status === 'draft' ? true : DRAFT_ONLY_REFUSAL;
    },
    // Your own, until the office approves it.
    recallEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      if (!entry || !mayLogFor(user, entry.staffId)) return false;
      return entry.status === 'approved' ? APPROVED_REFUSAL : true;
    },
    // Your own, while it is a draft (a sent-back one included).
    changeEntry: (user, state, id) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      if (!entry || !mayLogFor(user, entry.staffId)) return false;
      return entry.status === 'draft' ? true : CHANGE_DRAFT_ONLY_REFUSAL;
    },
    // Whoever may approve it, never on their own hours, and always with a reason (decision 0001).
    sendBackEntry: (user, state, id, reason) => {
      const entry = state.timesheets.entries.find(e => e.id === id);
      if (!entry) return false;
      if (entry.staffId === user.id) return OWN_SEND_BACK_REFUSAL;
      if (!mayApprove(user, entry)) return false;
      if (entry.status !== 'approved') return SEND_BACK_APPROVED_ONLY_REFUSAL;
      return typeof reason === 'string' && reason.trim() ? true : SEND_BACK_REASON_REFUSAL;
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
      entries: candidate.entries.map(raw => {
        const entry = {
          ...raw,
          hours: typeof raw.hours === 'number' ? raw.hours : 0,
          status: STATUSES.includes(raw.status) ? raw.status : 'draft',
        };
        // An entry saved before the history was kept gets what its fields can tell (#95).
        const kept = Array.isArray(raw.history) ? raw.history.filter(isEvent) : [];
        return { ...entry, history: kept.length > 0 ? kept : rebuildHistory(entry) };
      }),
    };
  },
};
