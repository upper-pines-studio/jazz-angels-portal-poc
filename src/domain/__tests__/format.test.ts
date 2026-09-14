import { describe, expect, it } from 'vitest';
import {
  dateLong,
  dateRange,
  dateShort,
  daysUntil,
  initials,
  money,
  relativeDays,
  toISO,
} from '../format';

describe('money', () => {
  it('writes whole dollars with separators', () => {
    expect(money(25_000)).toBe('$25,000');
    expect(money(0)).toBe('$0');
    expect(money(1_234_567)).toBe('$1,234,567');
    expect(money(-1_200)).toBe('-$1,200');
    expect(money(undefined)).toBe('$0');
  });
});

describe('dates', () => {
  it('formats short and long', () => {
    expect(dateShort('2026-09-26')).toBe('Sep 26');
    expect(dateLong('2026-09-26')).toBe('Sep 26, 2026');
    expect(dateShort(undefined)).toBe('—');
  });

  it('does not drift a day across timezones', () => {
    expect(dateLong('2026-01-01')).toBe('Jan 1, 2026');
    expect(dateLong('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('writes ranges, sharing the year when it is the same', () => {
    expect(dateRange('2026-07-01', '2027-06-30')).toBe('Jul 1, 2026 – Jun 30, 2027');
    expect(dateRange('2026-03-01', '2026-08-31')).toBe('Mar 1 – Aug 31, 2026');
    expect(dateRange(undefined, undefined)).toBe('—');
  });

  it('counts days relative to today', () => {
    expect(relativeDays('2026-09-26', '2026-09-13')).toBe('in 13 days');
    expect(relativeDays('2026-09-10', '2026-09-13')).toBe('3 days ago');
    expect(relativeDays('2026-09-13', '2026-09-13')).toBe('today');
    expect(relativeDays('2026-09-14', '2026-09-13')).toBe('tomorrow');
    expect(relativeDays('2026-09-12', '2026-09-13')).toBe('yesterday');
    expect(daysUntil('2026-09-30', '2026-09-13')).toBe(17);
  });

  it('round-trips a Date through toISO', () => {
    expect(toISO(new Date(2026, 8, 13))).toBe('2026-09-13');
  });
});

describe('initials', () => {
  it('takes first and last', () => {
    expect(initials('Barry Cogert')).toBe('BC');
    expect(initials('Denise Moreno')).toBe('DM');
    expect(initials('Albert  Alva')).toBe('AA');
    expect(initials('Cher')).toBe('C');
    expect(initials('')).toBe('');
  });
});
