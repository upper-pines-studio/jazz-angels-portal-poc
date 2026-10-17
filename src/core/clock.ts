import { addDays, startOfDay } from 'date-fns';
import { toISO } from './format';

/**
 * The real date, kept moving. The one place in the portal that reads the
 * device clock for today: the store holds the answer, and screens read it as
 * `useStore().today` (lint keeps `new Date()` out of them).
 */

/** Today on this device as an ISO `YYYY-MM-DD` string, in local time. */
export function clockToday(now: Date = new Date()): string {
  return toISO(now);
}

/** Milliseconds from `now` to the next local midnight, never less than 1. */
export function msUntilMidnight(now: Date): number {
  return Math.max(1, addDays(startOfDay(now), 1).getTime() - now.getTime());
}

/**
 * Calls `onChange` with the new date whenever the day on this device is no
 * longer `since`: at once if it already moved, at the next local midnight,
 * and when the tab is shown again or the window gets focus (a laptop asleep
 * overnight fires no timer on time). Only a real change calls it. Returns the
 * function that stops watching.
 */
export function watchToday(
  since: string,
  onChange: (today: string) => void,
  now: () => Date = () => new Date(),
): () => void {
  let last = since;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const today = clockToday(now());
    if (today === last) return;
    last = today;
    onChange(today);
  };
  const schedule = () => {
    timer = setTimeout(() => {
      check();
      schedule();
    }, msUntilMidnight(now()));
  };

  check();
  schedule();
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';
  if (hasDocument) document.addEventListener('visibilitychange', check);
  if (hasWindow) window.addEventListener('focus', check);
  return () => {
    clearTimeout(timer);
    if (hasDocument) document.removeEventListener('visibilitychange', check);
    if (hasWindow) window.removeEventListener('focus', check);
  };
}
