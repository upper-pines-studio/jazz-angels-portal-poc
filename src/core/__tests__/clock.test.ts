// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockToday, msUntilMidnight, watchToday } from '../clock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 16, 23, 58));
});
afterEach(() => vi.useRealTimers());

describe('clockToday', () => {
  it('reads the local day, not the UTC one', () => {
    expect(clockToday()).toBe('2026-10-16');
    expect(clockToday(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });
});

describe('msUntilMidnight', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilMidnight(new Date(2026, 9, 16, 23, 58))).toBe(2 * 60 * 1000);
    expect(msUntilMidnight(new Date(2026, 9, 16, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
});

describe('watchToday', () => {
  it('says so at midnight, and only once the day has changed', () => {
    const seen: string[] = [];
    const stop = watchToday('2026-10-16', d => seen.push(d));

    vi.advanceTimersByTime(60 * 1000);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(60 * 1000);
    expect(seen).toEqual(['2026-10-17']);
    // And again the next night.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(seen).toEqual(['2026-10-17', '2026-10-18']);
    stop();
  });

  it('checks when the tab is shown again or the window gets focus', () => {
    const seen: string[] = [];
    const stop = watchToday('2026-10-16', d => seen.push(d));

    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([]);

    // A laptop asleep overnight: the clock moved, no timer fired.
    vi.setSystemTime(new Date(2026, 9, 17, 8, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual(['2026-10-17']);

    vi.setSystemTime(new Date(2026, 9, 18, 8, 0));
    window.dispatchEvent(new Event('focus'));
    expect(seen).toEqual(['2026-10-17', '2026-10-18']);
    stop();
  });

  it('says so at once when the day already moved', () => {
    const seen: string[] = [];
    watchToday('2026-10-15', d => seen.push(d))();
    expect(seen).toEqual(['2026-10-16']);
  });

  it('stops watching when told to', () => {
    const seen: string[] = [];
    watchToday('2026-10-16', d => seen.push(d))();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    window.dispatchEvent(new Event('focus'));
    expect(seen).toEqual([]);
  });
});
