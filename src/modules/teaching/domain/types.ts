import type { Archivable, ProgramId } from '../../../core';

/**
 * The teaching module's nouns: a term, the ensembles that meet inside it, the
 * meetings themselves, the students on the roster, and one attendance mark per
 * student per meeting.
 *
 * Conventions: dates are ISO `YYYY-MM-DD`, times are 24-hour `HH:MM` strings,
 * and both are formatted only at render time.
 */

/** Which brand hue identifies an ensemble on the week grid. */
export type EnsembleTone = 'blue' | 'teal' | 'olive' | 'gold' | 'neutral';

/** What a teacher can record for one student at one meeting. */
export type Mark = 'present' | 'late' | 'absent';

export type StudentStatus = 'enrolled' | 'waitlist' | 'alumni';

/** A session: the eight weeks the office plans and reports on. */
export interface Term {
  id: string;
  /** "Fall 2026 session". */
  name: string;
  /** Set when a term belongs to one program; the studio sessions span all of them. */
  programId?: ProgramId;
  start: string;
  end: string;
  /** How many times each ensemble is scheduled to meet. */
  meetingsPlanned: number;
}

/**
 * A standing group: the same students, the same place, the same hour each week.
 * Archived (decision 0002) when it stops meeting: its classes on and after the
 * archive date leave the week grid, and Add class and the pickers stop
 * offering it. Its past classes, roll calls and attendance stay.
 */
export interface Ensemble extends Archivable {
  id: string;
  name: string;
  programId: ProgramId;
  /** Where it meets, by `core` venue id: the studio, or a partner's school. */
  venueId: string;
  /** The space inside the venue: "Studio 1", "Band room B-12". */
  room: string;
  /** The teaching artist who leads it, by `core` staff id. */
  leadStaffId: string;
  tone: EnsembleTone;
}

/** One class on one date. Roll is taken against this. */
export interface ClassMeeting {
  id: string;
  ensembleId: string;
  date: string;
  /** 24-hour `HH:MM`, e.g. '16:00'. */
  start: string;
  end: string;
  /** Copied from the ensemble when scheduled, so moving it later keeps history. */
  venueId: string;
  room: string;
  /** ISO timestamp. Set means the roll call is closed and read-only. */
  rollSubmittedAt?: string;
  /** Rehearsal notes, captured when the roll call is submitted. */
  notes?: string;
}

/**
 * A student. `status` is where they are with Jazz Angels (enrolled, on the
 * waitlist, or alumni who finished). Archived (decision 0002) is separate: a
 * student who left, or was entered by mistake, is archived whatever their
 * status, leaves the roster, the roll call and the counts, and keeps their
 * past attendance.
 */
export interface Student extends Archivable {
  id: string;
  name: string;
  instrument: string;
  /** Years with Jazz Angels, counting this one. */
  yearsIn: number;
  guardianName: string;
  guardianPhone?: string;
  programId: ProgramId;
  /** Unset while a student is on the waitlist. */
  ensembleId?: string;
  status: StudentStatus;
}

export interface AttendanceRecord {
  id: string;
  meetingId: string;
  studentId: string;
  mark: Mark;
}

export interface TeachingState {
  terms: Term[];
  ensembles: Ensemble[];
  meetings: ClassMeeting[];
  students: Student[];
  attendance: AttendanceRecord[];
}

/** What `attendanceSummary` answers, and what a grant report quotes. */
export interface AttendanceSummary {
  /** Meetings held with roll submitted. */
  meetings: number;
  /** Distinct students who turned up at least once. */
  studentsServed: number;
  /** 0–1. Present and late both count as turning up. */
  attendanceRate: number;
  /** Student-hours in the room, rounded to one decimal. */
  contactHours: number;
}

/** A window to summarise over. `programId` narrows it to one program. */
export interface AttendanceWindow {
  programId?: ProgramId;
  from: string;
  to: string;
}

export interface TeachingActions {
  /** Schedule a class. Returns the new meeting id. */
  addMeeting(input: Omit<ClassMeeting, 'id'>): string;
  /** Record or change one student's mark. Ignored once the roll is submitted. */
  setMark(meetingId: string, studentId: string, mark: Mark): void;
  /** Close the roll call: stamp `rollSubmittedAt` and keep the rehearsal notes. */
  submitRollCall(meetingId: string, notes?: string): void;
  /** Reopen a submitted roll call so the marks can be edited again. */
  reopenRollCall(meetingId: string): void;
  /** Add a student to the roster or the waitlist. Returns the new student id. */
  enrollStudent(input: Omit<Student, 'id'>): string;
  updateStudent(id: string, patch: Partial<Student>): void;
  /** Add many students in one change, as a CSV import does. Returns how many were added. */
  importStudents(inputs: Omit<Student, 'id'>[]): number;
  /**
   * Archive a student: off the roster, the roll call and the counts. Their
   * status and ensemble stay as they were; their past attendance stays too.
   */
  archiveStudent(id: string): void;
  restoreStudent(id: string): void;
  /**
   * Archive an ensemble: its classes from today on leave the week grid. Its
   * students are not touched; nothing cascades.
   */
  archiveEnsemble(id: string): void;
  restoreEnsemble(id: string): void;
}
