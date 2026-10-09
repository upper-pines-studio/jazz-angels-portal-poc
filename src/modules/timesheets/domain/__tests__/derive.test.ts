import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import {
  awaitingApproval,
  entriesForWeek,
  hoursByProgram,
  hoursForProgram,
  hoursThisMonth,
  monthRange,
  ownDrafts,
  weekRange,
  weekStart,
  weekTotals,
} from '../derive';
import { SEED_TODAY, SEED_WEEK_START, makeSeed } from '../seed';

const state = { core: makeCoreSeed(), timesheets: makeSeed() } as unknown as PortalState;
const today = SEED_TODAY; // Sunday 2026-09-13

/** Last spring's term, the range a grant period would ask about. */
const SPRING = { from: '2026-03-01', to: '2026-04-26' };

describe('weeks', () => {
  it('runs Monday to Sunday, so today closes the week of Sep 7', () => {
    expect(weekStart(today)).toBe(SEED_WEEK_START);
    expect(weekRange(SEED_WEEK_START)).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });

  it('adds up this week', () => {
    const totals = weekTotals(state, SEED_WEEK_START);
    expect(totals.entries).toBe(11);
    expect(totals.hours).toBe(22.75);
    expect(totals.teachers).toBe(4);
    expect(totals.awaiting).toBe(2);
    expect(totals.awaitingHours).toBe(6.25);
  });

  it('returns the week oldest first, and only that week', () => {
    const entries = entriesForWeek(state, SEED_WEEK_START);
    const dates = entries.map(e => e.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.every(d => d >= '2026-09-07' && d <= '2026-09-13')).toBe(true);
  });
});

describe('awaitingApproval', () => {
  it('is Devon and Renee, and nobody else', () => {
    const waiting = awaitingApproval(state);
    expect(waiting).toHaveLength(2);
    expect(waiting.map(e => e.staffId)).toEqual(['s-renee', 's-devon']);
    expect(waiting.every(e => e.status === 'submitted')).toBe(true);
  });
});

describe('ownDrafts', () => {
  it("is the person's own drafts for the week, oldest first, and nobody else's", () => {
    const week = entriesForWeek(state, SEED_WEEK_START);
    const albert = ownDrafts({ id: 's-albert' }, week);
    expect(albert.length).toBeGreaterThan(0);
    expect(albert.every(e => e.staffId === 's-albert' && e.status === 'draft')).toBe(true);
    expect(albert.map(e => e.date)).toEqual(albert.map(e => e.date).sort());
    // Devon's only entry that week is submitted, so there is nothing to hand over.
    expect(ownDrafts({ id: 's-devon' }, week)).toEqual([]);
  });
});

describe('hoursByProgram', () => {
  const spring = hoursByProgram(state, SPRING);

  it('covers every program worked in the range, biggest first', () => {
    expect(spring.map(p => p.programId)).toEqual([
      'studio-sessions',
      'homeschool',
      'in-school',
      'advanced-workshop',
      'jazz-legacy',
      'general-operating',
    ]);
    const hours = spring.map(p => p.hours);
    expect([...hours].sort((a, b) => b - a)).toEqual(hours);
  });

  it('totals the spring term, eight weeks of it', () => {
    expect(spring).toContainEqual({ programId: 'studio-sessions', hours: 28 });
    expect(spring).toContainEqual({ programId: 'in-school', hours: 16 });
    expect(spring.reduce((sum, p) => sum + p.hours, 0)).toBe(92);
  });

  it('leaves out anything outside the range', () => {
    const oneSunday = hoursByProgram(state, { from: '2026-03-01', to: '2026-03-01' });
    expect(oneSunday).toEqual([{ programId: 'studio-sessions', hours: 3.5 }]);
  });

  it('is empty when nothing was logged in the range', () => {
    expect(hoursByProgram(state, { from: '2026-06-01', to: '2026-06-30' })).toEqual([]);
  });
});

describe('hoursForProgram', () => {
  it('agrees with hoursByProgram over the same range', () => {
    for (const { programId, hours } of hoursByProgram(state, SPRING)) {
      expect(hoursForProgram(state, programId, SPRING.from, SPRING.to)).toBe(hours);
    }
  });

  it('gives a grant its in-school hours for the period', () => {
    expect(hoursForProgram(state, 'in-school', SPRING.from, SPRING.to)).toBe(16);
  });

  it('is 0 for a program with nothing in the range', () => {
    expect(hoursForProgram(state, 'in-school', '2026-06-01', '2026-06-30')).toBe(0);
  });
});

describe('hoursThisMonth', () => {
  it('counts September to date, this week and the days before it', () => {
    expect(monthRange(today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(hoursThisMonth(state, today)).toBe(36.25);
  });
});
