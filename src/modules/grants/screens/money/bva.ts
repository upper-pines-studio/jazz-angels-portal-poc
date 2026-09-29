import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { fiscalYear, money, dateLong, toISO } from '../../../../core';
import type { PortalState } from '../../../../core';
import {
  PACE_LABEL,
  aboutMoney,
  funderById,
  grantPace,
  lineNeedsAttention,
  linePaces,
  percent,
  reportsOwed,
  trackedGrants,
  trackedGrantsInFy,
} from '../../domain';
import type { Grant, LinePace, Pace, Report } from '../../domain';

/**
 * The numbers behind Budget vs. actual: which grants a period shows, each
 * grant's pace and its lines' paces, and the plain-words helpers the warnings
 * use. Pure, so the screen and the CSV export read the same figures.
 */

export type BvaPeriod = 'fy' | 'all' | 'fy-prev';

export interface BvaGrant {
  grant: Grant;
  funder: string;
  /** "LA County", for footnotes. */
  funderShort: string;
  pace: Pace;
  lines: LinePace[];
  /** Phase is closed: history, shown for the record. */
  closed: boolean;
  /** The report owed on an ended grant, soonest first. */
  report?: Report;
}

export interface BvaTotals {
  awarded: number;
  spent: number;
  remaining: number;
  lineCount: number;
  attention: { total: number; fast: number; over: number; idle: number };
  overLines: number;
  /** Money left on grants whose period has ended. */
  leftOnEnded: Array<{ name: string; amount: number }>;
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function words(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * How long before `end` a day falls, in plain words: "nearly eight months",
 * "about six weeks", "a few days".
 */
export function howLongBefore(day: string, end: string): string {
  const days = differenceInCalendarDays(parseISO(end), parseISO(day));
  if (days <= 0) return 'right at the end';
  if (days < 10) return 'a few days';
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'about a week' : `about ${words(weeks)} weeks`;
  }
  const months = days / (365 / 12);
  if (months >= 11.5) {
    const years = months / 12;
    if (years < 1.1) return 'about a year';
    return years < 1.5 ? 'more than a year' : `nearly ${words(Math.round(years))} years`;
  }
  const whole = Math.round(months);
  const unit = whole === 1 ? 'month' : 'months';
  const count = whole === 1 ? 'a' : words(whole);
  if (months < whole - 0.1) return `nearly ${count} ${unit}`;
  if (months > whole + 0.1) return `more than ${count} ${unit}`;
  return `about ${count} ${unit}`;
}

/** "Los Angeles County Department of Arts and Culture" → "LA County"; "Herb Alpert Foundation" → "Herb Alpert". */
export function shortFunder(name: string): string {
  let short = name.split(/ Dep(?:artment|t\.)/)[0].replace(/^Los Angeles\b/, 'LA');
  if (/ Foundation$/.test(short) && !/ Community Foundation$/.test(short)) short = short.replace(/ Foundation$/, '');
  return short;
}

/** The previous fiscal year, for the period select. */
export function previousFy(today: string, startMonth: number) {
  const fy = fiscalYear(today, startMonth);
  return fiscalYear(toISO(addDays(parseISO(fy.start), -1)), startMonth);
}

function hadAward(g: Grant): boolean {
  return g.phase === 'closed' && typeof g.amountAwarded === 'number';
}

function touches(g: Grant, start: string, end: string): boolean {
  const s = g.dates.periodStart ?? start;
  const e = g.dates.periodEnd ?? end;
  return s <= end && e >= start;
}

/** Closed grants that had an award, newest period first. */
function closedWithAward(state: PortalState): Grant[] {
  return state.grants.grants
    .filter(hadAward)
    .slice()
    .sort((a, b) => (b.dates.periodEnd ?? '').localeCompare(a.dates.periodEnd ?? ''));
}

/** Whether any tracked grant touches last fiscal year, so the option is worth showing. */
export function hasPreviousFy(state: PortalState, today: string): boolean {
  const prev = previousFy(today, state.core.settings.fiscalYearStartMonth);
  return trackedGrants(state).some(g => touches(g, prev.start, prev.end));
}

/** The grants a period shows. */
export function grantsForPeriod(state: PortalState, today: string, period: BvaPeriod): Grant[] {
  if (period === 'fy') return trackedGrantsInFy(state, today);
  if (period === 'all') return [...trackedGrants(state), ...closedWithAward(state)];
  const prev = previousFy(today, state.core.settings.fiscalYearStartMonth);
  return [...trackedGrants(state), ...closedWithAward(state)].filter(g => touches(g, prev.start, prev.end));
}

export function bvaGrants(state: PortalState, today: string, period: BvaPeriod): BvaGrant[] {
  const owed = reportsOwed(state);
  return grantsForPeriod(state, today, period).map(grant => {
    const funder = funderById(state, grant.funderId)?.name ?? 'Unknown funder';
    return {
      grant,
      funder,
      funderShort: shortFunder(funder),
      pace: grantPace(state, grant.id, today),
      lines: linePaces(state, grant.id, today),
      closed: grant.phase === 'closed',
      report: owed.find(r => r.grantId === grant.id),
    };
  });
}

/** A line with nothing spent well into a running period. */
export function isIdle(p: LinePace): boolean {
  return lineNeedsAttention(p) && p.spent === 0 && p.spent <= p.budget && p.status !== 'spending-fast';
}

export function bvaTotals(rows: BvaGrant[]): BvaTotals {
  const totals: BvaTotals = {
    awarded: 0,
    spent: 0,
    remaining: 0,
    lineCount: 0,
    attention: { total: 0, fast: 0, over: 0, idle: 0 },
    overLines: 0,
    leftOnEnded: [],
  };
  for (const r of rows) {
    totals.awarded += r.pace.budget;
    totals.spent += r.pace.spent;
    totals.lineCount += r.lines.length;
    if (r.pace.status === 'period-ended' && r.pace.remaining > 0) {
      totals.leftOnEnded.push({ name: r.funderShort, amount: r.pace.remaining });
    }
    for (const l of r.lines) {
      if (l.spent > l.budget) totals.overLines += 1;
      if (!lineNeedsAttention(l)) continue;
      totals.attention.total += 1;
      if (l.spent > l.budget) totals.attention.over += 1;
      else if (l.status === 'spending-fast') totals.attention.fast += 1;
      else totals.attention.idle += 1;
    }
  }
  totals.remaining = totals.awarded - totals.spent;
  return totals;
}

/** "Jul 1, 2026 – Jun 30, 2027 · 21% gone", the mono line under a grant's name. */
export function periodNote(r: BvaGrant): string {
  const { periodStart, periodEnd } = r.grant.dates;
  if (!periodStart || !periodEnd) return 'No grant period yet';
  const range = `${dateLong(periodStart)} – ${dateLong(periodEnd)}`;
  if (r.closed) return `${range} · closed`;
  if (r.pace.status === 'period-ended') return `${range} · ended`;
  if (r.pace.status === 'not-started') return `${range} · not started`;
  return `${range} · ${percent(r.pace.elapsed)} gone`;
}

/** "Final report", "Interim report". */
export function reportName(report: Report): string {
  return `${report.kind === 'final' ? 'Final' : 'Interim'} report`;
}

/** One sentence for the CSV's last column: where the money is headed. */
export function projection(p: Pace): string {
  if (p.spent > p.budget) return `${money(p.spent - p.budget)} over budget`;
  if (p.status === 'period-ended') return p.remaining > 0 ? `${money(p.remaining)} left unspent` : 'Fully spent';
  if (p.runsOutOn && p.status === 'spending-fast') return `Runs out around ${dateLong(p.runsOutOn)}`;
  if (p.status === 'spending-slow') return p.spent === 0 ? 'No spending yet' : `About ${aboutMoney(p.projectedUnspent)} left unspent`;
  if (p.status === 'not-started') return p.headline;
  return 'On course to finish on time';
}

/** The CSV the Excel button saves: a row per grant, then a row per line. */
export function bvaCsvRows(rows: BvaGrant[]): Array<Array<string | number>> {
  const out: Array<Array<string | number>> = [[
    'Grant', 'Funder', 'Budget line', 'Budgeted', 'Spent', 'Remaining', 'Percent used', 'Percent of period gone', 'Status', 'Projected run-out or unspent',
  ]];
  const row = (r: BvaGrant, line: string, p: Pace) => [
    r.grant.title, r.funder, line, p.budget, p.spent, p.remaining,
    percent(p.used), percent(p.elapsed), r.closed ? 'Closed' : PACE_LABEL[p.status], projection(p),
  ];
  for (const r of rows) {
    out.push(row(r, 'All lines', r.pace));
    for (const l of r.lines) out.push(row(r, l.line.category, l));
  }
  return out;
}
