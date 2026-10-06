import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { grantMoney } from '../derive';
import {
  acceptableSuggestions,
  backupSummary,
  grantPace,
  lineNeedsAttention,
  linePaces,
  nextReminder,
  offPaceGrants,
  percent,
  reminderPlanFor,
  reminderSchedule,
  reportsOwed,
  splitByPercent,
  suggestionFor,
  trackedGrants,
  transactionAllocations,
  transactionCounts,
} from '../money';
import { SEED_TODAY, makeSeed } from '../seed';
import { reducer } from '../slice';

const make = (): PortalState =>
  ({ core: makeCoreSeed(), grants: makeSeed() }) as unknown as PortalState;
const state = make();
const today = SEED_TODAY; // 2026-09-13

const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const LAC = 'g-la-county-2026';

describe('the three grants with money', () => {
  it('tracks Herb Alpert, Long Beach and LA County, and not the closed grant', () => {
    expect(
      trackedGrants(state)
        .map(g => g.id)
        .sort(),
    ).toEqual([HA, LAC, LBCF].sort());
  });

  it('adds up to the totals in the brief', () => {
    const money = [HA, LBCF, LAC].map(id => grantMoney(state, id));
    expect(money.map(m => m.spent)).toEqual([18240, 2425, 21460]);
    expect(money.reduce((sum, m) => sum + m.awarded, 0)).toBe(80500);
    expect(money.reduce((sum, m) => sum + m.spent, 0)).toBe(42125);
    expect(money.reduce((sum, m) => sum + m.remaining, 0)).toBe(38375);
  });
});

describe('pacing', () => {
  it('Herb Alpert is spending fast and runs out around Jan 22', () => {
    const p = grantPace(state, HA, today);
    expect(p.status).toBe('spending-fast');
    expect(percent(p.used)).toBe('36%');
    expect(Math.round(p.elapsed * 100)).toBe(21);
    expect(p.daysElapsed).toBe(75);
    expect(p.runsOutOn).toBe('2027-01-22');
    expect(Math.round(p.perMonthSoFar / 100) * 100).toBe(7400);
    expect(Math.round(p.perMonthNeeded / 100) * 100).toBe(3300);
  });

  it('teaching artist stipends drive it, running out around Nov 8', () => {
    const lines = linePaces(state, HA, today);
    const stipends = lines.find(l => l.line.id === 'bl-ha-stipends')!;
    expect(stipends.status).toBe('spending-fast');
    expect(percent(stipends.used)).toBe('58%');
    expect(stipends.runsOutOn).toBe('2026-11-08');
    expect(lines.find(l => l.line.id === 'bl-ha-repair')!.status).toBe('ahead');
    expect(lines.find(l => l.line.id === 'bl-ha-venue')!.status).toBe('on-track');
  });

  it('Long Beach is spending slow, with about $4,000 left on the end date', () => {
    const p = grantPace(state, LBCF, today);
    expect(p.status).toBe('spending-slow');
    expect(p.daysElapsed).toBe(197);
    expect(Math.round(p.projectedSpent / 100) * 100).toBe(4500);
    expect(Math.round(p.projectedUnspent / 100) * 100).toBe(4000);
  });

  it('LA County has ended with $540 unspent', () => {
    const p = grantPace(state, LAC, today);
    expect(p.status).toBe('period-ended');
    expect(p.remaining).toBe(540);
  });

  it('two grants are off pace, and three open lines need attention', () => {
    expect(offPaceGrants(state, today)).toHaveLength(2);
    const lines = [HA, LBCF].flatMap(id => linePaces(state, id, today));
    expect(lines.filter(lineNeedsAttention)).toHaveLength(3);
  });
});

describe('transactions', () => {
  it('counts what the brief counts', () => {
    expect(transactionCounts(state)).toEqual({
      'to-assign': 14,
      assigned: 86,
      'not-grant-funded': 41,
      all: 141,
    });
  });

  it('has eight proposals waiting', () => {
    expect(acceptableSuggestions(state)).toHaveLength(8);
  });

  it('cannot choose for an account two grants share', () => {
    const rent = state.grants.transactions.find(t => t.id === 'tx-new-2')!;
    const s = suggestionFor(state, rent);
    expect(s.kind).toBe('ambiguous');
    expect(s.kind === 'ambiguous' && s.hint).toBe('6500 fits two grants. Pick one or split.');
  });

  it('says so when no budget line uses the account', () => {
    const room = state.grants.transactions.find(t => t.id === 'tx-new-9')!;
    expect(suggestionFor(state, room)).toEqual({
      kind: 'none',
      hint: 'No budget line uses 6510 yet',
    });
  });

  it('splits whole dollars that add back up', () => {
    expect(splitByPercent(2400, [75, 25])).toEqual([1800, 600]);
    expect(splitByPercent(100, [33, 33, 34]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitByPercent(101, [50, 50]).reduce((a, b) => a + b, 0)).toBe(101);
  });

  it('a split becomes two expenses and moves both budgets', () => {
    const next = reducer(state.grants, {
      type: 'assign-transaction',
      id: 'tx-new-2',
      parts: [
        {
          grantId: HA,
          budgetLineId: 'bl-ha-venue',
          amount: 1800,
          expenseId: 'ex-a',
          activityId: 'act-a',
        },
        {
          grantId: LBCF,
          budgetLineId: 'bl-lbcf-venue',
          amount: 600,
          expenseId: 'ex-b',
          activityId: 'act-b',
        },
      ],
      by: 's-barry',
      date: today,
      at: `${today}T10:00:00.000Z`,
      whoId: 's-barry',
    });
    const after = { ...state, grants: next } as PortalState;
    expect(transactionAllocations(after, 'tx-new-2')).toHaveLength(2);
    expect(grantMoney(after, HA).spent).toBe(18240 + 1800);
    expect(grantMoney(after, LBCF).spent).toBe(2425 + 600);
    expect(transactionCounts(after)['to-assign']).toBe(13);

    const undone = reducer(next, {
      type: 'set-transaction-status',
      id: 'tx-new-2',
      status: 'to-assign',
    });
    expect(grantMoney({ ...state, grants: undone } as PortalState, HA).spent).toBe(18240);
  });

  it('a sync brings in what was waiting in QuickBooks', () => {
    const next = reducer(state.grants, { type: 'sync', at: `${today}T09:15` });
    expect(next.transactions).toHaveLength(144);
    expect(next.incoming).toHaveLength(0);
    expect(next.quickbooks.lastSyncedAt).toBe(`${today}T09:15`);
  });
});

describe('backup', () => {
  it('Herb Alpert has 13 files on 7 expenses and 3 expenses with none', () => {
    expect(backupSummary(state, HA)).toMatchObject({
      expenses: 10,
      total: 18240,
      withBackup: 7,
      files: 13,
      missing: 3,
    });
  });

  it('LA County is complete', () => {
    expect(backupSummary(state, LAC)).toMatchObject({ expenses: 72, missing: 0 });
  });
});

describe('reminders', () => {
  it('four reports are owed, LA County first', () => {
    const owed = reportsOwed(state);
    expect(owed.map(r => r.id)).toEqual([
      'rep-lac-final',
      'rep-ha-interim',
      'rep-lbcf-final',
      'rep-ha-final',
    ]);
  });

  it('the 30 day reminder has gone and the 14 day one is next', () => {
    const steps = reminderSchedule(state, 'rep-lac-final', today);
    expect(steps.map(s => [s.offset, s.date, s.state])).toEqual([
      [30, '2026-08-31', 'sent'],
      [14, '2026-09-16', 'next'],
      [7, '2026-09-23', 'off'],
      [3, '2026-09-27', 'scheduled'],
      [0, '2026-09-30', 'scheduled'],
    ]);
    expect(nextReminder(state, today)?.step.date).toBe('2026-09-16');
  });

  it('a report with no plan follows the defaults, sent to the owner and Denise', () => {
    const plan = reminderPlanFor(state, 'rep-ha-interim');
    expect(plan.isDefault).toBe(true);
    expect(plan.offsets).toEqual([30, 14, 3]);
    expect(plan.recipientIds).toEqual(['s-barry', 's-denise']);
  });
});
