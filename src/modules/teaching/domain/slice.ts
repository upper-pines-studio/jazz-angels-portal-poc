import { insertRow } from '../../../core/module';
import type { AnyAction, ModuleSlice, SliceContext } from '../../../core/module';
import {
  ARCHIVE_FIELDS,
  PARAMOUNT_MS_VENUE_ID,
  can,
  sliceNullsAsMissing,
  STUDIO_VENUE_ID,
  archiveFields,
  isArchived,
  normaliseArchived,
  restoreFields,
} from '../../../core';
import type { OptionalFields } from '../../../core';
import {
  ensembleRefusal,
  mayTakeRoll,
  normalisePhotoRelease,
  photoReleaseFor,
  photoReleaseRefusal,
  restoreTermRefusal,
  termRefusal,
} from './derive';
import { guardianRefusal, tidyAddress } from './guardian';
import { makeEmpty, makeSeed } from './seed';
import { teachingTables } from './tables';
import type {
  AttendanceRecord,
  ClassMeeting,
  Ensemble,
  EnsembleInput,
  Student,
  StudentInput,
  TeachingActions,
  TeachingState,
  Term,
  TermInput,
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

    case 'insert':
      // Sent twice (a retry), it is still one row.
      return insertRow(state, action.key, action.item);

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
      // An ensemble moved to a new place carries its coming classes with it.
      if (action.actions[0]?.type === 'update' && action.actions[0].key === 'ensembles')
        return 'the ensemble';
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
          return action.type === 'update' && 'photoRelease' in action.patch
            ? 'the photo release'
            : 'the student';
        case 'ensembles':
          return 'the ensemble';
        case 'terms':
          return 'the session';
      }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * A session's own fields, tidied: the name trimmed, the classes planned a
 * whole number, and no program (all programs) unless one is named. An edit
 * back to All programs clears the program.
 */
function termFields(input: TermInput): TermInput {
  return {
    name: input.name.trim(),
    programId: input.programId || undefined,
    start: input.start,
    end: input.end,
    meetingsPlanned: Math.round(input.meetingsPlanned),
  };
}

/** An ensemble's own fields, tidied: the name and room trimmed. */
function ensembleFields(input: EnsembleInput): EnsembleInput {
  return {
    name: input.name.trim(),
    programId: input.programId,
    leadStaffId: input.leadStaffId,
    venueId: input.venueId,
    room: input.room.trim(),
    tone: input.tone,
  };
}

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
  /** An address of four blanks is no address. */
  const withAddress = <T extends Partial<Student>>(fields: T): T =>
    'guardianAddress' in fields
      ? { ...fields, guardianAddress: tidyAddress(fields.guardianAddress) }
      : fields;
  /** A new student as saved: an id, and the photo release stamped with who recorded it. */
  const newStudent = (input: StudentInput): Student => ({
    ...withAddress(input),
    id: newId('st'),
    photoRelease: photoReleaseFor(input.photoRelease, user.id, today),
  });

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
      const student = newStudent(input);
      send(insert('students', student));
      return student.id;
    },
    updateStudent(id, patch) {
      // The photo release is recorded through setPhotoRelease, which says who recorded it.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { photoRelease, id: _id, ...rest } = patch as Partial<Student>;
      send(update('students', id, withAddress(rest)));
    },
    setPhotoRelease(id, release) {
      if (!getState().teaching.students.some(s => s.id === id)) return;
      send(update('students', id, { photoRelease: photoReleaseFor(release, user.id, today) }));
    },
    importStudents(inputs) {
      if (inputs.length === 0) return 0;
      const students = inputs.map(newStudent);
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
    addTerm(input) {
      const id = newId('t');
      send(insert('terms', { ...termFields(input), id }));
      return id;
    },
    updateTerm(id, patch) {
      const current = getState().teaching.terms.find(t => t.id === id);
      if (!current) return;
      send(update('terms', id, termFields({ ...current, ...patch })));
    },
    archiveTerm(id) {
      send(update('terms', id, archiveFields(user, today)));
    },
    restoreTerm(id) {
      send(update('terms', id, restoreFields()));
    },
    addEnsemble(input) {
      const id = newId('e');
      send(insert('ensembles', { ...ensembleFields(input), id }));
      return id;
    },
    updateEnsemble(id, patch) {
      const { ensembles, meetings } = getState().teaching;
      const current = ensembles.find(e => e.id === id);
      if (!current) return;
      const next = ensembleFields({ ...current, ...patch });
      const moved = next.venueId !== current.venueId || next.room !== current.room;
      // Its coming classes that still met at the old place go with it; a past
      // class, or one whose roll is in, is the record of where it met.
      const coming = moved
        ? meetings.filter(
            m =>
              m.ensembleId === id &&
              m.date >= today &&
              !m.rollSubmittedAt &&
              m.venueId === current.venueId &&
              m.room === current.room,
          )
        : [];
      if (coming.length === 0) {
        send(update('ensembles', id, next));
        return;
      }
      send({
        type: 'batch',
        actions: [
          update('ensembles', id, next),
          ...coming.map(m => update('meetings', m.id, { venueId: next.venueId, room: next.room })),
        ],
      });
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
 * The fields each teaching record may leave out. Stored as `null`, each loads
 * as a missing field; a `null` in any other field rejects the slice (decision
 * 0008, 2A). A photo release's date and recorder are checked with the release.
 */
const OPTIONAL: OptionalFields<TeachingState> = {
  terms: ['programId', ...ARCHIVE_FIELDS],
  ensembles: ARCHIVE_FIELDS,
  meetings: ['rollSubmittedAt', 'notes'],
  students: ['guardianPhone', 'guardianEmail', 'guardianAddress', 'ensembleId', ...ARCHIVE_FIELDS],
};

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
  tables: teachingTables,
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
    // A guardian email or address that is not sound is refused, saying why.
    enrollStudent: (user, _state, input) =>
      can(user.role, 'students', 'edit') &&
      ((input.photoRelease && photoReleaseRefusal(input.photoRelease)) ||
        guardianRefusal(input) ||
        true),
    updateStudent: (user, _state, _id, patch) =>
      can(user.role, 'students', 'edit') && (guardianRefusal(patch) ?? true),
    // Whoever may edit the student records the release; seeing it follows guardian contacts.
    setPhotoRelease: (user, _state, _id, release) =>
      can(user.role, 'students', 'edit') && (photoReleaseRefusal(release) ?? true),
    // Each release and guardian is checked as Enroll checks one; one bad row refuses the import, saying why.
    importStudents: (user, _state, inputs) => {
      if (!can(user.role, 'students', 'edit')) return false;
      for (const input of inputs) {
        const problem =
          (input.photoRelease && photoReleaseRefusal(input.photoRelease)) || guardianRefusal(input);
        if (problem) return problem;
      }
      return true;
    },
    // Whoever may edit the record may archive and restore it (decision 0002).
    archiveStudent: 'students',
    restoreStudent: 'students',
    archiveEnsemble: 'schedule',
    restoreEnsemble: 'schedule',
    // Sessions and ensembles are the schedule itself: "Schedule and classes: Edit".
    // A session or an ensemble that could not be saved is refused with what is wrong.
    // Two current sessions for the same program, or for all programs, never
    // overlap (decision 0007): adding, changing or restoring one that would
    // is refused, naming the session it clashes with.
    addTerm: (user, state, input) =>
      can(user.role, 'schedule', 'edit') && (termRefusal(state, input) ?? true),
    updateTerm: (user, state, id, patch) => {
      if (!can(user.role, 'schedule', 'edit')) return false;
      const current = state.teaching.terms.find(t => t.id === id);
      return !current || (termRefusal(state, { ...current, ...patch }, id) ?? true);
    },
    archiveTerm: 'schedule',
    restoreTerm: (user, state, id) =>
      can(user.role, 'schedule', 'edit') && (restoreTermRefusal(state, id) ?? true),
    addEnsemble: (user, state, input) =>
      can(user.role, 'schedule', 'edit') && (ensembleRefusal(state, input) ?? true),
    updateEnsemble: (user, state, id, patch) => {
      if (!can(user.role, 'schedule', 'edit')) return false;
      const current = state.teaching.ensembles.find(e => e.id === id);
      return !current || (ensembleRefusal(state, { ...current, ...patch }, id) ?? true);
    },
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const loaded = sliceNullsAsMissing(raw as TeachingState, OPTIONAL);
    if (!loaded) return undefined;
    const candidate = loaded as unknown as Record<string, unknown>;
    for (const key of COLLECTIONS) {
      if (!Array.isArray(candidate[key])) return undefined;
    }
    const students = (candidate.students as Student[]).map(s =>
      normaliseArchived({
        ...s,
        status: s.status ?? 'enrolled',
        yearsIn: s.yearsIn ?? 1,
        // Saved before photo releases existed: Not asked yet.
        photoRelease: normalisePhotoRelease(s.photoRelease),
      }),
    );
    const ensembles = (candidate.ensembles as Ensemble[]).map(e => normaliseArchived(withVenue(e)));
    const terms = (candidate.terms as Term[]).map(t =>
      normaliseArchived({
        ...t,
        meetingsPlanned:
          typeof t.meetingsPlanned === 'number' && t.meetingsPlanned > 0 ? t.meetingsPlanned : 8,
      }),
    );
    const meetings = (candidate.meetings as ClassMeeting[]).map(withVenue);
    return { ...(candidate as unknown as TeachingState), terms, students, ensembles, meetings };
  },
};
