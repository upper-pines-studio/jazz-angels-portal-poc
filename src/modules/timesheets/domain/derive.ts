import { addDays, endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns';
import { toDate, toISO } from '../../../core/format';
import { can } from '../../../core/permissions';
import type { PortalState, ProgramId, SignedInUser } from '../../../core/types';
import type {
  DateRange,
  ProgramHours,
  TimeEntry,
  TimeEntryEvent,
  TimeEntryEventKind,
  WeekTotals,
} from './types';

/**
 * Derived data for timesheets. Every function here is pure: it takes state and
 * returns a fresh value, and nothing it returns is ever persisted.
 *
 * Weeks run Monday to Sunday, so the Fall session's Sunday classes close the
 * week rather than opening it.
 */

/** Monday is day 1. */
const WEEK_STARTS_ON = 1;

/** Quarter hours are exact in binary, but rounding keeps long sums tidy. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 2.5 → "2.50". Hours always read with two decimals, in mono. */
export function formatHours(n: number): string {
  return round2(n).toFixed(2);
}

/** The Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  return toISO(startOfWeek(toDate(iso), { weekStartsOn: WEEK_STARTS_ON }));
}

/** The Monday-to-Sunday range whose Monday is `weekStartISO`. */
export function weekRange(weekStartISO: string): DateRange {
  return { from: weekStartISO, to: toISO(addDays(toDate(weekStartISO), 6)) };
}

/** The calendar month containing `iso`. */
export function monthRange(iso: string): DateRange {
  const d = toDate(iso);
  return { from: toISO(startOfMonth(d)), to: toISO(endOfMonth(d)) };
}

/** "September 2026" — the label over the month's numbers. */
export function monthLabel(iso: string): string {
  return format(toDate(iso), 'MMMM yyyy');
}

/** Oldest first, and within a day the earliest-logged first. */
function byDate(a: TimeEntry, b: TimeEntry): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

/** Every entry in the inclusive range, oldest first. */
export function entriesInRange(state: PortalState, { from, to }: DateRange): TimeEntry[] {
  return state.timesheets.entries.filter(e => e.date >= from && e.date <= to).sort(byDate);
}

/** Every entry in the Monday-to-Sunday week starting `weekStartISO`. */
export function entriesForWeek(state: PortalState, weekStartISO: string): TimeEntry[] {
  return entriesInRange(state, weekRange(weekStartISO));
}

export function weekTotals(state: PortalState, weekStartISO: string): WeekTotals {
  const entries = entriesForWeek(state, weekStartISO);
  const submitted = entries.filter(e => e.status === 'submitted');
  return {
    hours: round2(entries.reduce((sum, e) => sum + e.hours, 0)),
    entries: entries.length,
    teachers: new Set(entries.map(e => e.staffId)).size,
    awaiting: submitted.length,
    awaitingHours: round2(submitted.reduce((sum, e) => sum + e.hours, 0)),
  };
}

/**
 * This person's drafts among `entries`, oldest first: what Submit week hands to
 * the office. Nobody submits anyone else's hours, so other people's drafts are
 * left out whatever the role.
 */
export function ownDrafts(user: Pick<SignedInUser, 'id'>, entries: TimeEntry[]): TimeEntry[] {
  return entries.filter(e => e.staffId === user.id && e.status === 'draft').sort(byDate);
}

/** Everything submitted and still waiting on the office, oldest first. */
export function awaitingApproval(state: PortalState): TimeEntry[] {
  return state.timesheets.entries.filter(e => e.status === 'submitted').sort(byDate);
}

/**
 * The entries awaiting approval that this person may approve: none for a role
 * that does not approve, and never their own. The number on the rail.
 */
export function awaitingApprovalFor(state: PortalState, user: SignedInUser): TimeEntry[] {
  return awaitingApproval(state).filter(e => mayApprove(user, e));
}

/**
 * This person's own entries the office sent back, oldest first: drafts with
 * the office's reason still on them, waiting to be fixed and submitted again.
 */
export function sentBackTo(state: PortalState, user: Pick<SignedInUser, 'id'>): TimeEntry[] {
  return state.timesheets.entries.filter(e => e.staffId === user.id && isSentBack(e)).sort(byDate);
}

/**
 * The number on the rail: what Timesheets is waiting on this person to do.
 * Somebody else's hours to approve, for a role that approves, and their own
 * hours the office sent back to fix. Ordinary drafts are their own work in
 * progress, so they do not count.
 */
export function waitingOn(state: PortalState, user: SignedInUser): number {
  return awaitingApprovalFor(state, user).length + sentBackTo(state, user).length;
}

/**
 * Hours per program over an inclusive range, biggest first. Programs with
 * nothing logged are left out, so the bars never show an empty row.
 */
export function hoursByProgram(state: PortalState, range: DateRange): ProgramHours[] {
  const totals = new Map<ProgramId, number>();
  for (const entry of entriesInRange(state, range)) {
    totals.set(entry.programId, (totals.get(entry.programId) ?? 0) + entry.hours);
  }
  return [...totals.entries()]
    .map(([programId, hours]) => ({ programId, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours || a.programId.localeCompare(b.programId));
}

/** One program's hours over an inclusive range. The number a grant report needs. */
export function hoursForProgram(
  state: PortalState,
  programId: ProgramId,
  from: string,
  to: string,
): number {
  return round2(
    entriesInRange(state, { from, to })
      .filter(e => e.programId === programId)
      .reduce((sum, e) => sum + e.hours, 0),
  );
}

/** The hours of several programs over an inclusive range, each hour counted once. */
export function hoursForPrograms(
  state: PortalState,
  programIds: ProgramId[],
  from: string,
  to: string,
): number {
  return round2(
    entriesInRange(state, { from, to })
      .filter(e => programIds.includes(e.programId))
      .reduce((sum, e) => sum + e.hours, 0),
  );
}

/** Hours logged so far in the calendar month containing `today`. */
export function hoursThisMonth(state: PortalState, today: string): number {
  return round2(entriesInRange(state, monthRange(today)).reduce((sum, e) => sum + e.hours, 0));
}

/** How many people logged anything this month, for the "Across N teachers" footnote. */
export function teachersThisMonth(state: PortalState, today: string): number {
  return new Set(entriesInRange(state, monthRange(today)).map(e => e.staffId)).size;
}

// ---------------------------------------------------------------------------
// Who may do what (decision 0001)
// ---------------------------------------------------------------------------

/** Why an approval is refused whatever the role. */
export const OWN_HOURS_REFUSAL = 'Nobody approves their own hours.';

/**
 * May this person approve this entry? Only a role that approves, and never
 * on their own hours. The Approve button and the store both ask this.
 */
export function mayApprove(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.staffId !== user.id && can(user.role, 'timesheets-approve', 'edit');
}

/** May this person log, submit, recall or delete hours for this staff id? Only their own. */
export function mayLogFor(user: SignedInUser, staffId: string): boolean {
  return can(user.role, 'timesheets-log', 'edit', staffId === user.id);
}

/** Why a submitted or approved entry is not deleted (decision 0002: approved hours are money). */
export const DRAFT_ONLY_REFUSAL =
  'Only a draft can be deleted. Recall a submitted entry first; approved hours stay on the record.';

/** Why an approved entry is not recalled. */
export const APPROVED_REFUSAL =
  'These hours are approved, so they stay as they are. If something is wrong, the office can send them back to you.';

/** Why a submitted or approved entry is not changed. */
export const CHANGE_DRAFT_ONLY_REFUSAL =
  'Only a draft can be changed. Recall a submitted entry first; approved hours are sent back by the office to fix.';

/** Why sending back is refused whatever the role, as approving is. */
export const OWN_SEND_BACK_REFUSAL = 'Nobody sends back their own hours.';

/** Why an entry that is not approved is not sent back. */
export const SEND_BACK_APPROVED_ONLY_REFUSAL =
  'Only approved hours are sent back. Hours still waiting are approved, or recalled by their person.';

/** Why a send back with no reason is refused. */
export const SEND_BACK_REASON_REFUSAL = 'Say what needs fixing, so they know what to change.';

/**
 * May this person delete this entry? Only their own, and only while it is a
 * draft. The Delete button and the store both ask this.
 */
export function mayDeleteEntry(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.status === 'draft' && mayLogFor(user, entry.staffId);
}

/**
 * May this person recall this entry to a draft? Only their own, and only while
 * it is submitted: once approved it stays. The Recall button and the store both ask this.
 */
export function mayRecall(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.status === 'submitted' && mayLogFor(user, entry.staffId);
}

/**
 * May this person change this entry? Only their own, and only while it is a
 * draft, a sent-back one included. The Edit button and the store both ask this.
 */
export function mayChangeEntry(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.status === 'draft' && mayLogFor(user, entry.staffId);
}

/**
 * May this person send this entry back to whoever logged it? Only an approved
 * entry, only a role that approves, and never their own hours. The Send back
 * button and the store both ask this.
 */
export function maySendBack(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.status === 'approved' && mayApprove(user, entry);
}

/** A draft the office sent back, with its reason still on it: not yet submitted again. */
export function isSentBack(entry: TimeEntry): boolean {
  return entry.status === 'draft' && !!entry.sentBackReason;
}

/**
 * Whose entries the week table lists: everyone's for a role that approves,
 * otherwise the person's own.
 */
export function visibleEntries(user: SignedInUser, entries: TimeEntry[]): TimeEntry[] {
  return can(user.role, 'timesheets-approve', 'edit')
    ? entries
    : entries.filter(e => e.staffId === user.id);
}

// ---------------------------------------------------------------------------
// History (#95)
// ---------------------------------------------------------------------------

/** The id the next step on this entry takes: `${entryId}:${n}`, n counting from 1. */
export function nextEventId(entry: Pick<TimeEntry, 'id'> & { history?: TimeEntryEvent[] }): string {
  return `${entry.id}:${(entry.history?.length ?? 0) + 1}`;
}

/**
 * The history an entry saved before #95 can be given from its own fields:
 * logged by its person, sent back if the office did, then submitted or approved
 * as its status says. When it was logged or submitted is not known, so those
 * steps carry no date. Every step is marked `rebuilt`.
 */
export function rebuildHistory(entry: Omit<TimeEntry, 'history'>): TimeEntryEvent[] {
  const steps: Array<Omit<TimeEntryEvent, 'id' | 'rebuilt'>> = [
    { kind: 'logged', whoId: entry.staffId },
  ];
  if (entry.sentBackBy) {
    steps.push({
      kind: 'sent-back',
      whoId: entry.sentBackBy,
      ...(entry.sentBackAt ? { at: entry.sentBackAt } : {}),
      ...(entry.sentBackReason ? { reason: entry.sentBackReason } : {}),
    });
  }
  if (entry.status === 'submitted') steps.push({ kind: 'submitted', whoId: entry.staffId });
  if (entry.status === 'approved' && entry.approvedBy) {
    steps.push({
      kind: 'approved',
      whoId: entry.approvedBy,
      ...(entry.approvedAt ? { at: entry.approvedAt } : {}),
    });
  }
  return steps.map((step, i) => ({ ...step, id: `${entry.id}:${i + 1}`, rebuilt: true }));
}

/** One line of the History dialog: the step, and whether it is the second time or more. */
export interface HistoryLine {
  event: TimeEntryEvent;
  /** Submitted or approved before: "Submitted again", "Approved again". */
  again: boolean;
}

const REPEATS: TimeEntryEventKind[] = ['submitted', 'approved'];

/** The entry's history as the dialog reads it, oldest first. */
export function historyLines(entry: TimeEntry): HistoryLine[] {
  const seen = new Set<TimeEntryEventKind>();
  return entry.history.map(event => {
    const again = REPEATS.includes(event.kind) && seen.has(event.kind);
    seen.add(event.kind);
    return { event, again };
  });
}

/** Was any of this entry's history rebuilt from an entry saved before it was kept? */
export function hasRebuiltHistory(entry: TimeEntry): boolean {
  return entry.history.some(e => e.rebuilt);
}

/**
 * May this person read this entry's history? The person who logged it, and any
 * role that approves hours: the same people who see the row (`visibleEntries`).
 */
export function mayReadHistory(user: SignedInUser, entry: TimeEntry): boolean {
  return entry.staffId === user.id || can(user.role, 'timesheets-approve', 'edit');
}
