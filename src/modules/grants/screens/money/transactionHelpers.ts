import { subDays, parseISO, format } from 'date-fns';
import { fiscalYear } from '../../../../core';
import type { PortalState } from '../../../../core';
import { funderById, funderShortName, grantById, transactionsByStatus } from '../../domain';

/**
 * Small pure helpers for the Transactions screen: the funder behind a grant
 * and the period filter.
 */

/** The colours a split's parts take, in order. */
export const PART_COLORS = [
  'var(--blue-500)',
  'var(--teal-500)',
  'var(--olive-500)',
  'var(--gold-400)',
];

export const MAX_PARTS = 4;

/** The full name of a grant's funder, to shorten with the domain's `funderShortName`. */
export function funderOfGrant(state: PortalState, grantId: string): string | undefined {
  const grant = grantById(state, grantId);
  return grant && funderById(state, grant.funderId)?.name;
}

/** "General operating support 2026 · Herb Alpert", for a grant select. */
export function grantOptionLabel(state: PortalState, grantId: string): string {
  const grant = grantById(state, grantId);
  return `${grant?.title ?? 'Unknown grant'} · ${funderShortName(funderOfGrant(state, grantId))}`;
}

/** "A", "A and B", "A, B and C". */
export function joinWords(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Period filter
// ---------------------------------------------------------------------------

export type Period = '30' | '90' | 'fy' | 'all';

export const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'fy', label: 'This fiscal year' },
  { value: 'all', label: 'All time' },
];

export function isPeriod(v: string | null): v is Period {
  return v === '30' || v === '90' || v === 'fy' || v === 'all';
}

/** The first and last day a period covers, as ISO dates. */
export function periodRange(
  state: PortalState,
  period: Period,
  today: string,
): { from?: string; to?: string } {
  const day = (d: Date) => format(d, 'yyyy-MM-dd');
  if (period === '30') return { from: day(subDays(parseISO(today), 30)) };
  if (period === '90') return { from: day(subDays(parseISO(today), 90)) };
  if (period === 'fy') {
    const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
    return { from: fy.start, to: fy.end };
  }
  return {};
}

/** The shortest period that still shows everything waiting to be assigned. */
export function defaultPeriod(state: PortalState, today: string): Period {
  const waiting = transactionsByStatus(state, 'to-assign');
  for (const p of ['30', '90', 'fy'] as Period[]) {
    const { from, to } = periodRange(state, p, today);
    if (waiting.every(t => (!from || t.date >= from) && (!to || t.date <= to))) return p;
  }
  return 'all';
}
