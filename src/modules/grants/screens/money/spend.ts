import { differenceInCalendarDays, parseISO } from 'date-fns';
import { dateLong, money } from '../../../../core';
import type { PortalState } from '../../../../core';
import {
  aboutMoney,
  funderById,
  grantPace,
  linePaces,
  paceDriver,
  percent,
  reportsOwed,
  trackedGrants,
} from '../../domain';
import type { Grant, Pace, PaceStatus } from '../../domain';

/**
 * Pure helpers for the Spend-down screen and the dashboard's Money card:
 * which grants come first, the "What to do" sentence, short money for axes.
 */

const DAYS_PER_MONTH = 365 / 12;

/** Spending fast first, then slow, then the rest still running, then ended. */
const STATUS_ORDER: Record<PaceStatus, number> = {
  'spending-fast': 0,
  'spending-slow': 1,
  ahead: 2,
  'on-track': 3,
  'not-started': 4,
  'period-ended': 5,
};

export interface PacedGrant {
  grant: Grant;
  pace: Pace;
}

/** Every tracked grant with its pace, the ones that need attention first. */
export function pacedGrants(state: PortalState, today: string): PacedGrant[] {
  return trackedGrants(state)
    .map(grant => ({ grant, pace: grantPace(state, grant.id, today) }))
    .sort((a, b) => STATUS_ORDER[a.pace.status] - STATUS_ORDER[b.pace.status]);
}

export function needsAttention(status: PaceStatus): boolean {
  return status === 'spending-fast' || status === 'spending-slow';
}

/** "Herb Alpert Foundation" → "Herb Alpert"; "Los Angeles County Department of ..." → "LA County". */
export function shortFunder(name: string): string {
  let n = name.split(/ (Department|Dept\.) of /)[0];
  n = n.replace(/^Los Angeles County\b/, 'LA County');
  n = n.replace(/ (Community )?Foundation$/, (_m, c) => (c ? ' CF' : ''));
  return n.trim() || name;
}

/** 50000 → "$50k", 8500 → "$8.5k", 500 → "$500". For axis labels. */
export function shortMoney(n: number): string {
  if (Math.abs(n) < 1000) return `$${Math.round(n)}`;
  const k = n / 1000;
  const text = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
  return `$${text}k`;
}

/** A round gridline step (1, 2 or 5 times a power of ten) giving three to five lines up to `max`. */
export function niceStep(max: number): number {
  if (max <= 0) return 1;
  const top = 10 ** Math.floor(Math.log10(max));
  for (const mag of [top / 10, top]) {
    for (const m of [1, 2, 5, 2.5]) {
      const count = Math.floor(max / (m * mag));
      if (count >= 3 && count <= 5) return m * mag;
    }
  }
  return top;
}

/** "Jul 1, 2026 to Jun 30, 2027" */
export function periodText(start: string | undefined, end: string | undefined): string {
  if (!start && !end) return 'No grant period yet';
  if (!start) return `Through ${dateLong(end)}`;
  if (!end) return `From ${dateLong(start)}`;
  return `${dateLong(start)} to ${dateLong(end)}`;
}

/** "17 days from now", "tomorrow", "3 days ago". */
export function fromNow(iso: string, today: string): string {
  const days = differenceInCalendarDays(parseISO(iso), parseISO(today));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `${days} days from now` : `${-days} days ago`;
}

function lcFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function stripStop(s: string): string {
  return s.trim().replace(/\.$/, '');
}

/** "Venue ($1,200)", "Venue ($1,200) and Admin ($800)", "A, B and C". */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function term(state: PortalState, grantId: string, label: string): string | undefined {
  return state.grants.terms.find(
    t => t.grantId === grantId && t.label.toLowerCase() === label.toLowerCase(),
  )?.text;
}

/** "the county", "the foundation": who to ask. */
function funderNoun(state: PortalState, grant: Grant): string {
  const f = funderById(state, grant.funderId);
  if (!f) return 'the funder';
  if (/\bCounty\b/.test(f.name)) return 'the county';
  if (/\bCity\b/.test(f.name)) return 'the city';
  if (f.type === 'foundation') return 'the foundation';
  if (f.type === 'corporate') return 'the sponsor';
  return 'the funder';
}

function reportLabel(kind: 'interim' | 'final'): string {
  return kind === 'final' ? 'final report' : 'interim report';
}

/**
 * The "What to do" sentence for a grant, built from its pace, its budget
 * lines, its award terms and the reports it still owes.
 */
export function whatToDo(state: PortalState, grant: Grant, pace: Pace, today: string): string {
  const monthsLeft = pace.daysLeft / DAYS_PER_MONTH;
  const nextReport = reportsOwed(state).find(r => r.grantId === grant.id);

  if (pace.status === 'period-ended') {
    if (pace.remaining > 0) {
      let s = `Nothing more can be spent, so report the ${money(pace.remaining)}`;
      if (nextReport)
        s += ` in the ${reportLabel(nextReport.kind)} due ${dateLong(nextReport.dueDate)}, ${fromNow(nextReport.dueDate, today)}`;
      else s += ' when you close the grant';
      if (term(state, grant.id, 'Unspent funds'))
        s += `, and ask ${funderNoun(state, grant)} whether to return it`;
      return `${s}.`;
    }
    if (pace.remaining < 0) {
      return `Spending came to ${money(-pace.remaining)} more than the award. Move the extra to another source in QuickBooks before the final report.`;
    }
    return nextReport
      ? `The award is fully spent. Send the ${reportLabel(nextReport.kind)} by ${dateLong(nextReport.dueDate)}, ${fromNow(nextReport.dueDate, today)}.`
      : 'The award is fully spent. Nothing more to do here.';
  }

  if (pace.status === 'not-started') {
    return `The grant period starts ${dateLong(pace.periodStart)}. Spending shows here from then on.`;
  }

  if (pace.spent > pace.budget) {
    return `Spending is ${money(pace.spent - pace.budget)} over the award. Move the extra to another funding source, or ask ${funderNoun(state, grant)} about a budget change.`;
  }

  if (pace.status === 'spending-fast') {
    const lines = linePaces(state, grant.id, today);
    const driver = paceDriver(state, grant.id, today);
    let s: string;
    if (driver && monthsLeft > 0) {
      const target = Math.max(0, driver.remaining) / monthsLeft;
      s = `Bring ${driver.line.category} down to about ${aboutMoney(target)} a month, since ${
        /s$/.test(driver.line.category) ? 'they are' : 'it is'
      } ${percent(driver.used)} used${driver.runsOutOn ? ` and on course to run out around ${dateLong(driver.runsOutOn)}` : ''}`;
      const roomy = lines
        .filter(l => l.line.id !== driver.line.id && l.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining)[0];
      if (roomy)
        s += `, or move money in from ${roomy.line.category}, which is ${percent(roomy.used)} used`;
      s += '.';
    } else {
      s = `Bring spending down to about ${aboutMoney(pace.perMonthNeeded)} a month to last until ${dateLong(pace.periodEnd)}.`;
    }
    const changes = term(state, grant.id, 'Budget changes');
    if (changes) s += ` Under the award terms, ${lcFirst(stripStop(changes))}.`;
    return s;
  }

  if (pace.status === 'spending-slow') {
    const idle = linePaces(state, grant.id, today).filter(l => l.spent === 0 && l.budget > 0);
    let s: string;
    if (idle.length > 0) {
      const names = listJoin(idle.map(l => `${l.line.category} (${money(l.budget)})`));
      s = `${names} ${idle.length === 1 ? 'has' : 'have'} no spending yet, so plan and book that spending now.`;
    } else {
      s = `Spending needs to rise to about ${aboutMoney(pace.perMonthNeeded)} a month to use the award by ${dateLong(pace.periodEnd)}.`;
    }
    const unspent = term(state, grant.id, 'Unspent funds');
    if (unspent) s += ` Under the award terms, ${lcFirst(stripStop(unspent))}.`;
    return s;
  }

  // On track (or ahead).
  let s = `Spending is on course to use the award by ${dateLong(pace.periodEnd)}. Keep to about ${aboutMoney(pace.perMonthNeeded)} a month.`;
  if (nextReport)
    s += ` The next report is the ${reportLabel(nextReport.kind)}, due ${dateLong(nextReport.dueDate)}.`;
  return s;
}

/** "About $4,000 unspent", "$540 unspent", "Fully spent". */
export function resultText(pace: Pace): string {
  if (pace.status === 'period-ended') {
    if (pace.remaining > 0) return `${money(pace.remaining)} unspent`;
    if (pace.remaining < 0) return `${money(-pace.remaining)} over`;
    return 'Fully spent';
  }
  return pace.headline;
}
