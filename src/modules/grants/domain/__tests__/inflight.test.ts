import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { grantMoney } from '../derive';
import { inFlightRefusal } from '../inflight';
import { eligibleLines, grantPace, linePaces, spendSeries, trackedGrants } from '../money';
import { ENTERED, passedPhases, phaseEnteredOn, stepperPhases } from '../phases';
import { makeSeed } from '../seed';
import { broughtInText, grantsSlice } from '../slice';
import type { Grant, InFlightPhase, NewGrantInput, Phase } from '../types';

/**
 * Bringing in a grant already under way (issue #21, decision 0004): one
 * change that writes the grant, its award, budget, payments and reports, the
 * checklist from its phase on, and one activity row.
 */

const TODAY = '2026-10-07';
const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const as = (role: Role): SignedInUser => ({ id: 's-someone', name: 'Someone', role });

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
      { today: TODAY, newId: prefix => `${prefix}-n${(n += 1)}`, user },
    ),
    grantsSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  return { actions, grants: () => grants, portal, refused, sent };
}

function input(phase: InFlightPhase, overrides: Partial<NewGrantInput> = {}): NewGrantInput {
  return {
    funderId: 'f-herb-alpert',
    title: 'Music in the Parks 2026',
    program: 'in-school',
    restriction: 'restricted',
    ownerId: 's-keisha',
    phase,
    loiRequired: false,
    templateId: 'tpl-foundation-standard',
    inFlight: { amountAwarded: 40000 },
    ...overrides,
  };
}

/** At Active: a budget, two payments in, one to come, one report sent and one owed. */
const ACTIVE = input('active', {
  dates: {
    applicationDue: '2025-11-15',
    submitted: '2025-11-14',
    decided: '2026-01-20',
    periodStart: '2026-02-01',
    periodEnd: '2027-01-31',
  },
  inFlight: {
    amountAwarded: 40000,
    budgetLines: [
      { category: 'Teaching artist stipends', planned: 30000 },
      { category: 'Instruments', planned: 10000 },
    ],
    payments: [
      {
        label: 'First installment',
        expectedDate: '2026-02-01',
        amount: 15000,
        receivedDate: '2026-02-04',
      },
      {
        label: 'Second installment',
        expectedDate: '2026-06-01',
        amount: 15000,
        receivedDate: '2026-06-03',
      },
      { label: 'Final installment', expectedDate: '2026-12-01', amount: 10000 },
    ],
    reports: [
      { kind: 'interim', dueDate: '2026-07-31', status: 'submitted', submittedDate: '2026-07-28' },
      { kind: 'final', dueDate: '2027-03-31', status: 'upcoming' },
    ],
  },
});

const PRE_AWARD: Phase[] = ['prospect', 'loi', 'applying', 'submitted'];

describe('bringing in a grant at Active', () => {
  const h = harness();
  const id = h.actions.addGrant(ACTIVE)!;
  const grants = h.grants();
  const grant = grants.grants.find(g => g.id === id)!;

  it('writes everything in one change', () => {
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].type).toBe('grants/add-grant');
    expect(h.refused).toEqual([]);
  });

  it('records the phase, the award and the day it was brought in', () => {
    expect(grant).toMatchObject({
      phase: 'active',
      amountAwarded: 40000,
      createdAt: TODAY,
      broughtIn: { phase: 'active', on: TODAY },
    });
    expect(grant.dates).toMatchObject({ decided: '2026-01-20', periodStart: '2026-02-01' });
  });

  it('records the budget lines, two received payments and one to come', () => {
    const lines = grants.budgetLines.filter(l => l.grantId === id);
    expect(lines.map(l => [l.category, l.planned])).toEqual([
      ['Teaching artist stipends', 30000],
      ['Instruments', 10000],
    ]);
    const payments = grants.payments.filter(p => p.grantId === id);
    expect(payments.filter(p => p.receivedDate).map(p => p.receivedDate)).toEqual([
      '2026-02-04',
      '2026-06-03',
    ]);
    expect(payments.find(p => p.label === 'Final installment')).not.toHaveProperty('receivedDate');
    const money = grantMoney(h.portal(), id);
    expect(money).toMatchObject({ awarded: 40000, received: 30000, expectedRemaining: 10000 });
  });

  it('records the report sent and the report owed', () => {
    const reports = grants.reports.filter(r => r.grantId === id);
    expect(reports).toHaveLength(2);
    expect(reports.find(r => r.kind === 'interim')).toMatchObject({
      status: 'submitted',
      submittedDate: '2026-07-28',
    });
    expect(reports.find(r => r.kind === 'final')).toMatchObject({ status: 'upcoming' });
    expect(reports.find(r => r.kind === 'final')).not.toHaveProperty('submittedDate');
  });

  it('creates no checklist tasks for the phases it passed', () => {
    const tasks = grants.tasks.filter(t => t.grantId === id);
    expect(tasks.some(t => PRE_AWARD.includes(t.phase) || t.phase === 'awarded')).toBe(false);
    expect(tasks.map(t => t.phase)).toEqual([
      'active',
      'reporting',
      'reporting',
      'reporting',
      'closed',
      'closed',
    ]);
    expect(tasks.find(t => t.title === 'Reconcile expenses monthly')?.dueDate).toBe('2026-03-03');
    expect(tasks.every(t => !t.done)).toBe(true);
  });

  it('files the document register as submitted', () => {
    const docs = grants.documents.filter(d => d.grantId === id);
    expect(docs).toHaveLength(5);
    expect(docs.every(d => d.status === 'submitted')).toBe(true);
  });

  it('logs one row, credited to whoever brought it in', () => {
    const rows = grants.activity.filter(a => a.grantId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: 'Brought into the portal at Active', whoId: 's-keisha' });
  });

  it('dates the passed steps from the dates given, never from the day it came in', () => {
    const rows = grants.activity.filter(a => a.grantId === id);
    const when = (p: Phase) => phaseEnteredOn(grant, p, rows);
    expect(passedPhases(grant, 'active')).toEqual(['prospect', 'applying', 'submitted', 'awarded']);
    expect(when('prospect')).toBeUndefined();
    expect(when('applying')).toBe('2025-11-15');
    expect(when('submitted')).toBe('2025-11-14');
    expect(when('awarded')).toBe('2026-01-20');
    expect(when('active')).toBe('2026-02-01');
  });
});

describe('bringing in a grant at Reporting with no phase dates', () => {
  const h = harness();
  const id = h.actions.addGrant(
    input('reporting', {
      loiRequired: true,
      dates: {},
      inFlight: { amountAwarded: 12000 },
    }),
  )!;
  const grants = h.grants();
  const grant = grants.grants.find(g => g.id === id)!;
  const rows = grants.activity.filter(a => a.grantId === id);

  it('is brought in at Reporting with nothing else', () => {
    expect(grant).toMatchObject({ phase: 'reporting', amountAwarded: 12000, dates: {} });
    expect(grants.budgetLines.some(l => l.grantId === id)).toBe(false);
    expect(grants.payments.some(p => p.grantId === id)).toBe(false);
    expect(grants.reports.some(r => r.grantId === id)).toBe(false);
    expect(rows.map(r => r.text)).toEqual(['Brought into the portal at Reporting']);
  });

  it('shows every passed step, LOI included, without a date', () => {
    const passed = passedPhases(grant, 'reporting');
    expect(passed).toEqual(['prospect', 'loi', 'applying', 'submitted', 'awarded', 'active']);
    for (const p of [...passed, 'reporting' as Phase]) {
      expect(phaseEnteredOn(grant, p, rows)).toBeUndefined();
    }
  });

  it('keeps only the Reporting and Closed tasks, with no due dates to work back from', () => {
    const tasks = grants.tasks.filter(t => t.grantId === id);
    expect(new Set(tasks.map(t => t.phase))).toEqual(new Set(['reporting', 'closed']));
    expect(tasks.every(t => t.dueDate === undefined)).toBe(true);
  });

  it('dates a later phase change from its own activity row', () => {
    h.actions.transition(id, 'active');
    const later = h.grants();
    const g = later.grants.find(x => x.id === id)!;
    const all = later.activity.filter(a => a.grantId === id);
    expect(g.phase).toBe('active');
    // "Report submitted" moves Reporting back to Active; it is not "Agreement signed".
    expect(phaseEnteredOn(g, 'active', all)).toBeUndefined();
  });
});

describe('at Awarded', () => {
  it('keeps the Awarded tasks and drops the pre-award ones', () => {
    const h = harness();
    const id = h.actions.addGrant(input('awarded', { dates: { decided: '2026-09-30' } }))!;
    const tasks = h.grants().tasks.filter(t => t.grantId === id);
    expect(tasks.filter(t => t.phase === 'awarded').map(t => t.title)).toEqual([
      'Send acknowledgement letter',
      'Countersign grant agreement',
      'Set up budget lines',
      'Schedule reports',
    ]);
    expect(tasks.some(t => PRE_AWARD.includes(t.phase))).toBe(false);
    const g = h.grants().grants.find(x => x.id === id)!;
    expect(phaseEnteredOn(g, 'awarded', [])).toBe('2026-09-30');
    expect(phaseEnteredOn(g, 'prospect', [])).toBeUndefined();
  });

  it('honours the tasks unticked in the checklist step', () => {
    const h = harness();
    const id = h.actions.addGrant(
      input('awarded', { excludeTemplateItemIds: ['tpl-foundation-standard-i16'] }),
    )!;
    const titles = h
      .grants()
      .tasks.filter(t => t.grantId === id)
      .map(t => t.title);
    expect(titles).not.toContain('Send acknowledgement letter');
    expect(titles).toContain('Countersign grant agreement');
  });
});

describe('the bring-in row dates no phase', () => {
  it('matches none of the stepper patterns, at any starting phase', () => {
    for (const phase of ['awarded', 'active', 'reporting'] as Phase[]) {
      const text = broughtInText(phase);
      for (const pattern of Object.values(ENTERED)) {
        if (pattern) expect(pattern.test(text)).toBe(false);
      }
    }
  });

  it('leaves a grant added the usual way dated as before', () => {
    const g = { createdAt: '2026-09-01', dates: {} } as Pick<Grant, 'createdAt' | 'dates'>;
    expect(phaseEnteredOn(g, 'prospect', [])).toBe('2026-09-01');
    expect(
      phaseEnteredOn(g, 'prospect', [{ at: '2026-09-02T18:00:00', text: 'Grant added' }]),
    ).toBe('2026-09-02');
  });
});

describe('who may bring a grant in', () => {
  it('refuses the office assistant, who may still add a new grant', () => {
    const h = harness(as('assistant'));
    expect(h.actions.addGrant(ACTIVE)).toBeUndefined();
    expect(h.sent).toHaveLength(0);
    expect(h.refused).toHaveLength(1);
    expect(h.actions.addGrant({ ...ACTIVE, phase: 'prospect', inFlight: undefined })).toBeTruthy();
  });

  it('lets the Admin, the Director and the Office manager', () => {
    for (const role of ['admin', 'director', 'office-manager'] as Role[]) {
      const h = harness(as(role));
      expect(h.actions.addGrant(ACTIVE)).toBeTruthy();
      expect(h.refused).toEqual([]);
    }
  });

  it('refuses the bookkeeper, Read-only and a teacher, who may not add grants at all', () => {
    for (const role of ['bookkeeper', 'read-only', 'teacher'] as Role[]) {
      const h = harness(as(role));
      expect(h.actions.addGrant(ACTIVE)).toBeUndefined();
      expect(h.sent).toHaveLength(0);
    }
  });
});

describe('what the store will not write', () => {
  const flight = ACTIVE.inFlight!;
  const bad: Array<[string, NewGrantInput]> = [
    ['Closed as a starting phase', { ...ACTIVE, phase: 'closed' }],
    ['a pre-award phase', { ...ACTIVE, phase: 'applying' }],
    ['no award', { ...ACTIVE, inFlight: { ...flight, amountAwarded: 0 } }],
    ['cents on the award', { ...ACTIVE, inFlight: { ...flight, amountAwarded: 40000.5 } }],
    [
      'an end before the start',
      { ...ACTIVE, dates: { periodStart: '2026-02-01', periodEnd: '2026-01-31' } },
    ],
    [
      'two lines with one name',
      {
        ...ACTIVE,
        inFlight: {
          ...flight,
          budgetLines: [
            { category: 'Instruments', planned: 100 },
            { category: ' instruments ', planned: 200 },
          ],
        },
      },
    ],
    [
      'a line with no category',
      { ...ACTIVE, inFlight: { ...flight, budgetLines: [{ category: ' ', planned: 100 }] } },
    ],
    [
      'cents on a line',
      { ...ACTIVE, inFlight: { ...flight, budgetLines: [{ category: 'A', planned: 1.5 }] } },
    ],
    [
      'a received payment with no date',
      {
        ...ACTIVE,
        inFlight: {
          ...flight,
          payments: [{ label: 'First', expectedDate: '2026-02-01', amount: 100, receivedDate: '' }],
        },
      },
    ],
    [
      'a sent date on a report not sent',
      {
        ...ACTIVE,
        inFlight: {
          ...flight,
          reports: [
            {
              kind: 'interim',
              dueDate: '2026-07-31',
              status: 'upcoming',
              submittedDate: '2026-07-01',
            },
          ],
        },
      },
    ],
  ];

  it.each(bad)('refuses %s, and changes nothing', (_name, value) => {
    expect(inFlightRefusal(value)).toEqual(expect.any(String));
    const h = harness();
    expect(h.actions.addGrant(value)).toBeUndefined();
    expect(h.sent).toHaveLength(0);
    expect(h.refused).toEqual([inFlightRefusal(value)]);
  });

  it('accepts a period with no end, and an end with no start', () => {
    expect(inFlightRefusal({ ...ACTIVE, dates: { periodStart: '2026-02-01' } })).toBeUndefined();
    expect(inFlightRefusal({ ...ACTIVE, dates: { periodEnd: '2026-02-01' } })).toBeUndefined();
  });

  it('has nothing to say about a new grant', () => {
    expect(inFlightRefusal({ ...ACTIVE, phase: 'prospect', inFlight: undefined })).toBeUndefined();
  });
});

describe('pacing a grant whose period began before the portal', () => {
  const h = harness();
  const id = h.actions.addGrant(ACTIVE)!;

  it('is tracked, and its lines take transactions dated back to its start', () => {
    expect(trackedGrants(h.portal()).some(g => g.id === id)).toBe(true);
    const lines = eligibleLines(h.portal(), '2026-02-15').filter(l => l.grantId === id);
    expect(lines).toHaveLength(2);
  });

  it('reads the months already gone, with nothing spent in the portal yet', () => {
    const p = grantPace(h.portal(), id, TODAY);
    expect(p.periodStart).toBe('2026-02-01');
    expect(p.daysElapsed).toBe(249);
    expect(p.spent).toBe(0);
    expect(p.status).toBe('spending-slow');
    expect(p.headline).toBe('No spending yet');
    expect(spendSeries(h.portal(), id, TODAY)).toEqual([
      { date: '2026-02-01', total: 0 },
      { date: TODAY, total: 0 },
    ]);
  });

  it('counts spending dated before the switch-over once it is entered', () => {
    const line = h
      .grants()
      .budgetLines.find(l => l.grantId === id && l.category === 'Instruments')!;
    h.actions.addExpense({
      grantId: id,
      budgetLineId: line.id,
      date: '2026-03-10',
      payee: 'Long Beach Music',
      amount: 4000,
    });
    h.actions.addExpense({
      grantId: id,
      budgetLineId: line.id,
      // Before the period: it counts from the first day, as for any grant.
      date: '2026-01-25',
      payee: 'Long Beach Music',
      amount: 1000,
    });
    const p = grantPace(h.portal(), id, TODAY);
    expect(p.spent).toBe(5000);
    expect(spendSeries(h.portal(), id, TODAY)).toEqual([
      { date: '2026-02-01', total: 1000 },
      { date: '2026-03-10', total: 5000 },
      { date: TODAY, total: 5000 },
    ]);
    const paces = linePaces(h.portal(), id, TODAY);
    expect(paces.map(l => l.line.category)).toEqual(['Teaching artist stipends', 'Instruments']);
    expect(paces.every(l => l.daysElapsed === 249)).toBe(true);
  });
});

describe('stepperPhases', () => {
  it('shows LOI for a grant brought in that asked for one', () => {
    expect(stepperPhases({ loiRequired: true })).toContain('loi');
  });
});
