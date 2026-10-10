import { differenceInCalendarDays, format, parseISO } from 'date-fns';

/**
 * Display helpers. Copy rules from SPEC §5: money with `$` and thousands
 * separators, dates as "Sep 26, 2026" in prose and "Sep 26" in tight columns.
 */

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 25000 → "$25,000". Negatives read "-$1,200". */
export function money(n: number | undefined | null): string {
  const value = Math.round(n ?? 0);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${GROUPED.format(Math.abs(value))}`;
}

/** 25000 → "25,000" — for places that already show a `$` in the label. */
export function plainNumber(n: number | undefined | null): string {
  return GROUPED.format(Math.round(n ?? 0));
}

/**
 * Parse an ISO `YYYY-MM-DD` string as *local* midnight.
 * `new Date('2026-09-26')` is UTC midnight and drifts a day in US timezones;
 * date-fns `parseISO` keeps date-only strings local, which is what we want.
 */
export function toDate(iso: string): Date {
  return parseISO(iso);
}

/** Date → ISO `YYYY-MM-DD`. */
export function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** "2026-09-26" → "Sep 26" */
export function dateShort(iso: string | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'MMM d');
}

/** "2026-09-26" → "Sep 26, 2026" */
export function dateLong(iso: string | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'MMM d, yyyy');
}

/**
 * "Jul 1, 2026 – Jun 30, 2027". Within one calendar year the year is only
 * written once: "Mar 1 – Aug 31, 2026".
 */
export function dateRange(a: string | undefined, b: string | undefined): string {
  if (!a && !b) return '—';
  if (!a) return `Through ${dateLong(b)}`;
  if (!b) return `From ${dateLong(a)}`;
  const start = parseISO(a);
  const end = parseISO(b);
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return `${dateLong(a)} – ${dateLong(b)}`;
}

/** "in 13 days" · "3 days ago" · "today" · "tomorrow" · "yesterday" */
export function relativeDays(iso: string, today: string): string {
  const days = differenceInCalendarDays(parseISO(iso), parseISO(today));
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Whole days from `today` to `iso`; negative when `iso` is in the past. */
export function daysUntil(iso: string, today: string): number {
  return differenceInCalendarDays(parseISO(iso), parseISO(today));
}

/** 412 → "412 KB", 1229 → "1.2 MB". */
export function fileSize(sizeKb: number): string {
  return sizeKb >= 1000 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.round(sizeKb)} KB`;
}

/** "Barry Cogert" → "BC". Single words give one letter. */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
