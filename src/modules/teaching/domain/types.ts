import type { ProgramId } from '../../../core';

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

/** A standing group: the same students, the same room, the same hour each week. */
export interface Ensemble {
  id: string;
  name: string;
  programId: ProgramId;
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
  room: string;
  /** ISO timestamp. Set means the roll call is closed and read-only. */
  rollSubmittedAt?: string;
  /** Rehearsal notes, captured when the roll call is submitted. */
  notes?: string;
}

export interface Student {
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
}
