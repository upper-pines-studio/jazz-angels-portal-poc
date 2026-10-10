import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { ENTERED, isRenewalLine, phaseEnteredOn } from '../phases';
import {
  funderGrantHistory,
  nextYearDates,
  nextYearTitle,
  renewalDraft,
  renewalDates,
  renewalOf,
  renewalRefusal,
  renewalStartedText,
  renewedAsText,
  renewalTemplateId,
  renewedAs,
  withRenewalLinks,
} from '../renewals';
import { makeSeed } from '../seed';
import { grantsSlice, mayRenew } from '../slice';
import type { GrantsActions } from '../slice';
import { defaultTemplates } from '../templates';
import type { Grant, GrantsState, RenewGrantInput } from '../types';

const HA = 'g-herb-alpert-2026';
const GWEN: SignedInUser = { id: 's-gwen', name: 'Gwen', role: 'admin' };

/** The real reducer and actions over the seed, signed in as `user`. */
function harness(user: SignedInUser = GWEN, grants: GrantsState = makeSeed()) {
  let n = 0;
  let core = makeCoreSeed();
  const portal = () => ({ core, grants }) as unknown as PortalState;
  const raw = grantsSlice.createActions(
    (action: AnyAction) => {
      grants = grantsSlice.reducer(grants, action);
    },
    portal,
    { today: '2026-10-10', newId: prefix => `${prefix}-r${(n += 1)}`, user },
  );
  const refusals: string[] = [];
  const actions = guardActions(raw, grantsSlice.rules, portal, user, m => refusals.push(m));
  return {
    actions,
    refusals,
    grants: () => grants,
    portal,
    setCore: (next: typeof core) => (core = next),
  };
}

function input(state: PortalState, grantId = HA, patch: Partial<RenewGrantInput> = {}) {
  const grant = state.grants.grants.find(g => g.id === grantId)!;
  const draft = renewalDraft(state, grant);
  return {
    grantId,
    title: draft.title,
    amountRequested: draft.amountRequested,
    dates: draft.dates,
    ownerId: draft.ownerId,
    programs: draft.programs,
    ...patch,
  };
}

describe('nextYearTitle', () => {
  it('moves a four-digit year on by one', () => {
    expect(nextYearTitle('General operating support 2026')).toBe('General operating support 2027');
    expect(nextYearTitle('Homeschool Program 2025')).toBe('Homeschool Program 2026');
  });

  it('moves a fiscal-year range on, both ends', () => {
    expect(nextYearTitle('Organizational Grant Program FY26-27')).toBe(
      'Organizational Grant Program FY27-28',
    );
    expect(nextYearTitle('Season 2026-27')).toBe('Season 2027-28');
    expect(nextYearTitle('FY2026/2027 support')).toBe('FY2027/2028 support');
    expect(nextYearTitle('FY99-00 support')).toBe('FY00-01 support');
    expect(nextYearTitle('Arts grant FY26')).toBe('Arts grant FY27');
  });

  it('moves every year in the title', () => {
    expect(nextYearTitle('2026 tour and 2027 showcase')).toBe('2027 tour and 2028 showcase');
    expect(nextYearTitle('Spring 2026 residency, fall 2026 concerts')).toBe(
      'Spring 2027 residency, fall 2027 concerts',
    );
  });

  it('moves a fiscal year on its own', () => {
    expect(nextYearTitle('FY26')).toBe('FY27');
    expect(nextYearTitle('Operating support FY 26')).toBe('Operating support FY 27');
  });

  it('keeps a title with no year as it is', () => {
    expect(nextYearTitle('Youth Music Access')).toBe('Youth Music Access');
    expect(nextYearTitle('Serve 120 students in 12 schools')).toBe(
      'Serve 120 students in 12 schools',
    );
  });
});

describe('nextYearDates', () => {
  it('moves the deadlines and the period on by one year', () => {
    expect(
      nextYearDates({
        loiDue: '2026-01-15',
        applicationDue: '2026-04-30',
        submitted: '2026-04-28',
        decisionExpected: '2026-06-30',
        decided: '2026-07-06',
        periodStart: '2026-07-01',
        periodEnd: '2027-06-30',
        startBy: '2026-03-01',
      }),
    ).toEqual({
      loiDue: '2027-01-15',
      applicationDue: '2027-04-30',
      decisionExpected: '2027-06-30',
      periodStart: '2027-07-01',
      periodEnd: '2028-06-30',
    });
  });

  it('leaves a blank date blank', () => {
    expect(nextYearDates({ applicationDue: '2026-04-30' })).toEqual({
      applicationDue: '2027-04-30',
    });
    expect(nextYearDates({})).toEqual({});
  });

  it('takes Feb 29 to Feb 28', () => {
    expect(nextYearDates({ applicationDue: '2028-02-29' })).toEqual({
      applicationDue: '2029-02-28',
    });
  });
});

describe('renewalDraft', () => {
  it("prefills next year's title, this year's award and the dates moved on", () => {
    const h = harness();
    const grant = h.grants().grants.find(g => g.id === HA)!;
    const draft = renewalDraft(h.portal(), grant);
    expect(draft.title).toBe('General operating support 2027');
    expect(draft.amountRequested).toBe(50000);
    expect(draft.dates).toEqual({
      applicationDue: '2027-04-30',
      periodStart: '2027-07-01',
      periodEnd: '2028-06-30',
      startBy: '2027-03-16',
    });
    expect(draft.ownerId).toBe('s-barry');
    expect(draft.archivedOwner).toBeUndefined();
    expect(draft.archivedPrograms).toEqual([]);
  });

  it('falls back to the request when nothing was awarded', () => {
    const h = harness();
    const grant = { ...h.grants().grants.find(g => g.id === HA)!, amountAwarded: undefined };
    expect(renewalDraft(h.portal(), grant).amountRequested).toBe(50000);
  });

  it('asks again for an archived owner or program', () => {
    const h = harness();
    const core = makeCoreSeed();
    h.setCore({
      ...core,
      staff: core.staff.map(s => (s.id === 's-barry' ? { ...s, archivedAt: '2026-09-01' } : s)),
      programs: core.programs.map(p =>
        p.id === 'homeschool' ? { ...p, archivedAt: '2026-09-01' } : p,
      ),
    });
    const port = h.grants().grants.find(g => g.id === 'g-port-of-long-beach-2026')!;
    const draft = renewalDraft(h.portal(), port);
    expect(draft.ownerId).toBe('');
    expect(draft.archivedOwner).toBe('Barry Cogert');
    expect(draft.programs).toEqual(['in-school']);
    expect(draft.archivedPrograms).toEqual(['Homeschool Program']);
  });
});

describe('renewGrant', () => {
  function renewed() {
    const h = harness();
    const before = h.grants();
    const id = h.actions.renewGrant(input(h.portal()));
    const after = h.grants();
    const next = after.grants.find(g => g.id === id)!;
    return { h, before, after, id, next };
  }

  it("makes a new grant at Prospect that names last year's as the one it renews", () => {
    const { id, next, h } = renewed();
    expect(id).toBeTruthy();
    expect(next).toMatchObject({
      funderId: 'f-herb-alpert',
      title: 'General operating support 2027',
      programs: ['general-operating'],
      restriction: 'unrestricted',
      ownerId: 's-barry',
      phase: 'prospect',
      loiRequired: false,
      amountRequested: 50000,
      createdAt: '2026-10-10',
      renewsGrantId: HA,
    });
    expect(next.amountAwarded).toBeUndefined();
    expect(next.dates.submitted).toBeUndefined();
    expect(next.dates.decided).toBeUndefined();
    expect(next.notes).toBeUndefined();
    expect(renewedAs(h.portal(), HA)?.id).toBe(id);
    expect(renewalOf(h.portal(), next)?.id).toBe(HA);
  });

  it('gets the renewal checklist and the document register', () => {
    const { after, id } = renewed();
    const tasks = after.tasks.filter(t => t.grantId === id);
    expect(tasks.map(t => t.title)).toContain('Confirm the funder is renewing this cycle');
    expect(tasks.map(t => t.title)).toContain('Submit renewal application');
    expect(tasks.find(t => t.title === 'Submit renewal application')?.dueDate).toBe('2027-04-30');
    const docs = after.documents.filter(d => d.grantId === id);
    expect(docs).toHaveLength(5);
    expect(docs.every(d => d.status === 'needed')).toBe(true);
  });

  it("copies the budget's lines and accounts, but not the QuickBooks class", () => {
    const { before, after, id } = renewed();
    const last = before.budgetLines.filter(l => l.grantId === HA);
    const lines = after.budgetLines.filter(l => l.grantId === id);
    expect(last.length).toBeGreaterThan(0);
    expect(last.some(l => l.classId)).toBe(true);
    expect(lines.map(l => [l.category, l.planned, l.accountCodes])).toEqual(
      last.map(l => [l.category, l.planned, l.accountCodes]),
    );
    expect(lines.every(l => l.classId === undefined)).toBe(true);
    expect(lines.every(l => !last.some(o => o.id === l.id))).toBe(true);
    // Last year's lines are as they were.
    expect(after.budgetLines.filter(l => l.grantId === HA)).toEqual(last);
  });

  it('copies no expenses, payments, reports, terms, files, reminder plans, split rules or shares', () => {
    const { before, after, id } = renewed();
    for (const key of [
      'expenses',
      'payments',
      'reports',
      'terms',
      'files',
      'grantShares',
    ] as const) {
      expect((after[key] as Array<{ grantId: string }>).some(r => r.grantId === id)).toBe(false);
      expect(after[key]).toEqual(before[key]);
    }
    expect(after.reminderPlans).toEqual(before.reminderPlans);
    expect(after.splitRules).toEqual(before.splitRules);
  });

  it('logs a line on both grants in the one change, newest first on the funder page', () => {
    let grants = makeSeed();
    const changes: AnyAction[] = [];
    let n = 0;
    const actions = grantsSlice.createActions(
      action => {
        changes.push(action);
        grants = grantsSlice.reducer(grants, action);
      },
      () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState,
      { today: '2026-10-10', newId: p => `${p}-x${(n += 1)}`, user: GWEN },
    );
    const id = actions.renewGrant(
      input({ core: makeCoreSeed(), grants } as unknown as PortalState),
    );
    expect(changes).toHaveLength(1);
    const onNext = grants.activity.filter(a => a.grantId === id);
    const onLast = grants.activity.filter(a => a.grantId === HA).at(-1)!;
    expect(onNext.map(a => a.text)).toEqual([
      'Started as the renewal of General operating support 2026',
    ]);
    expect(onLast.text).toBe('Renewed as General operating support 2027');
    expect(onNext[0].whoId).toBe('s-gwen');
    expect(onLast.whoId).toBe('s-gwen');
    expect(onNext[0].at > onLast.at).toBe(true);
  });

  it('is not read as a phase change by the stepper', () => {
    const { after, next } = renewed();
    for (const row of after.activity.filter(a => /renew/i.test(a.text))) {
      for (const pattern of Object.values(ENTERED)) {
        if (pattern) expect(pattern.test(row.text)).toBe(false);
      }
    }
    const rows = after.activity.filter(a => a.grantId === next.id);
    expect(phaseEnteredOn(next, 'prospect', rows)).toBe('2026-10-10');
    expect(phaseEnteredOn(next, 'applying', rows)).toBeUndefined();
  });

  it('never dates a phase from a renewal line, whatever the title says', () => {
    const titles = [
      'Withdrawn-youth fund 2026',
      'Grant added support 2026',
      'Start application fund 2026',
      'Agreement signed series 2026',
      'Award recorded fund 2026',
      'Record award 2026',
      'Mark submitted 2026',
      'Start report 2026',
      'Grant closed 2026',
      'Record decline 2026',
      'Start LOI 2026',
    ];
    const grant = {
      createdAt: '2026-10-10',
      dates: {},
    };
    for (const title of titles) {
      const rows = [
        { at: '2026-10-12T10:00:00.000Z', text: renewedAsText(nextYearTitle(title)) },
        { at: '2026-10-12T10:00:00.001Z', text: renewalStartedText(title) },
      ];
      for (const row of rows) expect(isRenewalLine(row.text)).toBe(true);
      for (const phase of Object.keys(ENTERED) as Array<keyof typeof ENTERED>) {
        const day = phaseEnteredOn(grant, phase, rows);
        // Only the fallbacks: Prospect from the day it was added, nothing else.
        expect(day).toBe(phase === 'prospect' ? '2026-10-10' : undefined);
      }
    }
  });

  it('still reads a real phase line next to a renewal line', () => {
    const rows = [
      { at: '2026-10-12T10:00:00.000Z', text: renewedAsText('Withdrawn-youth fund 2027') },
      { at: '2026-03-02T10:00:00.000Z', text: 'Withdraw — not a fit this year' },
    ];
    expect(phaseEnteredOn({ createdAt: '2026-01-01', dates: {} }, 'withdrawn', rows)).toBe(
      '2026-03-02',
    );
  });

  it('keeps only the dates a renewal may start with', () => {
    const h = harness();
    const id = h.actions.renewGrant(
      input(h.portal(), HA, {
        dates: {
          applicationDue: '2027-04-30',
          startBy: '2027-03-16',
          submitted: '2027-04-28',
          decided: '2027-07-06',
          periodEnd: '',
        },
      }),
    );
    expect(h.grants().grants.find(g => g.id === id)!.dates).toEqual({
      applicationDue: '2027-04-30',
      startBy: '2027-03-16',
    });
    expect(
      renewalDates({
        loiDue: '2027-01-15',
        applicationDue: '2027-04-30',
        decisionExpected: '2027-06-30',
        periodStart: '2027-07-01',
        periodEnd: '2028-06-30',
        startBy: '2027-03-16',
        submitted: '2027-04-28',
        decided: '2027-07-06',
      }),
    ).toEqual({
      loiDue: '2027-01-15',
      applicationDue: '2027-04-30',
      decisionExpected: '2027-06-30',
      periodStart: '2027-07-01',
      periodEnd: '2028-06-30',
      startBy: '2027-03-16',
    });
    expect(renewalDates(undefined)).toEqual({});
  });

  it('uses the default checklist when the renewal one has been deleted', () => {
    const seed = makeSeed();
    const h = harness(GWEN, {
      ...seed,
      templates: seed.templates.filter(t => t.id !== 'tpl-renewal'),
    });
    const id = h.actions.renewGrant(input(h.portal()));
    const titles = h
      .grants()
      .tasks.filter(t => t.grantId === id)
      .map(t => t.title);
    expect(titles).toContain('Confirm eligibility and fit');
  });

  it('takes the programs and owner the dialog gives', () => {
    const h = harness();
    const id = h.actions.renewGrant(
      input(h.portal(), HA, { programs: ['in-school'], ownerId: 's-denise', title: '  Next  ' }),
    );
    const next = h.grants().grants.find(g => g.id === id)!;
    expect(next.programs).toEqual(['in-school']);
    expect(next.ownerId).toBe('s-denise');
    expect(next.title).toBe('Next');
  });
});

describe('renewalTemplateId', () => {
  it('prefers the renewal checklist, then the default, then the first, then none', () => {
    const all = defaultTemplates();
    expect(renewalTemplateId(all)).toBe('tpl-renewal');
    const noRenewal = all.filter(t => t.id !== 'tpl-renewal');
    expect(renewalTemplateId(noRenewal)).toBe('tpl-foundation-standard');
    const onlyGov = all.filter(t => t.id === 'tpl-government');
    expect(renewalTemplateId(onlyGov)).toBe('tpl-government');
    expect(renewalTemplateId([])).toBeNull();
  });
});

describe('who may renew, and when', () => {
  it('is Admin, Director and Office manager', () => {
    const roles: Role[] = [
      'admin',
      'director',
      'office-manager',
      'bookkeeper',
      'teacher',
      'assistant',
      'read-only',
    ];
    expect(roles.filter(mayRenew)).toEqual(['admin', 'director', 'office-manager']);
  });

  it('is refused by the store for anyone else, changing nothing', () => {
    for (const role of ['bookkeeper', 'assistant', 'read-only', 'teacher'] as Role[]) {
      const h = harness({ id: 's-someone', name: 'Someone', role });
      const before = h.grants();
      expect(h.actions.renewGrant(input(h.portal()))).toBeUndefined();
      expect(h.grants()).toBe(before);
      expect(h.refusals).toHaveLength(1);
    }
  });

  it('is offered on Awarded, Active, Reporting and Closed only', () => {
    const h = harness();
    const s = h.portal();
    expect(renewalRefusal(s, HA)).toBeUndefined(); // active
    expect(renewalRefusal(s, 'g-la-county-2026')).toBeUndefined(); // reporting
    expect(renewalRefusal(s, 'g-wells-fargo-2025')).toBeUndefined(); // closed
    for (const id of ['g-signal-hill-2026', 'g-parsons-2026', 'g-boeing-2026']) {
      expect(renewalRefusal(s, id)).toBe('A grant is renewed once it has been awarded.');
    }
    expect(renewalRefusal(s, 'g-nope')).toBe('That grant is no longer here.');
  });

  it('renews a grant once: the second time is refused', () => {
    const h = harness();
    const first = h.actions.renewGrant(input(h.portal()));
    expect(first).toBeTruthy();
    const before = h.grants();
    expect(h.actions.renewGrant(input(h.portal()))).toBeUndefined();
    expect(h.grants()).toBe(before);
    expect(h.refusals).toEqual([
      'This grant was already renewed as General operating support 2027.',
    ]);
  });

  it('refuses an archived grant, and one whose funder is archived', () => {
    const seed = makeSeed();
    const h = harness(GWEN, {
      ...seed,
      grants: seed.grants.map(g =>
        g.id === 'g-la-county-2026' ? { ...g, archivedAt: '2026-09-01' } : g,
      ),
      funders: seed.funders.map(f =>
        f.id === 'f-herb-alpert' ? { ...f, archivedAt: '2026-09-01' } : f,
      ),
    });
    expect(renewalRefusal(h.portal(), 'g-la-county-2026')).toBe(
      "Restore this grant before starting next year's.",
    );
    expect(h.actions.renewGrant(input(h.portal()))).toBeUndefined();
    expect(h.refusals[0]).toMatch(
      /is archived\. Restore the funder before starting next year's grant\./,
    );
  });

  it('refuses an archived owner or program, and a blank title', () => {
    const h = harness();
    const core = makeCoreSeed();
    h.setCore({
      ...core,
      staff: core.staff.map(s => (s.id === 's-barry' ? { ...s, archivedAt: '2026-09-01' } : s)),
      programs: core.programs.map(p =>
        p.id === 'homeschool' ? { ...p, archivedAt: '2026-09-01' } : p,
      ),
    });
    const s = h.portal();
    expect(h.actions.renewGrant(input(s, HA, { ownerId: 's-barry' }))).toBeUndefined();
    expect(
      h.actions.renewGrant(input(s, HA, { ownerId: 's-denise', programs: ['homeschool'] })),
    ).toBeUndefined();
    expect(h.actions.renewGrant(input(s, HA, { ownerId: 's-denise', title: ' ' }))).toBeUndefined();
    expect(
      h.actions.renewGrant(input(s, HA, { ownerId: 's-denise', programs: [] })),
    ).toBeUndefined();
    expect(h.refusals).toEqual([
      'Choose a current owner.',
      'Homeschool Program is archived. Choose a current program.',
      "Give next year's grant a title.",
      'Choose at least one program.',
    ]);
  });
});

describe("a funder's grant history", () => {
  const grant = (id: string, applicationDue: string, renewsGrantId?: string): Grant => ({
    id,
    funderId: 'f-x',
    title: id,
    programs: ['in-school'],
    restriction: 'restricted',
    ownerId: 's-barry',
    phase: 'closed',
    loiRequired: false,
    dates: { applicationDue },
    createdAt: applicationDue,
    ...(renewsGrantId ? { renewsGrantId } : {}),
  });
  const state = (grants: Grant[]) =>
    ({ core: makeCoreSeed(), grants: { ...makeSeed(), grants } }) as unknown as PortalState;

  it('keeps each grant next to the one it renews, newest first', () => {
    const rows = funderGrantHistory(
      state([
        grant('a-2024', '2024-03-01'),
        grant('b-2025', '2025-06-01'),
        grant('a-2025', '2025-03-01', 'a-2024'),
        grant('a-2026', '2026-03-01', 'a-2025'),
        grant('c-2023', '2023-01-01'),
      ]),
      'f-x',
    );
    expect(rows.map(r => r.grant.id)).toEqual(['a-2026', 'a-2025', 'a-2024', 'b-2025', 'c-2023']);
    expect(rows.map(r => r.renews?.id)).toEqual([
      'a-2025',
      'a-2024',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('is newest first with no renewals', () => {
    const rows = funderGrantHistory(
      state([grant('old', '2024-01-01'), grant('new', '2026-01-01')]),
      'f-x',
    );
    expect(rows.map(r => r.grant.id)).toEqual(['new', 'old']);
    expect(rows.every(r => r.renews === undefined)).toBe(true);
  });

  it('shows every grant once even when the links loop', () => {
    const rows = funderGrantHistory(
      state([grant('p', '2024-01-01', 'q'), grant('q', '2025-01-01', 'p')]),
      'f-x',
    );
    expect(rows.map(r => r.grant.id).sort()).toEqual(['p', 'q']);
  });
});

describe('loading saved grants', () => {
  it('loads saved data with no renewals unchanged', () => {
    const seed = makeSeed();
    const loaded = grantsSlice.normalise!(JSON.parse(JSON.stringify(seed)))!;
    expect(loaded.grants).toEqual(seed.grants);
    expect(loaded.grants.some(g => 'renewsGrantId' in g)).toBe(false);
  });

  it('keeps a link to a saved grant, and drops one to a grant that is gone', () => {
    const seed = makeSeed();
    const next: Grant = { ...seed.grants[0], id: 'g-next', renewsGrantId: seed.grants[0].id };
    const orphan: Grant = { ...seed.grants[1], id: 'g-orphan', renewsGrantId: 'g-gone' };
    const self: Grant = { ...seed.grants[2], id: 'g-self', renewsGrantId: 'g-self' };
    const loaded = grantsSlice.normalise!(
      JSON.parse(JSON.stringify({ ...seed, grants: [...seed.grants, next, orphan, self] })),
    )!;
    const byId = (id: string) => loaded.grants.find(g => g.id === id)!;
    expect(byId('g-next').renewsGrantId).toBe(seed.grants[0].id);
    expect('renewsGrantId' in byId('g-orphan')).toBe(false);
    expect('renewsGrantId' in byId('g-self')).toBe(false);
    expect(withRenewalLinks(seed.grants)).toEqual(seed.grants);
  });
});
