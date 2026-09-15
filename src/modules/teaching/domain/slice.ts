import type { AnyAction, ModuleSlice } from '../../../core/module';
import { makeSeed } from './seed';
import type {
  AttendanceRecord,
  ClassMeeting,
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
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

/** The module's own reducer. The store only ever reaches it through the slice. */
export function reducer(state: TeachingState, action: TeachingAction): TeachingState {
  switch (action.type) {
    case 'add-meeting':
      return { ...state, meetings: [...state.meetings, action.meeting] };

    case 'set-mark': {
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      // A submitted roll call is the record. Reopen it before changing a mark.
      if (!meeting || meeting.rollSubmittedAt) return state;

      const existing = state.attendance.find(
        (a) => a.meetingId === action.meetingId && a.studentId === action.studentId,
      );
      if (existing) {
        if (existing.mark === action.mark) return state;
        return { ...state, attendance: withId(state.attendance, existing.id, { mark: action.mark }) };
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
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      if (!meeting) return state;
      return {
        ...state,
        meetings: withId(state.meetings, meeting.id, {
          rollSubmittedAt: action.at,
          notes: action.notes ?? meeting.notes,
        }),
      };
    }

    case 'reopen-roll-call': {
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      if (!meeting?.rollSubmittedAt) return state;
      const { rollSubmittedAt: _closed, ...open } = meeting;
      return { ...state, meetings: state.meetings.map((m) => (m.id === meeting.id ? open : m)) };
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
  ctx: { today: string; newId(prefix: string): string },
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
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const candidate = raw as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    const students = (candidate.students as Student[]).map((s) => ({
      ...s,
      status: s.status ?? 'enrolled',
      yearsIn: s.yearsIn ?? 1,
    }));
    return { ...(candidate as unknown as TeachingState), students };
  },
};
