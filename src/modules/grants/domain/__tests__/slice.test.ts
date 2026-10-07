import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { activityWho } from '../derive';
import { backupMoves, moveTargets, transactionSnapshot } from '../money';
import { makeSeed } from '../seed';
import { creditActivity, grantsSlice, reducer } from '../slice';
import type { GrantsActions } from '../slice';
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

  it('names a change plainly for a save that fails', () => {
    const name = (action: AnyAction) => grantsSlice.describe!(action);
    expect(name({ type: 'grants/insert', key: 'grants', item: {} })).toBe('the grant');
    expect(name({ type: 'grants/update', key: 'budgetLines', id: 'x', patch: {} })).toBe(
      'the budget line',
    );
    expect(name({ type: 'grants/assign-transaction', id: 'x' })).toBe('the transaction');
    expect(name({ type: 'grants/save-reminder-plan' })).toBe('the reminders');
    expect(
      name({
        type: 'grants/batch',
        actions: [{ type: 'remove', key: 'expenses', id: 'x' }],
      }),
    ).toBe('the expense');
    // Not a grants change: the store falls back to "that change".
    expect(name({ type: 'teaching/insert', key: 'grants', item: {} })).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Reassigning a transaction keeps its backup (#24)
// ---------------------------------------------------------------------------

describe('reassigning keeps the backup', () => {
  const HA = 'g-herb-alpert-2026';
  const LBCF = 'g-lb-community-foundation-2026';
  const TX = 'tx-ex-ha-2';
  const NOTE = 'Quote approved by Barry on Jul 12. Horn is loaner #14 from the instrument library.';
  const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha', role: 'office-manager' };

  function harness() {
    let grants = base();
    let n = 0;
    const portal = () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState;
    const actions = grantsSlice.createActions(
      (action: AnyAction) => {
        grants = grantsSlice.reducer(grants, action);
      },
      portal,
      { today: '2026-09-13', newId: prefix => `${prefix}-t${(n += 1)}`, user: KEISHA },
    );
    const parts = () => grants.expenses.filter(e => e.transactionId === TX);
    const filesOn = (expenseId: string) =>
      grants.files.filter(f => f.expenseId === expenseId).map(f => f.name);
    const orphaned = () =>
      grants.files.filter(f => f.expenseId && !grants.expenses.some(e => e.id === f.expenseId));
    return { actions, grants: () => grants, portal, parts, filesOn, orphaned };
  }

  it('starts from the seeded Signal Hill Music Service expense with two files and a note', () => {
    const h = harness();
    expect(h.parts().map(e => e.id)).toEqual(['ex-ha-2']);
    expect(h.filesOn('ex-ha-2')).toHaveLength(2);
    expect(h.parts()[0].backupNote).toBe(NOTE);
    expect(h.orphaned()).toEqual([]);
  });

  it('keeps the expense, its files and its note when the part stays on its line', () => {
    const h = harness();
    h.actions.assignTransaction(TX, [{ grantId: HA, budgetLineId: 'bl-ha-repair', amount: 1240 }]);
    expect(h.parts().map(e => e.id)).toEqual(['ex-ha-2']);
    expect(h.filesOn('ex-ha-2')).toHaveLength(2);
    expect(h.parts()[0].backupNote).toBe(NOTE);
    expect(h.orphaned()).toEqual([]);
  });

  it('keeps the backup on the part that stays when the transaction is split', () => {
    const h = harness();
    h.actions.assignTransaction(TX, [
      { grantId: HA, budgetLineId: 'bl-ha-repair', amount: 740 },
      { grantId: LBCF, budgetLineId: 'bl-lbcf-repair', amount: 500 },
    ]);
    const [kept, added] = h.parts();
    expect(kept).toMatchObject({ id: 'ex-ha-2', amount: 740, backupNote: NOTE });
    expect(h.filesOn('ex-ha-2')).toHaveLength(2);
    expect(added).toMatchObject({ grantId: LBCF, amount: 500 });
    expect(added.backupNote).toBeUndefined();
    expect(h.orphaned()).toEqual([]);
  });

  it('moves the backup to the new part when no part stays on the old line', () => {
    const h = harness();
    expect(
      backupMoves(h.portal(), TX, [
        { grantId: LBCF, budgetLineId: 'bl-lbcf-repair' },
        { grantId: HA, budgetLineId: 'bl-ha-music' },
      ]),
    ).toMatchObject([{ from: { id: 'ex-ha-2' }, to: 1, files: 2, note: true }]);

    h.actions.assignTransaction(TX, [
      { grantId: LBCF, budgetLineId: 'bl-lbcf-repair', amount: 600 },
      { grantId: HA, budgetLineId: 'bl-ha-music', amount: 640 },
    ]);
    const onHa = h.parts().find(e => e.grantId === HA)!;
    const onLb = h.parts().find(e => e.grantId === LBCF)!;
    expect(h.parts().some(e => e.id === 'ex-ha-2')).toBe(false);
    // The part on the same grant takes it.
    expect(onHa.backupNote).toBe(NOTE);
    expect(h.filesOn(onHa.id)).toHaveLength(2);
    expect(h.filesOn(onLb.id)).toEqual([]);
    expect(h.orphaned()).toEqual([]);

    // With no part on the old grant, the first part takes it, and the files follow it there.
    h.actions.assignTransaction(TX, [
      { grantId: LBCF, budgetLineId: 'bl-lbcf-music', amount: 1240 },
    ]);
    const [only] = h.parts();
    const files = h.grants().files.filter(f => f.expenseId === only.id);
    expect(only.backupNote).toBe(NOTE);
    expect(files).toHaveLength(2);
    expect(files.every(f => f.grantId === LBCF)).toBe(true);
    expect(h.orphaned()).toEqual([]);
  });

  it('puts the backup back as it was on Undo after a change', () => {
    const h = harness();
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    const before = transactionSnapshot(h.portal(), TX)!;
    const start = { expenses: h.parts(), files: [...h.grants().files].sort(byId) };

    h.actions.assignTransaction(TX, [
      { grantId: LBCF, budgetLineId: 'bl-lbcf-repair', amount: 1240 },
    ]);
    expect(h.parts().some(e => e.id === 'ex-ha-2')).toBe(false);

    h.actions.restoreTransactions([before]);
    expect(h.parts()).toEqual(start.expenses);
    expect(h.filesOn('ex-ha-2')).toHaveLength(2);
    expect([...h.grants().files].sort(byId)).toEqual(start.files);
    expect(h.grants().transactions.find(t => t.id === TX)?.status).toBe('assigned');
  });

  it('deletes the backup on Send back, and Undo brings it back', () => {
    const h = harness();
    const before = transactionSnapshot(h.portal(), TX)!;
    expect(before.files).toHaveLength(2);

    h.actions.unassignTransaction(TX);
    expect(h.parts()).toEqual([]);
    expect(h.filesOn('ex-ha-2')).toEqual([]);
    expect(h.grants().transactions.find(t => t.id === TX)?.status).toBe('to-assign');

    h.actions.restoreTransactions([before]);
    expect(h.parts()[0]).toMatchObject({ id: 'ex-ha-2', backupNote: NOTE });
    expect(h.filesOn('ex-ha-2')).toHaveLength(2);
    expect(h.grants().transactions.find(t => t.id === TX)).toMatchObject({
      status: 'assigned',
      assignedById: before.assignedById,
    });
  });

  it('keeps a file added after the change when the change is undone', () => {
    const h = harness();
    const before = transactionSnapshot(h.portal(), TX)!;
    h.actions.assignTransaction(TX, [{ grantId: HA, budgetLineId: 'bl-ha-music', amount: 1240 }]);
    const [now] = h.parts();
    h.actions.addFile({
      grantId: HA,
      expenseId: now.id,
      kind: 'receipt',
      name: 'Late receipt.pdf',
      format: 'pdf',
      sizeKb: 10,
    });
    h.actions.restoreTransactions([before]);
    expect(h.filesOn('ex-ha-2')).toHaveLength(3);
    expect(h.filesOn('ex-ha-2')).toContain('Late receipt.pdf');
    expect(h.orphaned()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Moving a line's expenses so the line can be removed (#13)
// ---------------------------------------------------------------------------

describe("moving a budget line's expenses", () => {
  const HA = 'g-herb-alpert-2026';
  const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha', role: 'office-manager' };

  function harness() {
    let grants = base();
    let n = 0;
    const portal = () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState;
    const actions = grantsSlice.createActions(
      (action: AnyAction) => {
        grants = grantsSlice.reducer(grants, action);
      },
      portal,
      { today: '2026-09-13', newId: prefix => `${prefix}-t${(n += 1)}`, user: KEISHA },
    );
    const on = (lineId: string) => grants.expenses.filter(e => e.budgetLineId === lineId);
    return { actions, grants: () => grants, portal, on };
  }

  it('moves every expense on the line in one change, and logs one row', () => {
    const h = harness();
    const before = h.on('bl-ha-repair');
    expect(before.map(e => e.id).sort()).toEqual(['ex-ha-2', 'ex-ha-8']);
    const music = h.on('bl-ha-music').length;
    const files = h.grants().files;
    const rows = h.grants().activity.length;

    expect(h.actions.moveExpenses('bl-ha-repair', 'bl-ha-music')).toBe(true);

    expect(h.on('bl-ha-repair')).toEqual([]);
    expect(h.on('bl-ha-music')).toHaveLength(music + 2);
    // Only the line changed: ids, notes, transactions and backup are as they were.
    for (const e of before) {
      expect(h.grants().expenses.find(x => x.id === e.id)).toEqual({
        ...e,
        budgetLineId: 'bl-ha-music',
      });
    }
    expect(h.grants().files).toBe(files);

    expect(h.grants().activity).toHaveLength(rows + 1);
    expect(h.grants().activity.at(-1)).toMatchObject({
      grantId: HA,
      whoId: 's-keisha',
      text: 'Moved 2 expenses ($2,020) from Instrument repair to Sheet music and charts',
    });
  });

  it('refuses a line on another grant, and changes nothing', () => {
    const h = harness();
    const start = h.grants();
    expect(h.actions.moveExpenses('bl-ha-repair', 'bl-lbcf-repair')).toBe(false);
    expect(h.actions.moveExpenses('bl-ha-repair', 'bl-ha-repair')).toBe(false);
    expect(h.actions.moveExpenses('bl-ha-repair', 'bl-nowhere')).toBe(false);
    expect(h.grants()).toBe(start);
    // The reducer holds the line too, should a stale screen get past the action.
    const next = reducer(start, {
      type: 'move-expenses',
      fromLineId: 'bl-ha-repair',
      toLineId: 'bl-lbcf-repair',
      activityId: 'a',
      at: '2026-09-13T10:00:00.000Z',
      whoId: 's-keisha',
    });
    expect(next).toBe(start);
  });

  it('removes the line once its expenses have moved', () => {
    const h = harness();
    const spent = (lineId: string) => h.on(lineId).reduce((sum, e) => sum + e.amount, 0);
    const total = spent('bl-ha-repair') + spent('bl-ha-venue');

    h.actions.moveExpenses('bl-ha-repair', 'bl-ha-venue');
    h.actions.deleteBudgetLine('bl-ha-repair');

    expect(h.grants().budgetLines.some(l => l.id === 'bl-ha-repair')).toBe(false);
    expect(h.grants().expenses.some(e => e.budgetLineId === 'bl-ha-repair')).toBe(false);
    expect(spent('bl-ha-venue')).toBe(total);
  });

  it('offers every other line on the same grant, mapped or not', () => {
    const h = harness();
    h.actions.updateBudgetLine('bl-ha-admin', { accountCodes: [], classId: undefined });
    expect(moveTargets(h.portal(), 'bl-ha-repair').map(l => l.id)).toEqual([
      'bl-ha-stipends',
      'bl-ha-music',
      'bl-ha-venue',
      'bl-ha-admin',
    ]);
    expect(moveTargets(h.portal(), 'bl-nowhere')).toEqual([]);
  });

  it('writes nothing for a line with no expenses', () => {
    const h = harness();
    h.actions.moveExpenses('bl-ha-repair', 'bl-ha-music');
    const after = h.grants();
    expect(h.actions.moveExpenses('bl-ha-repair', 'bl-ha-venue')).toBe(true);
    expect(h.grants()).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// Who may change what (decision 0001)
// ---------------------------------------------------------------------------

describe('the rules', () => {
  /** Every action stubbed to say it ran, behind the slice's real rules. */
  function check(role: Role) {
    const user: SignedInUser = { id: 's-someone', name: 'Someone', role };
    const state = { core: makeCoreSeed(), grants: base() } as unknown as PortalState;
    const stub = Object.fromEntries(
      Object.keys(grantsSlice.rules).map(name => [name, () => 'ran']),
    ) as unknown as GrantsActions;
    return guardActions(stub, grantsSlice.rules, () => state, user) as unknown as Record<
      keyof GrantsActions,
      (...args: unknown[]) => unknown
    >;
  }
  const ran = (value: unknown) => value === 'ran';

  it('names a rule for every action', () => {
    const actions = grantsSlice.createActions(
      () => {},
      () => ({}) as never,
      {
        today: '2026-09-13',
        newId: p => p,
        user: { id: 's-barry', name: 'Barry', role: 'director' },
      },
    );
    expect(Object.keys(grantsSlice.rules).sort()).toEqual(Object.keys(actions).sort());
  });

  it('lets the office assistant work the pipeline but not record an award', () => {
    const a = check('assistant');
    expect(ran(a.addGrant({}))).toBe(true);
    expect(ran(a.transition('g', 'submitted'))).toBe(true);
    expect(ran(a.transition('g', 'awarded'))).toBe(false);
    expect(ran(a.transition('g', 'declined'))).toBe(true);
    expect(ran(a.updateGrant('g', { notes: 'x' }))).toBe(true);
    expect(ran(a.updateGrant('g', { amountAwarded: 5000 }))).toBe(false);
    expect(ran(a.addBudgetLine({}))).toBe(false);
    expect(ran(a.moveExpenses('bl-a', 'bl-b'))).toBe(false);
    expect(ran(a.assignTransaction('t', []))).toBe(false);
  });

  it('lets the bookkeeper do the money but not the pipeline', () => {
    const b = check('bookkeeper');
    expect(ran(b.addGrant({}))).toBe(false);
    expect(ran(b.transition('g', 'awarded'))).toBe(false);
    expect(ran(b.addBudgetLine({}))).toBe(true);
    expect(ran(b.moveExpenses('bl-a', 'bl-b'))).toBe(true);
    expect(ran(b.assignTransaction('t', []))).toBe(true);
    expect(ran(b.syncQuickBooks())).toBe(true);
    expect(ran(b.setQuickBooksConnected(true))).toBe(false);
  });

  it('files a backup with the money and any other file with the grant', () => {
    expect(ran(check('assistant').addFile({ grantId: 'g' }))).toBe(true);
    expect(ran(check('assistant').addFile({ grantId: 'g', expenseId: 'x' }))).toBe(false);
    expect(ran(check('bookkeeper').addFile({ grantId: 'g', expenseId: 'x' }))).toBe(true);
  });

  it('gives Read-only and a teacher nothing to change', () => {
    for (const role of ['read-only', 'teacher'] as Role[]) {
      const r = check(role);
      expect(ran(r.addGrant({}))).toBe(false);
      expect(ran(r.addNote('g', 'hi'))).toBe(false);
      expect(ran(r.assignTransaction('t', []))).toBe(false);
      expect(ran(r.syncQuickBooks())).toBe(false);
    }
  });

  it('keeps connecting QuickBooks to the Admin', () => {
    expect(ran(check('admin').setQuickBooksConnected(true))).toBe(true);
    expect(ran(check('director').setQuickBooksConnected(true))).toBe(false);
  });
});
