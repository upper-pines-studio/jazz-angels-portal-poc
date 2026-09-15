import { addDays } from 'date-fns';
import { toDate, toISO } from '../../../core/format';
import { SEED_TODAY } from '../../../core/seed';
import type { ProgramId } from '../../../core/types';
import type { TimeEntry, TimeEntryStatus, TimesheetsState } from './types';

/**
 * Demo hours for the timesheets module (PLATFORM §2.3). "Today" in the story is
 * Sunday 2026-09-13, the first day of the Fall session, and the week on screen
 * is Mon Sep 7 – Sun Sep 13.
 *
 * Three stretches of data:
 *   · last spring's term, Mar 1 – Apr 26 2026, all approved, so a grant period
 *     has hours to report;
 *   · the four weeks before this one, summer prep and summer groups;
 *   · this week, which ends with the Fall session's first Sunday and leaves two
 *     entries waiting on the office.
 *
 * Hours are quarter-hour steps throughout.
 */

export { SEED_TODAY };

/** `[dayOffset, staffId, programId, activity, hours]` against a week's anchor day. */
type Shift = [number, string, ProgramId, string, number];

/** Barry approves the teaching artists; Denise signs off Barry's own hours. */
function approver(staffId: string): string {
  return staffId === 's-barry' ? 's-denise' : 's-barry';
}

let counter = 0;

/**
 * The office runs approvals on Mondays, so hours are stamped the Monday after
 * the day they were worked, and never later than the day the story opens.
 */
function approvedOn(iso: string): string {
  const dayOfWeek = toDate(iso).getDay();
  const monday = toISO(addDays(toDate(iso), ((8 - dayOfWeek) % 7) || 7));
  return monday > SEED_TODAY ? SEED_TODAY : monday;
}

function makeEntry(
  anchorISO: string,
  [offset, staffId, programId, activity, hours]: Shift,
  status: TimeEntryStatus,
): TimeEntry {
  const date = toISO(addDays(toDate(anchorISO), offset));
  counter += 1;
  const entry: TimeEntry = {
    id: `te-${String(counter).padStart(3, '0')}`,
    staffId,
    date,
    programId,
    activity,
    hours,
    status,
  };
  if (status === 'approved') {
    entry.approvedBy = approver(staffId);
    entry.approvedAt = approvedOn(date);
  }
  return entry;
}

function makeWeek(
  anchorISO: string,
  shifts: Shift[],
  status: TimeEntryStatus,
  overrides: Record<number, TimeEntryStatus> = {},
): TimeEntry[] {
  return shifts.map((shift, i) => makeEntry(anchorISO, shift, overrides[i] ?? status));
}

// --- Last spring's term, Mar 1 – Apr 26 2026 --------------------------------

/** Anchored on the Sunday: combos and big band Sunday, then the weekday groups. */
const SPRING_WEEK: Shift[] = [
  [0, 's-albert', 'studio-sessions', 'Combo A rehearsal, Studio 1', 1],
  [0, 's-barry', 'studio-sessions', 'Combo B rehearsal, Studio 1', 1],
  [0, 's-devon', 'studio-sessions', 'Big Band rehearsal, Main room', 1.5],
  [1, 's-renee', 'homeschool', 'Homeschool I and II, Studio 2', 2.25],
  [2, 's-albert', 'jazz-legacy', 'Jazz Legacy rehearsal, Main room', 1.5],
  [2, 's-barry', 'advanced-workshop', 'Advanced Workshop, Studio 1', 1.5],
  [3, 's-albert', 'general-operating', 'Chart prep', 0.75],
  [4, 's-devon', 'in-school', 'Paramount MS, in-school band', 2],
];

/** The eight Sundays of the spring term. */
const SPRING_SUNDAYS = [
  '2026-03-01',
  '2026-03-08',
  '2026-03-15',
  '2026-03-22',
  '2026-03-29',
  '2026-04-05',
  '2026-04-12',
  '2026-04-19',
];

// --- The four weeks before this one, Aug 10 – Sep 6 -------------------------

/** Anchored on the Monday: summer groups, chart prep and the office work around them. */
const SUMMER_WEEK: Shift[] = [
  [0, 's-albert', 'general-operating', 'Chart prep for the fall books', 1.5],
  [1, 's-albert', 'jazz-legacy', 'Jazz Legacy rehearsal, Main room', 1.5],
  [1, 's-barry', 'advanced-workshop', 'Advanced Workshop, Studio 1', 1.5],
  [2, 's-renee', 'homeschool', 'Homeschool summer group, Studio 2', 2],
  [3, 's-devon', 'in-school', 'Paramount MS summer band', 2],
  [5, 's-renee', 'general-operating', 'Family calls and scheduling', 1],
  [6, 's-albert', 'studio-sessions', 'Combo A rehearsal, Studio 1', 2],
  [6, 's-barry', 'studio-sessions', 'Combo B rehearsal, Studio 1', 2],
  [6, 's-devon', 'studio-sessions', 'Big Band rehearsal, Main room', 1.5],
];

const SUMMER_MONDAYS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];

/** A couple of entries nobody ever got round to sending in. */
const SUMMER_DRAFTS: Record<string, Record<number, TimeEntryStatus>> = {
  '2026-08-24': { 5: 'draft' },
  '2026-08-31': { 0: 'draft' },
};

// --- This week, Mon Sep 7 – Sun Sep 13 --------------------------------------

/**
 * Anchored on Monday Sep 7. The week is Fall session prep until Sunday, when
 * the studio sessions start. Devon and Renee are the two waiting on approval.
 */
const THIS_WEEK: Array<[Shift, TimeEntryStatus]> = [
  [[0, 's-albert', 'general-operating', 'Chart prep for the fall books', 1.5], 'approved'],
  [[0, 's-barry', 'general-operating', 'Fall session rosters and room setup', 2], 'approved'],
  [[1, 's-barry', 'studio-sessions', 'Placement auditions, Studio 1', 2.5], 'approved'],
  [[1, 's-renee', 'homeschool', 'Homeschool curriculum planning', 2], 'approved'],
  [[2, 's-devon', 'in-school', 'Paramount MS planning with the band director', 1.25], 'approved'],
  [[3, 's-albert', 'jazz-legacy', 'Jazz Legacy repertoire prep', 1.75], 'draft'],
  [[4, 's-renee', 'homeschool', 'Homeschool I and II lesson plans', 3], 'submitted'],
  [[5, 's-barry', 'advanced-workshop', 'Advanced Workshop syllabus', 1.5], 'draft'],
  [[6, 's-albert', 'studio-sessions', 'Combo A rehearsal, Studio 1', 2], 'draft'],
  [[6, 's-barry', 'studio-sessions', 'Combo B rehearsal, Studio 1', 2], 'draft'],
  [[6, 's-devon', 'studio-sessions', 'Big Band rehearsal and setup, Main room', 3.25], 'submitted'],
];

/** The Monday of the week the story opens in. */
export const SEED_WEEK_START = '2026-09-07';

/** A fresh copy of the demo hours. Never mutate the result in place. */
export function makeSeed(): TimesheetsState {
  counter = 0;
  const entries: TimeEntry[] = [
    ...SPRING_SUNDAYS.flatMap((sunday) => makeWeek(sunday, SPRING_WEEK, 'approved')),
    ...SUMMER_MONDAYS.flatMap((monday) =>
      makeWeek(monday, SUMMER_WEEK, 'approved', SUMMER_DRAFTS[monday]),
    ),
    ...THIS_WEEK.map(([shift, status]) => makeEntry(SEED_WEEK_START, shift, status)),
  ];
  return { entries };
}
