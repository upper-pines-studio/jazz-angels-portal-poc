import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  deadlines,
  fiscalYear,
  fyTotals,
  grantDeadlines,
  grantMoney,
  grantsByView,
  nextDeadline,
  pipelineCounts,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';

const state = makeSeed();
const today = SEED_TODAY; // 2026-09-13

describe('deadlines', () => {
  const all = deadlines(state, today);

  it('is sorted by date, ascending', () => {
    const dates = all.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('has exactly one overdue item — the Arts Council application', () => {
    const overdue = all.filter((d) => d.status === 'overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({
      grantId: 'g-arts-council-lb-2026',
      date: '2026-09-05',
    });
  });

  it('treats the Parsons LOI on Sep 26 as due soon', () => {
    const loi = all.find((d) => d.grantId === 'g-parsons-2026' && d.date === '2026-09-26');
    expect(loi).toBeDefined();
    expect(loi!.kind).toBe('loi');
    expect(loi!.status).toBe('due-soon');
  });

  it('uses a 14-day due-soon window, inclusive', () => {
    for (const d of all) {
      const days = Math.round(
        (new Date(`${d.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
          86_400_000,
      );
      if (days < 0) expect(d.status).toBe('overdue');
      else if (days <= 14) expect(d.status).toBe('due-soon');
      else expect(d.status).toBe('upcoming');
    }
  });

  it('puts the LA County final report 17 days out, so upcoming rather than due soon', () => {
    const report = all.find((d) => d.id === 'report:rep-lac-final');
    expect(report).toMatchObject({ date: '2026-09-30', kind: 'report', status: 'upcoming' });
  });

  it('ignores grants in a terminal phase', () => {
    expect(all.some((d) => d.grantId === 'g-boeing-2026')).toBe(false);
    expect(all.some((d) => d.grantId === 'g-wells-fargo-2025')).toBe(false);
  });

  it('ignores payments already received and reports already submitted', () => {
    expect(all.some((d) => d.id === 'payment:pay-ha-1')).toBe(false);
    expect(all.find((d) => d.id === 'payment:pay-ha-2')).toMatchObject({ date: '2027-01-15' });
    expect(all.some((d) => d.id === 'report:rep-wf-final')).toBe(false);
  });

  it('gives every deadline a grant and an owner', () => {
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((d) => !!d.grantId && !!d.ownerId)).toBe(true);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
  });

  it('scopes and picks the next one per grant', () => {
    const parsons = grantDeadlines(state, 'g-parsons-2026', today);
    expect(parsons.every((d) => d.grantId === 'g-parsons-2026')).toBe(true);
    expect(nextDeadline(state, 'g-parsons-2026', today)).toEqual(parsons[0]);
    expect(nextDeadline(state, 'g-boeing-2026', today)).toBeUndefined();
  });
});

describe('grantMoney', () => {
  it('adds up the Herb Alpert grant', () => {
    const money = grantMoney(state, 'g-herb-alpert-2026');
    expect(money.awarded).toBe(50_000);
    expect(money.received).toBe(25_000);
    expect(money.expectedRemaining).toBe(25_000);
    expect(money.spent).toBe(18_240);
    expect(money.remaining).toBe(31_760);
    expect(money.plannedTotal).toBe(50_000);
  });

  it('breaks spend down by budget line', () => {
    const { byLine } = grantMoney(state, 'g-herb-alpert-2026');
    expect(byLine.map((b) => [b.line.category, b.line.planned, b.spent])).toEqual([
      ['Teaching artist stipends', 22_000, 12_650],
      ['Sheet music and charts', 3_000, 680],
      ['Instrument repair', 5_000, 2_020],
      ['Venue and performances', 12_000, 1_800],
      ['Admin and insurance', 8_000, 1_090],
    ]);
    expect(byLine.reduce((sum, b) => sum + b.spent, 0)).toBe(18_240);
  });

  it('returns zeroes for a grant with no money yet', () => {
    const money = grantMoney(state, 'g-parsons-2026');
    expect(money).toMatchObject({ awarded: 0, received: 0, spent: 0, plannedTotal: 0 });
    expect(money.byLine).toEqual([]);
  });
});

describe('fiscalYear', () => {
  it('names the year by the year it ends', () => {
    expect(fiscalYear('2026-09-13', 7)).toEqual({
      label: 'FY27',
      start: '2026-07-01',
      end: '2027-06-30',
    });
  });

  it('puts June in the previous fiscal year', () => {
    expect(fiscalYear('2026-06-30', 7)).toEqual({
      label: 'FY26',
      start: '2025-07-01',
      end: '2026-06-30',
    });
    expect(fiscalYear('2026-07-01', 7).label).toBe('FY27');
  });

  it('handles a calendar fiscal year', () => {
    expect(fiscalYear('2026-03-04', 1)).toEqual({
      label: 'FY26',
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
});

describe('fyTotals', () => {
  const totals = fyTotals(state, today);

  it('reports FY27', () => {
    expect(totals.label).toBe('FY27');
    expect(totals.start).toBe('2026-07-01');
  });

  it('counts $58,500 awarded this fiscal year', () => {
    expect(totals.awarded).toBe(58_500);
  });

  it('counts what has actually arrived and been spent', () => {
    expect(totals.received).toBe(33_500);
    expect(totals.spent).toBe(18_240 + 2_425);
  });

  it('counts what we asked for this fiscal year', () => {
    expect(totals.requested).toBe(6_000);
  });
});

describe('pipelineCounts', () => {
  const buckets = pipelineCounts(state);

  it('covers the eight phases plus declined and withdrawn', () => {
    expect(buckets.map((b) => b.phase)).toEqual([
      'prospect',
      'loi',
      'applying',
      'submitted',
      'awarded',
      'active',
      'reporting',
      'closed',
      'declined',
      'withdrawn',
    ]);
  });

  it('counts the seeded grants', () => {
    const by = Object.fromEntries(buckets.map((b) => [b.phase, b]));
    expect(by.prospect.count).toBe(1);
    expect(by.loi.count).toBe(1);
    expect(by.applying.count).toBe(2);
    expect(by.submitted.count).toBe(1);
    expect(by.active.count).toBe(2);
    expect(by.reporting.count).toBe(1);
    expect(by.closed.count).toBe(1);
    expect(by.declined.count).toBe(1);
    expect(by.withdrawn.count).toBe(0);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(state.grants.length);
  });

  it('sums the money per phase', () => {
    const applying = buckets.find((b) => b.phase === 'applying')!;
    expect(applying.requested).toBe(15_000 + 7_500);
    expect(buckets.find((b) => b.phase === 'active')!.awarded).toBe(58_500);
  });
});

describe('grantsByView', () => {
  it('splits the tabs', () => {
    expect(grantsByView(state, 'all')).toHaveLength(10);
    expect(grantsByView(state, 'pre-award').map((g) => g.phase).sort()).toEqual([
      'applying',
      'applying',
      'loi',
      'prospect',
      'submitted',
    ]);
    expect(grantsByView(state, 'post-award')).toHaveLength(4);
    expect(grantsByView(state, 'closed').map((g) => g.id).sort()).toEqual([
      'g-boeing-2026',
      'g-wells-fargo-2025',
    ]);
    expect(grantsByView(state, 'active')).toHaveLength(8);
  });
});

describe('checklistProgress', () => {
  it('counts done against total', () => {
    const progress = checklistProgress(state, 'g-arts-council-lb-2026');
    expect(progress.total).toBeGreaterThan(0);
    expect(progress.done).toBeLessThan(progress.total);
    expect(progress.done).toBe(
      state.tasks.filter((t) => t.grantId === 'g-arts-council-lb-2026' && t.done).length,
    );
  });

  it('leaves "Submit application" open and overdue on the Arts Council grant', () => {
    const task = state.tasks.find(
      (t) => t.grantId === 'g-arts-council-lb-2026' && t.title === 'Submit application',
    );
    expect(task).toMatchObject({ done: false, dueDate: '2026-09-05' });
  });

  it('returns zeroes for an unknown grant', () => {
    expect(checklistProgress(state, 'nope')).toEqual({ done: 0, total: 0 });
  });
});
