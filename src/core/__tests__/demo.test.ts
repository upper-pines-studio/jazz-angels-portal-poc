import { describe, expect, it } from 'vitest';
import { demoFromEnv, demoTodayFrom, demoTodayToStore } from '../demo';
import { SEED_TODAY } from '../seed';

describe('the demo switch', () => {
  it('is on in a dev build and off in a production build when VITE_DEMO is unset', () => {
    expect(demoFromEnv(undefined, true)).toBe(true);
    expect(demoFromEnv(undefined, false)).toBe(false);
    expect(demoFromEnv('', false)).toBe(false);
  });

  it('follows VITE_DEMO when it is set, whatever the build', () => {
    expect(demoFromEnv('1', false)).toBe(true);
    expect(demoFromEnv('true', false)).toBe(true);
    expect(demoFromEnv('TRUE', false)).toBe(true);
    expect(demoFromEnv('0', true)).toBe(false);
    expect(demoFromEnv('false', true)).toBe(false);
  });
});

describe('the demo date preference', () => {
  it("is the seed's day when nothing is stored", () => {
    expect(demoTodayFrom(null)).toBe(SEED_TODAY);
  });

  it('round-trips a date and the real clock', () => {
    expect(demoTodayFrom(demoTodayToStore('2026-10-01'))).toBe('2026-10-01');
    expect(demoTodayFrom(demoTodayToStore(undefined))).toBeUndefined();
  });

  it("falls back to the seed's day on anything unreadable", () => {
    expect(demoTodayFrom('next tuesday')).toBe(SEED_TODAY);
  });
});
