import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, SignedInUser } from '../../../../core/types';
import { activityWho } from '../derive';
import { makeSeed } from '../seed';
import { creditActivity, grantsSlice, reducer } from '../slice';
import type { Activity, Grant, GrantsState } from '../types';

const base = (): GrantsState => makeSeed();

const grantOf = (state: GrantsState, id: string): Grant => state.grants.find(g => g.id === id)!;

describe('reducer: add-grant', () => {
  const state = reducer(base(), {
    type: 'add-grant',
    grant: {
      id: 'g-new',
      funderId: 'f-new',
      title: 'Test grant',
      program: 'in-school',
      restriction: 'restricted',
      ownerId: 's-barry',
      phase: 'prospect',
      loiRequired: false,
      amountRequested: 9000,
      dates: { applicationDue: '2026-11-02' },
      createdAt: '2026-09-13',
    },
    funder: { id: 'f-new', name: 'Test Funder', type: 'foundation' },
    templateId: 'tpl-foundation-standard',
    excludeTemplateItemIds: [],
    includeDocumentRegister: true,
    activityId: 'act-new',
    at: '2026-09-13T10:00:00.000Z',
    whoId: 's-barry',
  });

  it('adds the funder and the grant', () => {
    expect(state.funders.some(f => f.id === 'f-new')).toBe(true);
    expect(grantOf(state, 'g-new').title).toBe('Test grant');
  });

  it('instantiates the checklist with computed due dates', () => {
    const tasks = state.tasks.filter(t => t.grantId === 'g-new');
    expect(tasks.length).toBeGreaterThan(10);
    expect(tasks.some(t => t.phase === 'loi')).toBe(false);
    expect(tasks.find(t => t.title === 'Submit application')?.dueDate).toBe('2026-11-02');
    expect(new Set(tasks.map(t => t.id)).size).toBe(tasks.length);
  });

  it('creates the standard document register as needed', () => {
    const docs = state.documents.filter(d => d.grantId === 'g-new');
    expect(docs).toHaveLength(5);
    expect(docs.every(d => d.status === 'needed')).toBe(true);
  });

  it('logs "Grant added"', () => {
    expect(state.activity.find(a => a.id === 'act-new')).toMatchObject({
      grantId: 'g-new',
      text: 'Grant added',
      whoId: 's-barry',
    });
  });
});

describe('reducer: transition', () => {
  const at = '2026-09-13T10:00:00.000Z';

  it('records the submitted date', () => {
    const next = reducer(base(), {
      type: 'transition',
      grantId: 'g-arts-council-lb-2026',
      to: 'submitted',
      payload: { date: '2026-09-13' },
      activityId: 'a1',
      at,
      whoId: 's-barry',
    });
    const grant = grantOf(next, 'g-arts-council-lb-2026');
    expect(grant.phase).toBe('submitted');
    expect(grant.dates.submitted).toBe('2026-09-13');
    expect(next.activity.find(a => a.id === 'a1')?.text).toBe('Mark submitted');
  });

  it('records the award amount and period', () => {
    const next = reducer(base(), {
      type: 'transition',
      grantId: 'g-signal-hill-2026',
      to: 'awarded',
      payload: {
        date: '2026-10-16',
        amountAwarded: 5500,
        periodStart: '2026-11-01',
        periodEnd: '2027-10-31',
      },
      activityId: 'a2',
      at,
      whoId: 's-denise',
    });
    const grant = grantOf(next, 'g-signal-hill-2026');
    expect(grant).toMatchObject({ phase: 'awarded', amountAwarded: 5500 });
    expect(grant.dates).toMatchObject({
      decided: '2026-10-16',
      periodStart: '2026-11-01',
      periodEnd: '2027-10-31',
    });
    expect(next.activity.find(a => a.id === 'a2')?.text).toBe('Record award');
  });

  it('records a decline with its reason', () => {
    const next = reducer(base(), {
      type: 'transition',
      grantId: 'g-signal-hill-2026',
      to: 'declined',
      payload: { date: '2026-10-16', reason: 'Funds went to park programming' },
      activityId: 'a3',
      at,
      whoId: 's-denise',
    });
    expect(grantOf(next, 'g-signal-hill-2026').dates.decided).toBe('2026-10-16');
    expect(next.activity.find(a => a.id === 'a3')?.text).toBe(
      'Record decline — Funds went to park programming',
    );
  });

  it('falls back to the action timestamp when no date is given', () => {
    const next = reducer(base(), {
      type: 'transition',
      grantId: 'g-port-of-long-beach-2026',
      to: 'submitted',
      payload: {},
      activityId: 'a4',
      at,
      whoId: 's-barry',
    });
    expect(grantOf(next, 'g-port-of-long-beach-2026').dates.submitted).toBe('2026-09-13');
  });

  it('leaves an unknown grant alone', () => {
    const start = base();
    expect(
      reducer(start, {
        type: 'transition',
        grantId: 'nope',
        to: 'closed',
        payload: {},
        activityId: 'a5',
        at,
        whoId: 's-barry',
      }),
    ).toBe(start);
  });
});

describe('reducer: collections', () => {
  it('inserts, updates and removes', () => {
    let state = base();
    state = reducer(state, {
      type: 'insert',
      key: 'budgetLines',
      item: { id: 'bl-x', grantId: 'g-herb-alpert-2026', category: 'Travel', planned: 500 },
    });
    expect(state.budgetLines.find(l => l.id === 'bl-x')?.planned).toBe(500);

    state = reducer(state, {
      type: 'update',
      key: 'budgetLines',
      id: 'bl-x',
      patch: { planned: 750 },
    });
    expect(state.budgetLines.find(l => l.id === 'bl-x')?.planned).toBe(750);

    state = reducer(state, { type: 'remove', key: 'budgetLines', id: 'bl-x' });
    expect(state.budgetLines.some(l => l.id === 'bl-x')).toBe(false);
  });

  it('toggles a task both ways', () => {
    const start = base();
    const id = start.tasks.find(t => !t.done)!.id;
    const on = reducer(start, { type: 'toggle-task', id, date: '2026-09-13' });
    expect(on.tasks.find(t => t.id === id)).toMatchObject({ done: true, doneAt: '2026-09-13' });
    const off = reducer(on, { type: 'toggle-task', id, date: '2026-09-14' });
    expect(off.tasks.find(t => t.id === id)).toMatchObject({ done: false, doneAt: undefined });
  });

  it('duplicates a template with fresh item ids', () => {
    const state = reducer(base(), {
      type: 'duplicate-template',
      id: 'tpl-foundation-standard',
      newTemplateId: 'tpl-copy',
    });
    const copy = state.templates.find(t => t.id === 'tpl-copy')!;
    expect(copy.name).toBe('Foundation grant — standard (copy)');
    expect(copy.items).toHaveLength(state.templates[0].items.length);
    expect(copy.items.every(i => i.id.startsWith('tpl-copy-i'))).toBe(true);
  });

  it('applies a batch in order', () => {
    const state = reducer(base(), {
      type: 'batch',
      actions: [
        { type: 'update', key: 'grants', id: 'g-parsons-2026', patch: { amountRequested: 31000 } },
        { type: 'update', key: 'grants', id: 'g-parsons-2026', patch: { amountAwarded: 0 } },
      ],
    });
    expect(grantOf(state, 'g-parsons-2026')).toMatchObject({
      amountRequested: 31000,
      amountAwarded: 0,
    });
  });

  it('does not mutate the state it was given', () => {
    const start = base();
    const snapshot = JSON.stringify(start);
    reducer(start, { type: 'remove', key: 'grants', id: 'g-parsons-2026' });
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('the slice', () => {
  it('only answers to its own namespace', () => {
    const start = base();
    expect(
      grantsSlice.reducer(start, { type: 'teaching/remove', key: 'grants', id: 'g-parsons-2026' }),
    ).toBe(start);
    const next = grantsSlice.reducer(start, {
      type: 'grants/remove',
      key: 'grants',
      id: 'g-parsons-2026',
    });
    expect(next.grants.some(g => g.id === 'g-parsons-2026')).toBe(false);
  });

  it('rejects a payload that is missing a collection', () => {
    expect(grantsSlice.normalise?.({ grants: [] })).toBeUndefined();
    expect(grantsSlice.normalise?.(makeSeed())).toBeTruthy();
  });
});

describe('credit for a change', () => {
  const TESS: SignedInUser = { id: 's-tess', name: 'Tess Holloway', role: 'assistant' };

  /** The real reducer and actions, signed in as the intern. */
  function harness(user: SignedInUser = TESS) {
    let grants = base();
    let n = 0;
    const portal = () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState;
    const actions = grantsSlice.createActions(
      (action: AnyAction) => {
        grants = grantsSlice.reducer(grants, action);
      },
      portal,
      { today: '2026-09-13', newId: prefix => `${prefix}-t${(n += 1)}`, user },
    );
    return { actions, grants: () => grants, portal };
  }

  it('credits a note to the signed-in person, by name on the Activity tab', () => {
    const h = harness();
    const id = h.actions.addNote('g-parsons-2026', 'Called the program officer');
    const row = h.grants().activity.find(a => a.id === id)!;
    expect(row.whoId).toBe('s-tess');
    expect(activityWho(h.portal(), row)).toBe('Tess Holloway');
  });

  it('credits a phase change, an upload and a transaction to them too', () => {
    const h = harness();
    h.actions.transition('g-port-of-long-beach-2026', 'submitted', { date: '2026-09-13' });
    expect(h.grants().activity.at(-1)?.whoId).toBe('s-tess');

    const fileId = h.actions.addFile({
      grantId: 'g-herb-alpert-2026',
      kind: 'receipt',
      name: 'Receipt.pdf',
      format: 'pdf',
      sizeKb: 10,
    });
    expect(h.grants().files.find(f => f.id === fileId)?.uploadedById).toBe('s-tess');

    const tx = h.grants().transactions.find(t => t.status === 'to-assign')!;
    h.actions.markNotGrantFunded(tx.id);
    expect(h.grants().transactions.find(t => t.id === tx.id)?.assignedById).toBe('s-tess');
  });

  it('names whoever the row credits, as they are named now', () => {
    const portal = { core: makeCoreSeed(), grants: base() } as unknown as PortalState;
    portal.core.staff.find(s => s.id === 's-denise')!.name = 'Denise Moreno-Ruiz';
    const row: Activity = {
      id: 'a',
      grantId: 'g',
      at: '2026-09-13T09:00:00Z',
      whoId: 's-denise',
      text: 'x',
    };
    expect(activityWho(portal, row)).toBe('Denise Moreno-Ruiz');
    expect(activityWho(portal, { ...row, whoId: undefined, who: 'A volunteer' })).toBe(
      'A volunteer',
    );
  });

  it('turns a saved name into a staff id, and keeps a name it cannot match', () => {
    const staff = makeCoreSeed().staff;
    const at = '2026-01-01T09:00:00.000Z';
    expect(
      creditActivity({ id: 'a', grantId: 'g', at, who: 'Denise Moreno', text: 'x' }, staff),
    ).toEqual({ id: 'a', grantId: 'g', at, whoId: 's-denise', text: 'x' });
    const stranger = { id: 'b', grantId: 'g', at, who: 'A volunteer', text: 'y' };
    expect(creditActivity(stranger, staff)).toEqual(stranger);

    const saved = base();
    saved.activity = [{ id: 'c', grantId: 'g', at, who: 'Barry Cogert', text: 'z' }];
    expect(grantsSlice.normalise!(saved)!.activity[0].whoId).toBe('s-barry');
  });
});
