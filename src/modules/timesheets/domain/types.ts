import type { ProgramId } from '../../../core/types';

/**
 * The timesheets module's nouns (PLATFORM §2.3). Hours are decimal quarter
 * hours (1.25, 2.00, 3.75) and dates are ISO `YYYY-MM-DD` strings. Format only
 * at render time.
 */

/**
 * Draft is the teacher's own; submitted waits on the office and can be recalled
 * to a draft until it is approved; approved stays on the record unless the
 * office sends it back to its person as a draft to fix (decision 0001).
 */
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
  /** Staff id of whoever approved it. Cleared when it is sent back. */
  approvedBy?: string;
  approvedAt?: string;
  /**
   * Staff id of whoever last sent the approved entry back to its person, and
   * when. Kept for good, through resubmitting and approving again.
   */
  sentBackBy?: string;
  sentBackAt?: string;
  /**
   * What the office said needs fixing. Shown on the draft until its person
   * submits it again, which clears it.
   */
  sentBackReason?: string;
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

/** What a person may change on their own draft: everything but who and the status. */
export type TimeEntryChanges = Pick<
  NewTimeEntryInput,
  'date' | 'programId' | 'ensembleId' | 'activity' | 'hours'
>;

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
  /** Take a submitted entry back to a draft, until it is approved. Your own only. */
  recallEntry(id: string): void;
  /** Approve a submitted entry, stamping who approved it and when. */
  approveEntry(id: string): void;
  /**
   * Send an approved entry back to its person as a draft, with the reason
   * (required), stamping who sent it back and when. Never your own.
   */
  sendBackEntry(id: string, reason: string): void;
  /** Change a draft: date, program, ensemble, activity, hours. Your own only. */
  changeEntry(id: string, changes: TimeEntryChanges): void;
  /** Remove a draft logged by mistake. Your own only; submitted and approved entries stay. */
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
