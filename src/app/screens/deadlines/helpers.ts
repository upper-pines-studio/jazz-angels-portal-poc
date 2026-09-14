import { addDays, startOfMonth, startOfWeek } from 'date-fns';
import type { Deadline, DeadlineKind } from '../../../domain';

/**
 * Helpers shared by the Deadlines screen and the Dashboard's "Coming up" card.
 * Nothing here touches the store — pass values in.
 */

/** Trailing words that carry no identity, dropped first when a name is too long. */
const GENERIC_TAIL = new Set([
  'foundation', 'fund', 'sponsorship', 'trust', 'inc', 'inc.', 'llc', 'company',
  'corporation', 'grant', 'grants', 'program', 'community', 'department',
]);

/**
 * A funder name short enough for a chip or a footnote.
 * "Ralph M. Parsons Foundation" → "Ralph M. Parsons";
 * "Los Angeles County Department of Arts and Culture" → "Los Angeles County…".
 */
export function funderShort(name: string | undefined, max = 24): string {
  if (!name) return '—';
  const words = name.replace(/^The\s+/i, '').split(/\s+/);
  while (words.length > 2 && words.join(' ').length > max && GENERIC_TAIL.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  const kept = words.join(' ');
  if (kept.length <= max) return kept;
  const fitted: string[] = [];
  for (const w of words) {
    if (fitted.length && [...fitted, w].join(' ').length > max) break;
    fitted.push(w);
  }
  return `${fitted.join(' ')}…`;
}

/** The 6×7 Monday-first grid of days covering `month`. */
export function monthMatrix(month: Date): Date[][] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
  );
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DEADLINE_KINDS: DeadlineKind[] = [
  'task', 'loi', 'application', 'decision', 'report', 'payment', 'period-end', 'start',
];

export const KIND_LABELS: Record<DeadlineKind, string> = {
  task: 'Task',
  loi: 'LOI',
  application: 'Application',
  decision: 'Decision',
  report: 'Report',
  payment: 'Payment',
  'period-end': 'Period ends',
  start: 'Start',
};

/** The -50 tint that pairs with `deadlineKindColor` on a calendar chip. */
export function deadlineChipTint(kind: DeadlineKind, status?: Deadline['status']): string {
  if (status === 'overdue') return 'var(--danger-50)';
  switch (kind) {
    case 'loi':
      return 'var(--olive-50)';
    case 'application':
      return 'var(--blue-50)';
    case 'decision':
    case 'payment':
      return 'var(--teal-50)';
    case 'report':
      return 'var(--gold-50)';
    default:
      return 'var(--neutral-50)';
  }
}
