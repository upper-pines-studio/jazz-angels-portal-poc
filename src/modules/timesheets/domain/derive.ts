import { addDays, endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns';
import { toDate, toISO } from '../../../core/format';
import type { PortalState, ProgramId } from '../../../core/types';
import type { DateRange, ProgramHours, TimeEntry, WeekTotals } from './types';

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

/** Everything submitted and still waiting on the office, oldest first. */
export function awaitingApproval(state: PortalState): TimeEntry[] {
  return state.timesheets.entries.filter(e => e.status === 'submitted').sort(byDate);
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

/** Hours logged so far in the calendar month containing `today`. */
export function hoursThisMonth(state: PortalState, today: string): number {
  return round2(entriesInRange(state, monthRange(today)).reduce((sum, e) => sum + e.hours, 0));
}

/** How many people logged anything this month, for the "Across N teachers" footnote. */
export function teachersThisMonth(state: PortalState, today: string): number {
  return new Set(entriesInRange(state, monthRange(today)).map(e => e.staffId)).size;
}
