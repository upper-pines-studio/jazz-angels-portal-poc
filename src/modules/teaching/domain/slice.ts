import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import {
  PARAMOUNT_MS_VENUE_ID,
  STUDIO_VENUE_ID,
  archiveFields,
  isArchived,
  normaliseArchived,
  restoreFields,
} from '../../../core';
import { mayTakeRoll } from './derive';
import { makeEmpty, makeSeed } from './seed';
import type {
  AttendanceRecord,
  ClassMeeting,
  Ensemble,
  Student,
  TeachingActions,
  TeachingState,
  Term,
} from './types';

/**
 * The teaching slice: its reducer, its actions, and the `declare module` that
 * hangs both off the portal store. Screens reach them as `state.teaching.*`
 * and `actions.teaching.*`.
 */

declare module '../../../core/types' {
  interface PortalState {
    teaching: TeachingState;
  }
  interface PortalActions {
    teaching: TeachingActions;
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** The rows each collection holds, so `insert` and `update` stay typed per key. */
interface Collections {
  terms: Term;
  ensembles: Ensemble;
  meetings: ClassMeeting;
  students: Student;
  attendance: AttendanceRecord;
}

type CollectionKey = keyof Collections;

type InsertAction = {
  [K in CollectionKey]: { type: 'insert'; key: K; item: Collections[K] };
}[CollectionKey];

type UpdateAction = {
  [K in CollectionKey]: { type: 'update'; key: K; id: string; patch: Partial<Collections[K]> };
}[CollectionKey];

/**
 * Every change the teaching slice makes: a row added, changed or taken away,
 * or several of those as one change. The rules (a submitted roll is closed,
 * the unmarked go down as present) live in `createActions`, which reads the
 * state and sends the rows that follow from it, so one repository `apply`
 * covers every module.
 */
export type TeachingAction =
  | InsertAction
  | UpdateAction
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'batch'; actions: TeachingAction[] };

type Row = { id: string };

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: TeachingState, action: TeachingAction): TeachingState {
  switch (action.type) {
    case 'batch':
      return action.actions.reduce(reducer, state);

    case 'insert': {
      const rows = state[action.key] as Row[];
      // Sent twice (a retry), it is still one row.
      if (rows.some(row => row.id === action.item.id)) return state;
      return { ...state, [action.key]: [...rows, action.item] };
    }

    case 'update': {
      const rows = state[action.key] as Row[];
      if (!rows.some(row => row.id === action.id)) return state;
      return {
        ...state,
        [action.key]: rows.map(row => (row.id === action.id ? { ...row, ...action.patch } : row)),
      };
    }

    case 'remove': {
      const rows = state[action.key] as Row[];
      if (!rows.some(row => row.id === action.id)) return state;
      return { ...state, [action.key]: rows.filter(row => row.id !== action.id) };
    }

    default:
      return state;
  }
}

/** A change in plain words, for "Couldn't save …". */
export function describeChange(action: TeachingAction): string | undefined {
  switch (action.type) {
    case 'batch': {
      const closesRoll = action.actions.some(
        a => a.type === 'update' && a.key === 'meetings' && 'rollSubmittedAt' in a.patch,
      );
      if (closesRoll) return 'the roll call';
      if (action.actions.length > 1 && action.actions.every(a => a.type === 'insert'))
        return action.actions[0].key === 'students' ? 'the imported students' : undefined;
      return action.actions[0] && describeChange(action.actions[0]);
    }
    case 'insert':
    case 'update':
    case 'remove':
      if (action.type === 'update' && 'archivedAt' in action.patch) return 'the archive change';
      switch (action.key) {
        case 'attendance':
          return 'the roll call mark';
        case 'meetings':
          return action.type === 'update' && 'rollSubmittedAt' in action.patch
            ? 'the roll call'
            : 'the class';
        case 'students':
          return 'the student';
        case 'ensembles':
          return 'the ensemble';
        case 'terms':
          return 'the term';
      }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function createActions(
  dispatch: (action: AnyAction) => void,
  getState: () => { teaching: TeachingState },
  ctx: SliceContext,
): TeachingActions {
  const { newId, today, user } = ctx;
  /** Every action leaves this module namespaced, so the store can route it. */
  const send = (action: TeachingAction) => dispatch({ ...action, type: `teaching/${action.type}` });
  const insert = <K extends CollectionKey>(key: K, item: Collections[K]): TeachingAction =>
    ({ type: 'insert', key, item }) as TeachingAction;
  const update = <K extends CollectionKey>(
    key: K,
    id: string,
    patch: Partial<Collections[K]>,
  ): TeachingAction => ({ type: 'update', key, id, patch }) as TeachingAction;
  const meetingOf = (id: string) => getState().teaching.meetings.find(m => m.id === id);

  return {
    addMeeting(input) {
      const id = newId('m');
      send(insert('meetings', { ...input, id }));
      return id;
    },
    setMark(meetingId, studentId, mark) {
      const meeting = meetingOf(meetingId);
      // A submitted roll call is the record. Reopen it before changing a mark.
      if (!meeting || meeting.rollSubmittedAt) return;
      const existing = getState().teaching.attendance.find(
        a => a.meetingId === meetingId && a.studentId === studentId,
      );
      if (existing) {
        if (existing.mark !== mark) send(update('attendance', existing.id, { mark }));
        return;
      }
      send(insert('attendance', { id: newId('att'), meetingId, studentId, mark }));
    },
    submitRollCall(meetingId, notes) {
      const meeting = meetingOf(meetingId);
      if (!meeting) return;
      const { attendance, students } = getState().teaching;
      // Everyone starts present: whoever on the roster was not marked late or
      // absent is written down as present.
      const marked = new Set(
        attendance.filter(a => a.meetingId === meeting.id).map(a => a.studentId),
      );
      const present = students
        .filter(
          s =>
            s.status === 'enrolled' &&
            !isArchived(s) &&
            s.ensembleId === meeting.ensembleId &&
            !marked.has(s.id),
        )
        .map(s =>
          insert('attendance', {
            id: `att-${meeting.id}-${s.id}`,
            meetingId: meeting.id,
            studentId: s.id,
            mark: 'present',
          }),
        );
      // The marks and the closed roll are one change: saved together or not at all.
      send({
        type: 'batch',
        actions: [
          ...present,
          update('meetings', meeting.id, {
            rollSubmittedAt: new Date().toISOString(),
            notes: notes ?? meeting.notes,
          }),
        ],
      });
    },
    reopenRollCall(meetingId) {
      if (!meetingOf(meetingId)?.rollSubmittedAt) return;
      send(update('meetings', meetingId, { rollSubmittedAt: undefined }));
    },
    enrollStudent(input) {
      const id = newId('st');
      send(insert('students', { ...input, id }));
      return id;
    },
    updateStudent(id, patch) {
      send(update('students', id, patch));
    },
    importStudents(inputs) {
      if (inputs.length === 0) return 0;
      const students = inputs.map(input => ({ ...input, id: newId('st') }));
      send({ type: 'batch', actions: students.map(s => insert('students', s)) });
      return students.length;
    },
    archiveStudent(id) {
      send(update('students', id, archiveFields(user, today)));
    },
    restoreStudent(id) {
      send(update('students', id, restoreFields()));
    },
    archiveEnsemble(id) {
      send(update('ensembles', id, archiveFields(user, today)));
    },
    restoreEnsemble(id) {
      send(update('ensembles', id, restoreFields()));
    },
  };
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

/** The five collections a teaching payload must carry. */
const COLLECTIONS: Array<keyof TeachingState> = [
  'terms',
  'ensembles',
  'meetings',
  'students',
  'attendance',
];

/**
 * A payload saved before venues existed named the place with `room` alone,
 * and wrote "Off-site" for the one in-school ensemble. Give it a venue.
 */
function withVenue<T extends { venueId?: string; room: string }>(row: T): T {
  if (row.venueId) return row;
  if (row.room === 'Off-site')
    return { ...row, venueId: PARAMOUNT_MS_VENUE_ID, room: 'Band room B-12' };
  return { ...row, venueId: STUDIO_VENUE_ID };
}

export const teachingSlice: ModuleSlice<TeachingState, TeachingActions> = {
  id: 'teaching',
  seed: () => makeSeed(),
  empty: () => makeEmpty(),
  reducer(state, action) {
    if (!action.type.startsWith('teaching/')) return state;
    return reducer(state, {
      ...action,
      type: action.type.slice('teaching/'.length),
    } as TeachingAction);
  },
  createActions,
  describe(action) {
    if (!action.type.startsWith('teaching/')) return undefined;
    return describeChange({
      ...action,
      type: action.type.slice('teaching/'.length),
    } as TeachingAction);
  },
  rules: {
    addMeeting: 'schedule',
    // A teacher takes roll for the classes they lead; the office for any class.
    setMark: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    submitRollCall: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    reopenRollCall: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    // The roster changes with "Students: Edit"; a teacher's "Own classes" is to see it.
    enrollStudent: 'students',
    updateStudent: 'students',
    importStudents: 'students',
    // Whoever may edit the record may archive and restore it (decision 0002).
    archiveStudent: 'students',
    restoreStudent: 'students',
    archiveEnsemble: 'schedule',
    restoreEnsemble: 'schedule',
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = raw as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    const students = (candidate.students as Student[]).map(s =>
      normaliseArchived({
        ...s,
        status: s.status ?? 'enrolled',
        yearsIn: s.yearsIn ?? 1,
      }),
    );
    const ensembles = (candidate.ensembles as Ensemble[]).map(e => normaliseArchived(withVenue(e)));
    const meetings = (candidate.meetings as ClassMeeting[]).map(withVenue);
    return { ...(candidate as unknown as TeachingState), students, ensembles, meetings };
  },
};
