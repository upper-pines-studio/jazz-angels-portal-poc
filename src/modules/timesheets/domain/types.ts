import type { ProgramId } from '../../../core/types';

/**
 * The timesheets module's nouns (PLATFORM §2.3). Hours are decimal quarter
 * hours (1.25, 2.00, 3.75) and dates are ISO `YYYY-MM-DD` strings. Format only
 * at render time.
 */

/** Draft is the teacher's own; submitted waits on the office; approved is final. */
export type TimeEntryStatus = 'draft' | 'submitted' | 'approved';

export interface TimeEntry {
  id: string;
  staffId: string;
  date: string;
  programId: ProgramId;
  /**
   * The teaching module's ensemble, when the hours belong to one. Kept as a
   * plain string so timesheets never depends on teaching; the human-readable
   * name lives in `activity`.
   */
  ensembleId?: string;
  /** What the hours were: "Combo A rehearsal, Studio 1". */
  activity: string;
  /** Decimal hours in quarter-hour steps. */
  hours: number;
  status: TimeEntryStatus;
  /** Staff id of whoever approved it. */
  approvedBy?: string;
  approvedAt?: string;
}

export interface TimesheetsState {
  entries: TimeEntry[];
}

/** What the Log hours dialog hands the slice. Status defaults to 'draft'. */
export interface NewTimeEntryInput {
  staffId: string;
  date: string;
  programId: ProgramId;
  ensembleId?: string;
  activity: string;
  hours: number;
  status?: TimeEntryStatus;
}

export interface TimesheetsActions {
  /** Record hours. Returns the new entry id. */
  logHours(input: NewTimeEntryInput): string;
  /** Hand a draft to the office. */
  submitEntry(id: string): void;
  /**
   * Hand every one of the signed-in person's drafts in the Monday-to-Sunday
   * week containing `weekStartISO` (its Monday, or any day of it) to the
   * office, as one change. Returns how many went.
   */
  submitWeek(weekStartISO: string): number;
  /** Approve a submitted entry, stamping who approved it and when. */
  approveEntry(id: string): void;
  deleteEntry(id: string): void;
}

/** One program's share of a date range, for the "Hours by program" bars. */
export interface ProgramHours {
  programId: ProgramId;
  hours: number;
}

/** What one week adds up to. */
export interface WeekTotals {
  hours: number;
  entries: number;
  /** How many people logged anything that week. */
  teachers: number;
  /** Entries still waiting on the office. */
  awaiting: number;
  awaitingHours: number;
}

/** An inclusive ISO date range. */
export interface DateRange {
  from: string;
  to: string;
}
