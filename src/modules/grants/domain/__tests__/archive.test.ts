import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { isArchived } from '../../../../core/archive';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { grantsForPeriod } from '../../screens/money/bva';
import {
  deadlines,
  fundersList,
  funderTotals,
  fyTotals,
  grantActivity,
  grantById,
  grantsByFunder,
  grantsByView,
  pipelineCounts,
} from '../derive';
import {
  eligibleLines,
  expensesMissingBackup,
  isTracked,
  nextReminder,
  offPaceGrants,
  reportsOwed,
  trackedGrants,
  trackedGrantsInFy,
} from '../money';
import { SEED_TODAY, makeSeed } from '../seed';
import {
  LINE_IN_USE_REFUSAL,
  PAYMENT_RECEIVED_REFUSAL,
  describeChange,
  grantsSlice,
} from '../slice';
import type { GrantsAction } from '../slice';
import type { GrantsState } from '../types';

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const TODAY = '2026-10-07';
const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const LAC = 'g-la-county-2026';
const PORT = 'g-port-of-long-beach-2026';

/** The grants slice behind its real rules, as the store wires it. */
function harness(user: SignedInUser = KEISHA) {
  let grants = makeSeed();
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const portal = () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState;
  const actions = guardActions(
    grantsSlice.createActions(
      (action: AnyAction) => {
        sent.push(action);
        grants = grantsSlice.reducer(grants, action);
      },
      portal,
      { today: TODAY, newId: prefix => `${prefix}-a${(n += 1)}`, user },
    ),
    grantsSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  return { actions, grants: () => grants, portal, refused, sent };
}

const as = (role: Role): SignedInUser => ({ id: 's-someone', name: 'Someone', role });

describe('archiving and restoring a grant', () => {
  it('archives with the date and the person, and logs Archived', () => {
    const h = harness();
    h.actions.archiveGrant(PORT);
    expect(grantById(h.portal(), PORT)).toMatchObject({
      archivedAt: TODAY,
      archivedById: 's-keisha',
    });
    expect(grantActivity(h.portal(), PORT)[0]).toMatchObject({
      text: 'Archived',
      whoId: 's-keisha',
    });
    // The grant and its activity row are one change.
    expect(h.sent).toHaveLength(1);
    expect(grantsSlice.describe!(h.sent[0])).toBe('the archive change');
  });

  it('restores by clearing both fields, and logs Restored', () => {
    const h = harness();
    h.actions.archiveGrant(PORT);
    h.actions.restoreGrant(PORT);
    const grant = grantById(h.portal(), PORT)!;
    expect(isArchived(grant)).toBe(false);
    expect(JSON.parse(JSON.stringify(grant))).not.toHaveProperty('archivedAt');
    expect(
      grantActivity(h.portal(), PORT)
        .map(a => a.text)
        .slice(0, 2),
    ).toEqual(expect.arrayContaining(['Archived', 'Restored']));
  });

  it('follows the pipeline row: the assistant may, the bookkeeper and Read-only may not', () => {
    const a = harness(as('assistant'));
    a.actions.archiveGrant(PORT);
    expect(isArchived(grantById(a.portal(), PORT))).toBe(true);
    for (const role of ['bookkeeper', 'read-only', 'teacher'] as Role[]) {
      const h = harness(as(role));
      h.actions.archiveGrant(PORT);
      h.actions.archiveFunder('f-parsons');
      expect(h.refused).toHaveLength(2);
      expect(isArchived(grantById(h.portal(), PORT))).toBe(false);
    }
  });
});

describe('an archived grant leaves the everyday lists', () => {
  const archived = (id: string) => {
    const h = harness();
    h.actions.archiveGrant(id);
    return h.portal();
  };

  it('leaves the grants list unless archived ones are asked for, and then comes last', () => {
    const before = makeState();
    const state = archived(PORT);
    expect(grantsByView(state, 'active').map(g => g.id)).not.toContain(PORT);
    expect(grantsByView(state, 'active')).toHaveLength(grantsByView(before, 'active').length - 1);
    expect(grantsByView(state, 'active', true).at(-1)?.id).toBe(PORT);
    expect(grantsByView(state, 'all', true)).toHaveLength(before.grants.grants.length);
  });

  it('leaves the pipeline, the deadlines and the FY totals', () => {
    const before = makeState();
    const state = archived(PORT);
    expect(deadlines(state, SEED_TODAY).some(d => d.grantId === PORT)).toBe(false);
    expect(deadlines(before, SEED_TODAY).some(d => d.grantId === PORT)).toBe(true);
    const applying = (s: PortalState) => pipelineCounts(s).find(b => b.phase === 'applying')!;
    expect(applying(state).count).toBe(applying(before).count - 1);
  });

  it('leaves the reports owed, the reminders, the pace warnings and the spending screens', () => {
    const state = archived(LAC);
    expect(reportsOwed(state).some(r => r.grantId === LAC)).toBe(false);
    expect(nextReminder(state, SEED_TODAY)?.report.grantId).not.toBe(LAC);
    expect(trackedGrants(state).map(g => g.id)).not.toContain(LAC);
    expect(trackedGrantsInFy(state, SEED_TODAY).map(g => g.id)).not.toContain(LAC);
    expect(isTracked(grantById(state, LAC)!)).toBe(false);

    const fast = archived(HA);
    expect(offPaceGrants(fast, SEED_TODAY).map(g => g.id)).not.toContain(HA);
    expect(expensesMissingBackup(fast).some(e => e.grantId === HA)).toBe(false);
  });

  it('takes no new spending', () => {
    const state = archived(HA);
    expect(eligibleLines(state, SEED_TODAY).some(l => l.grantId === HA)).toBe(false);
    expect(eligibleLines(makeState(), SEED_TODAY).some(l => l.grantId === HA)).toBe(true);
  });

  it('stays in the history: Budget vs. actual over all time and last year, the funder, the activity', () => {
    const state = archived(LAC);
    // A range that includes the archived grant's period still shows it.
    expect(grantsForPeriod(state, SEED_TODAY, 'all').map(g => g.id)).toContain(LAC);
    expect(grantsForPeriod(state, SEED_TODAY, 'fy-prev').map(g => g.id)).toContain(LAC);
    expect(grantsForPeriod(state, SEED_TODAY, 'fy').map(g => g.id)).not.toContain(LAC);
    expect(grantsByFunder(state, 'f-la-county-arts').map(g => g.id)).toContain(LAC);
    expect(funderTotals(state, 'f-la-county-arts')).toEqual(
      funderTotals(makeState(), 'f-la-county-arts'),
    );
    expect(grantActivity(state, LAC).length).toBeGreaterThan(1);
  });

  it('leaves this fiscal year’s totals', () => {
    const before = fyTotals(makeState(), SEED_TODAY);
    const after = fyTotals(archived(LBCF), SEED_TODAY);
    expect(after.awarded).toBeLessThan(before.awarded);
    expect(after.spent).toBeLessThan(before.spent);
  });
});

describe('archiving a funder', () => {
  it('archives and restores, and leaves its grants as they are', () => {
    const h = harness();
    h.actions.archiveFunder('f-herb-alpert');
    expect(fundersList(h.portal()).map(f => f.id)).not.toContain('f-herb-alpert');
    expect(fundersList(h.portal(), true).at(-1)?.id).toBe('f-herb-alpert');
    // Nothing cascades.
    expect(isArchived(grantById(h.portal(), HA))).toBe(false);
    expect(trackedGrants(h.portal()).map(g => g.id)).toContain(HA);

    h.actions.restoreFunder('f-herb-alpert');
    expect(fundersList(h.portal()).map(f => f.id)).toContain('f-herb-alpert');
  });
});

describe('what may still be removed (decision 0002)', () => {
  it('keeps a received payment, and removes one still expected', () => {
    const h = harness();
    const received = h.grants().payments.find(p => p.receivedDate)!;
    const expected = h.grants().payments.find(p => !p.receivedDate)!;
    h.actions.deletePayment(received.id);
    expect(h.refused).toEqual([PAYMENT_RECEIVED_REFUSAL]);
    expect(h.grants().payments.some(p => p.id === received.id)).toBe(true);
    h.actions.deletePayment(expected.id);
    expect(h.grants().payments.some(p => p.id === expected.id)).toBe(false);
  });

  it('keeps a budget line with expenses on it until they move', () => {
    const h = harness();
    h.actions.deleteBudgetLine('bl-ha-repair');
    expect(h.refused).toEqual([LINE_IN_USE_REFUSAL]);
    expect(h.grants().budgetLines.some(l => l.id === 'bl-ha-repair')).toBe(true);
    h.actions.moveExpenses('bl-ha-repair', 'bl-ha-music');
    h.actions.deleteBudgetLine('bl-ha-repair');
    expect(h.grants().budgetLines.some(l => l.id === 'bl-ha-repair')).toBe(false);
  });
});

describe('loading a saved grants slice', () => {
  it('keeps archive fields that are strings and drops any that are not', () => {
    const saved = makeSeed() as GrantsState;
    saved.grants[0] = { ...saved.grants[0], archivedAt: TODAY, archivedById: 's-keisha' };
    (saved.funders[0] as unknown as Record<string, unknown>).archivedAt = null;
    const loaded = grantsSlice.normalise!(JSON.parse(JSON.stringify(saved)))!;
    expect(loaded.grants[0]).toMatchObject({ archivedAt: TODAY, archivedById: 's-keisha' });
    expect(loaded.funders[0]).not.toHaveProperty('archivedAt');
  });

  it('names an archive change and an ordinary one apart', () => {
    const archive: GrantsAction = {
      type: 'update',
      key: 'funders',
      id: 'f-parsons',
      patch: { archivedAt: TODAY, archivedById: 's-keisha' },
    };
    expect(describeChange(archive)).toBe('the archive change');
    expect(describeChange({ type: 'update', key: 'funders', id: 'f', patch: { name: 'x' } })).toBe(
      'the funder',
    );
  });
});

function makeState(): PortalState {
  return { core: makeCoreSeed(), grants: makeSeed() } as unknown as PortalState;
}
