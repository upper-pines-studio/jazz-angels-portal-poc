import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import { PARAMOUNT_MS_VENUE_ID, STUDIO_VENUE_ID } from '../../../core';
import { mayTakeRoll } from './derive';
import { makeSeed } from './seed';
import type {
  AttendanceRecord,
  ClassMeeting,
  Ensemble,
  Mark,
  Student,
  TeachingActions,
  TeachingState,
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

export type TeachingAction =
  | { type: 'add-meeting'; meeting: ClassMeeting }
  | { type: 'set-mark'; recordId: string; meetingId: string; studentId: string; mark: Mark }
  | { type: 'submit-roll-call'; meetingId: string; at: string; notes?: string }
  | { type: 'reopen-roll-call'; meetingId: string }
  | { type: 'enroll-student'; student: Student }
  | { type: 'update-student'; id: string; patch: Partial<Student> };

function withId<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map(row => (row.id === id ? { ...row, ...patch } : row));
}

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: TeachingState, action: TeachingAction): TeachingState {
  switch (action.type) {
    case 'add-meeting':
      return { ...state, meetings: [...state.meetings, action.meeting] };

    case 'set-mark': {
      const meeting = state.meetings.find(m => m.id === action.meetingId);
      // A submitted roll call is the record. Reopen it before changing a mark.
      if (!meeting || meeting.rollSubmittedAt) return state;

      const existing = state.attendance.find(
        a => a.meetingId === action.meetingId && a.studentId === action.studentId,
      );
      if (existing) {
        if (existing.mark === action.mark) return state;
        return {
          ...state,
          attendance: withId(state.attendance, existing.id, { mark: action.mark }),
        };
      }
      const record: AttendanceRecord = {
        id: action.recordId,
        meetingId: action.meetingId,
        studentId: action.studentId,
        mark: action.mark,
      };
      return { ...state, attendance: [...state.attendance, record] };
    }

    case 'submit-roll-call': {
      const meeting = state.meetings.find(m => m.id === action.meetingId);
      if (!meeting) return state;
      // Everyone starts present: whoever on the roster was not marked late or
      // absent is written down as present.
      const marked = new Set(
        state.attendance.filter(a => a.meetingId === meeting.id).map(a => a.studentId),
      );
      const present: AttendanceRecord[] = state.students
        .filter(
          s => s.status === 'enrolled' && s.ensembleId === meeting.ensembleId && !marked.has(s.id),
        )
        .map(s => ({
          id: `att-${meeting.id}-${s.id}`,
          meetingId: meeting.id,
          studentId: s.id,
          mark: 'present',
        }));
      return {
        ...state,
        attendance: present.length ? [...state.attendance, ...present] : state.attendance,
        meetings: withId(state.meetings, meeting.id, {
          rollSubmittedAt: action.at,
          notes: action.notes ?? meeting.notes,
        }),
      };
    }

    case 'reopen-roll-call': {
      const meeting = state.meetings.find(m => m.id === action.meetingId);
      if (!meeting?.rollSubmittedAt) return state;
      const { rollSubmittedAt: _closed, ...open } = meeting;
      return { ...state, meetings: state.meetings.map(m => (m.id === meeting.id ? open : m)) };
    }

    case 'enroll-student':
      return { ...state, students: [...state.students, action.student] };

    case 'update-student':
      return { ...state, students: withId(state.students, action.id, action.patch) };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function createActions(
  dispatch: (action: AnyAction) => void,
  _getState: () => { teaching: TeachingState },
  ctx: SliceContext,
): TeachingActions {
  const { newId } = ctx;
  /** Every action leaves this module namespaced, so the store can route it. */
  const send = (action: TeachingAction) => dispatch({ ...action, type: `teaching/${action.type}` });

  return {
    addMeeting(input) {
      const id = newId('m');
      send({ type: 'add-meeting', meeting: { ...input, id } });
      return id;
    },
    setMark(meetingId, studentId, mark) {
      send({ type: 'set-mark', recordId: newId('att'), meetingId, studentId, mark });
    },
    submitRollCall(meetingId, notes) {
      send({ type: 'submit-roll-call', meetingId, at: new Date().toISOString(), notes });
    },
    reopenRollCall(meetingId) {
      send({ type: 'reopen-roll-call', meetingId });
    },
    enrollStudent(input) {
      const id = newId('st');
      send({ type: 'enroll-student', student: { ...input, id } });
      return id;
    },
    updateStudent(id, patch) {
      send({ type: 'update-student', id, patch });
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
  reducer(state, action) {
    if (!action.type.startsWith('teaching/')) return state;
    return reducer(state, {
      ...action,
      type: action.type.slice('teaching/'.length),
    } as TeachingAction);
  },
  createActions,
  rules: {
    addMeeting: 'schedule',
    // A teacher takes roll for the classes they lead; the office for any class.
    setMark: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    submitRollCall: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    reopenRollCall: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
    // The roster changes with "Students: Edit"; a teacher's "Own classes" is to see it.
    enrollStudent: 'students',
    updateStudent: 'students',
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = raw as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    const students = (candidate.students as Student[]).map(s => ({
      ...s,
      status: s.status ?? 'enrolled',
      yearsIn: s.yearsIn ?? 1,
    }));
    const ensembles = (candidate.ensembles as Ensemble[]).map(withVenue);
    const meetings = (candidate.meetings as ClassMeeting[]).map(withVenue);
    return { ...(candidate as unknown as TeachingState), students, ensembles, meetings };
  },
};
