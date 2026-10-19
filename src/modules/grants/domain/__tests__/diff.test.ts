import { describe, expect, it } from 'vitest';
import { applyDiff, diffSlice } from '../../../../core/diff';
import type { RowDiff } from '../../../../core/diff';
import type { AnyAction } from '../../../../core/module';
import type { Row, Tables } from '../../../../core/rows';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, SignedInUser } from '../../../../core/types';
import { transactionSnapshot } from '../money';
import { makeSeed } from '../seed';
import { grantsSlice, reducer } from '../slice';
import type { GrantsAction } from '../slice';
import { grantsTables } from '../tables';
import type { GrantsState } from '../types';

/**
 * The rows `Repository.apply` is handed for the grants actions that work out
 * their rows from the state (decision 0008, question 1, #122): the action
 * alone does not say what changed, so each test pins the exact inserts,
 * updates and deletes, hidden deletes included. Then the clearing actions
 * (question 2): a field cleared with `undefined` goes out as `null`.
 */

const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const TX = 'tx-ex-ha-2';
const NOTE = 'Quote approved by Barry on Jul 12. Horn is loaner #14 from the instrument library.';
const AT = '2026-09-13T10:00:00.000Z';
const TODAY = '2026-09-13';

const step = (state: GrantsState, action: GrantsAction) => {
  const next = reducer(state, action);
  return { next, diff: diffSlice(grantsTables, state, next) };
};

/** One table's part of a diff, the lists it leaves out empty. */
const table = (name: string, part: Partial<Omit<RowDiff[number], 'table'>>): RowDiff[number] => ({
  table: name,
  inserts: [],
  updates: [],
  deletes: [],
  ...part,
});

/** The rows of one table in a state, as the mapping writes them. */
const rows = (state: GrantsState, name: string, keep: (row: Row) => boolean = () => true) =>
  (grantsTables.toRows(state) as Tables)[name].filter(keep);
const one = (state: GrantsState, name: string, id: string) =>
  rows(state, name, r => r.id === id)[0];

/** The seeded Signal Hill Music Service expense, as a row: on its transaction, with two files. */
const EX_HA_2: Row = {
  id: 'ex-ha-2',
  grant_id: HA,
  budget_line_id: 'bl-ha-repair',
  date: '2026-07-18',
  payee: 'Signal Hill Music Service',
  amount: 1240,
  note: 'Tenor sax overhaul',
  transaction_id: TX,
  backup_note: NOTE,
};
const FILE_2: Row = {
  id: 'file-2',
  grant_id: HA,
  expense_id: 'ex-ha-2',
  kind: 'receipt',
  name: 'Receipt, Signal Hill Music Service.jpg',
  format: 'jpg',
  size_kb: 1843,
  pages: null,
  uploaded_by: 's-denise',
  uploaded_at: '2026-07-19',
};
const FILE_3: Row = {
  id: 'file-3',
  grant_id: HA,
  expense_id: 'ex-ha-2',
  kind: 'invoice',
  name: 'Invoice 3318, tenor sax overhaul.pdf',
  format: 'pdf',
  size_kb: 214,
  pages: 1,
  uploaded_by: 's-barry',
  uploaded_at: '2026-07-21',
};

const activityRow = (id: string, grantId: string, text: string): Row => ({
  id,
  subject_kind: 'grant',
  subject_id: grantId,
  at: AT,
  who_id: 's-keisha',
  who: null,
  text,
  kind: null,
  detail: null,
});

/** Split the transaction off its old line: no part stays where the expense was. */
const SPLIT: GrantsAction = {
  type: 'assign-transaction',
  id: TX,
  parts: [
    {
      grantId: LBCF,
      budgetLineId: 'bl-lbcf-repair',
      amount: 600,
      expenseId: 'ex-new-1',
      activityId: 'act-split-1',
    },
    {
      grantId: HA,
      budgetLineId: 'bl-ha-music',
      amount: 640,
      expenseId: 'ex-new-2',
      activityId: 'act-split-2',
    },
  ],
  by: 's-keisha',
  date: TODAY,
  at: AT,
  whoId: 's-keisha',
};

describe('grants compound actions as rows', () => {
  it('assign-transaction deletes the old part, inserts the new ones and moves the files', () => {
    const { diff } = step(makeSeed(), SPLIT);
    expect(diff).toEqual([
      table('transactions', {
        updates: [
          {
            key: { id: TX },
            set: { assigned_by: 's-keisha', assigned_at: TODAY },
            was: { assigned_by: 's-denise', assigned_at: '2026-07-20' },
          },
        ],
      }),
      table('expenses', {
        inserts: [
          // The memo becomes a new part's note; the backup note goes to the part on the same grant.
          {
            ...EX_HA_2,
            id: 'ex-new-1',
            grant_id: LBCF,
            budget_line_id: 'bl-lbcf-repair',
            amount: 600,
            backup_note: null,
          },
          { ...EX_HA_2, id: 'ex-new-2', budget_line_id: 'bl-ha-music', amount: 640 },
        ],
        // The hidden delete: nothing in the action names ex-ha-2.
        deletes: [{ key: { id: 'ex-ha-2' }, was: EX_HA_2 }],
      }),
      table('grant_files', {
        updates: [
          {
            key: { id: 'file-2' },
            set: { expense_id: 'ex-new-2' },
            was: { expense_id: 'ex-ha-2' },
          },
          {
            key: { id: 'file-3' },
            set: { expense_id: 'ex-new-2' },
            was: { expense_id: 'ex-ha-2' },
          },
        ],
      }),
      table('activity', {
        inserts: [
          activityRow(
            'act-split-1',
            LBCF,
            'Assigned $600 from Signal Hill Music Service to Instrument repair (split of $1,240)',
          ),
          activityRow(
            'act-split-2',
            HA,
            'Assigned $640 from Signal Hill Music Service to Sheet music and charts (split of $1,240)',
          ),
        ],
      }),
    ]);
  });

  it('assign-transaction keeps the id of a part that stays on its line', () => {
    const { diff } = step(makeSeed(), {
      ...SPLIT,
      parts: [
        {
          grantId: HA,
          budgetLineId: 'bl-ha-repair',
          amount: 740,
          expenseId: 'ex-unused',
          activityId: 'act-keep-1',
        },
        {
          grantId: LBCF,
          budgetLineId: 'bl-lbcf-repair',
          amount: 500,
          expenseId: 'ex-new-1',
          activityId: 'act-keep-2',
        },
      ],
    } as GrantsAction);
    expect(diff).toEqual([
      table('transactions', {
        updates: [
          {
            key: { id: TX },
            set: { assigned_by: 's-keisha', assigned_at: TODAY },
            was: { assigned_by: 's-denise', assigned_at: '2026-07-20' },
          },
        ],
      }),
      table('expenses', {
        inserts: [
          {
            ...EX_HA_2,
            id: 'ex-new-1',
            grant_id: LBCF,
            budget_line_id: 'bl-lbcf-repair',
            amount: 500,
            backup_note: null,
          },
        ],
        updates: [{ key: { id: 'ex-ha-2' }, set: { amount: 740 }, was: { amount: 1240 } }],
      }),
      table('activity', {
        inserts: [
          activityRow(
            'act-keep-1',
            HA,
            'Assigned $740 from Signal Hill Music Service to Instrument repair (split of $1,240)',
          ),
          activityRow(
            'act-keep-2',
            LBCF,
            'Assigned $500 from Signal Hill Music Service to Instrument repair (split of $1,240)',
          ),
        ],
      }),
    ]);
  });

  it('restore-transactions deletes the current parts and puts the old one and its files back', () => {
    const seed = makeSeed();
    const portal = { core: makeCoreSeed(), grants: seed } as unknown as PortalState;
    const snapshot = transactionSnapshot(portal, TX)!;
    const { next: split } = step(seed, SPLIT);
    const { diff } = step(split, { type: 'restore-transactions', snapshots: [snapshot] });
    expect(diff).toEqual([
      table('transactions', {
        updates: [
          {
            key: { id: TX },
            set: { assigned_by: 's-denise', assigned_at: '2026-07-20' },
            was: { assigned_by: 's-keisha', assigned_at: TODAY },
          },
        ],
      }),
      table('expenses', {
        inserts: [EX_HA_2],
        // The hidden deletes: the action carries only the snapshot.
        deletes: [
          { key: { id: 'ex-new-1' }, was: one(split, 'expenses', 'ex-new-1') },
          { key: { id: 'ex-new-2' }, was: one(split, 'expenses', 'ex-new-2') },
        ],
      }),
      table('grant_files', {
        updates: [
          {
            key: { id: 'file-2' },
            set: { expense_id: 'ex-ha-2' },
            was: { expense_id: 'ex-new-2' },
          },
          {
            key: { id: 'file-3' },
            set: { expense_id: 'ex-ha-2' },
            was: { expense_id: 'ex-new-2' },
          },
        ],
      }),
    ]);
  });

  it('set-transaction-status on Send back deletes the parts and their files and clears who assigned it', () => {
    const { diff } = step(makeSeed(), {
      type: 'set-transaction-status',
      id: TX,
      status: 'to-assign',
    });
    expect(diff).toEqual([
      table('transactions', {
        updates: [
          {
            key: { id: TX },
            // Cleared with undefined in the reducer, sent as null.
            set: { status: 'to-assign', assigned_by: null, assigned_at: null },
            was: { status: 'assigned', assigned_by: 's-denise', assigned_at: '2026-07-20' },
          },
        ],
      }),
      table('expenses', { deletes: [{ key: { id: 'ex-ha-2' }, was: EX_HA_2 }] }),
      table('grant_files', {
        deletes: [
          { key: { id: 'file-2' }, was: FILE_2 },
          { key: { id: 'file-3' }, was: FILE_3 },
        ],
      }),
    ]);
  });

  it('set-transaction-status on set-aside deletes the parts and their files too', () => {
    const { diff } = step(makeSeed(), {
      type: 'set-transaction-status',
      id: TX,
      status: 'not-grant-funded',
      by: 's-keisha',
      date: TODAY,
    });
    expect(diff).toEqual([
      table('transactions', {
        updates: [
          {
            key: { id: TX },
            set: { status: 'not-grant-funded', assigned_by: 's-keisha', assigned_at: TODAY },
            was: { status: 'assigned', assigned_by: 's-denise', assigned_at: '2026-07-20' },
          },
        ],
      }),
      table('expenses', { deletes: [{ key: { id: 'ex-ha-2' }, was: EX_HA_2 }] }),
      table('grant_files', {
        deletes: [
          { key: { id: 'file-2' }, was: FILE_2 },
          { key: { id: 'file-3' }, was: FILE_3 },
        ],
      }),
    ]);
  });

  it('move-expenses updates every expense on the line, read from the state', () => {
    const { diff } = step(makeSeed(), {
      type: 'move-expenses',
      fromLineId: 'bl-ha-stipends',
      toLineId: 'bl-ha-venue',
      activityId: 'act-move',
      at: AT,
      whoId: 's-keisha',
    });
    const moved = (id: string) => ({
      key: { id },
      set: { budget_line_id: 'bl-ha-venue' },
      was: { budget_line_id: 'bl-ha-stipends' },
    });
    expect(diff).toEqual([
      table('expenses', {
        updates: [moved('ex-ha-3'), moved('ex-ha-5'), moved('ex-ha-6'), moved('ex-ha-10')],
      }),
      table('activity', {
        inserts: [
          activityRow(
            'act-move',
            HA,
            'Moved 4 expenses ($12,650) from Teaching artist stipends to Venue and performances',
          ),
        ],
      }),
    ]);
  });

  it('add-grant inserts the funder, the grant, its programs, the template tasks, the register and the log row', () => {
    const { next, diff } = step(makeSeed(), {
      type: 'add-grant',
      grant: {
        id: 'g-new',
        funderId: 'f-new',
        title: 'Test grant',
        programs: ['in-school', 'studio'],
        restriction: 'restricted',
        ownerId: 's-barry',
        phase: 'prospect',
        loiRequired: false,
        amountRequested: 9000,
        dates: { applicationDue: '2026-11-02' },
        createdAt: TODAY,
      },
      funder: { id: 'f-new', name: 'Test Funder', type: 'foundation' },
      templateId: 'tpl-corporate-sponsorship',
      excludeTemplateItemIds: [],
      includeDocumentRegister: true,
      activityId: 'act-new',
      at: AT,
      whoId: 's-keisha',
    });
    const ofNew = (r: Row) => r.grant_id === 'g-new';
    const tasks = rows(next, 'tasks', ofNew);
    // The ids are made in the reducer, from the template as it stands in state.
    expect(tasks.map(t => t.id)).toEqual(
      Array.from({ length: tasks.length }, (_, i) => `g-new-t${i + 1}`),
    );
    expect(tasks.length).toBeGreaterThan(0);
    expect(diff).toEqual([
      table('funders', {
        inserts: [
          {
            id: 'f-new',
            name: 'Test Funder',
            type: 'foundation',
            contact_name: null,
            contact_email: null,
            contact_phone: null,
            website: null,
            cycle_notes: null,
            notes: null,
            archived_at: null,
            archived_by: null,
          },
        ],
      }),
      table('grants', { inserts: [one(next, 'grants', 'g-new')] }),
      table('grant_programs', {
        inserts: [
          { grant_id: 'g-new', program_id: 'in-school' },
          { grant_id: 'g-new', program_id: 'studio' },
        ],
      }),
      table('tasks', { inserts: tasks }),
      table('grant_documents', {
        inserts: rows(next, 'grant_documents', ofNew),
      }),
      // Every grant has its first budget, lines or not (the mapping's derived id).
      table('budget_versions', {
        inserts: [{ id: 'g-new-budget-1', grant_id: 'g-new', number: 1 }],
      }),
      table('activity', { inserts: [activityRow('act-new', 'g-new', 'Grant added')] }),
    ]);
    expect(rows(next, 'grant_documents', ofNew).map(d => d.id)).toEqual([
      'g-new-d1',
      'g-new-d2',
      'g-new-d3',
      'g-new-d4',
      'g-new-d5',
    ]);
    expect(one(next, 'grants', 'g-new')).toMatchObject({
      application_due: '2026-11-02',
      amount_requested: 9000,
      phase: 'prospect',
    });
  });

  it('transition merges the new date into the grant and logs the label from state', () => {
    const { diff } = step(makeSeed(), {
      type: 'transition',
      grantId: 'g-port-of-long-beach-2026',
      to: 'submitted',
      payload: { date: '2026-09-12' },
      activityId: 'act-moved',
      at: AT,
      whoId: 's-keisha',
    });
    expect(diff).toEqual([
      table('grants', {
        updates: [
          {
            key: { id: 'g-port-of-long-beach-2026' },
            set: { phase: 'submitted', submitted: '2026-09-12' },
            was: { phase: 'applying', submitted: null },
          },
        ],
      }),
      table('activity', {
        inserts: [activityRow('act-moved', 'g-port-of-long-beach-2026', 'Mark submitted')],
      }),
    ]);
  });

  it('toggle-task sends the value it flipped to, and clears doneAt with null', () => {
    const task = 'g-herb-alpert-2026-t1';
    const { next, diff } = step(makeSeed(), { type: 'toggle-task', id: task, date: TODAY });
    expect(diff).toEqual([
      table('tasks', {
        updates: [
          {
            key: { id: task },
            set: { done: false, done_at: null },
            was: { done: true, done_at: '2026-09-13' },
          },
        ],
      }),
    ]);
    // Ticked again, it is an absolute value, not a flip.
    expect(step(next, { type: 'toggle-task', id: task, date: '2026-09-14' }).diff).toEqual([
      table('tasks', {
        updates: [
          {
            key: { id: task },
            set: { done: true, done_at: '2026-09-14' },
            was: { done: false, done_at: null },
          },
        ],
      }),
    ]);
  });

  it('duplicate-template inserts the copy and its items, built from the source in state', () => {
    const { next, diff } = step(makeSeed(), {
      type: 'duplicate-template',
      id: 'tpl-corporate-sponsorship',
      newTemplateId: 'tpl-copy',
    });
    const items = rows(next, 'checklist_template_items', r => r.template_id === 'tpl-copy');
    expect(items.map(i => i.id)).toEqual(Array.from({ length: 6 }, (_, i) => `tpl-copy-i${i + 1}`));
    expect(diff).toEqual([
      table('checklist_templates', {
        inserts: [
          {
            ...one(makeSeed(), 'checklist_templates', 'tpl-corporate-sponsorship'),
            id: 'tpl-copy',
            name: `${one(makeSeed(), 'checklist_templates', 'tpl-corporate-sponsorship').name} (copy)`,
          },
        ],
      }),
      table('checklist_template_items', { inserts: items }),
    ]);
  });

  // #114: sent again after the server committed, the same rows change nothing.
  it('writes the same rows again as no change', () => {
    const before = makeSeed();
    const { next, diff } = step(before, SPLIT);
    const once = applyDiff(grantsTables.keys, grantsTables.toRows(before), diff);
    const twice = applyDiff(grantsTables.keys, once, diff);
    expect(twice).toEqual(once);
    const byKey = (t: Tables) =>
      Object.fromEntries(
        Object.entries(t).map(([name, list]) => [
          name,
          [...list].map(r => JSON.stringify(r)).sort(),
        ]),
      );
    expect(byKey(once)).toEqual(byKey(grantsTables.toRows(next)));
  });
});

// ---------------------------------------------------------------------------
// Clearing actions (decision 0008, 2A)
// ---------------------------------------------------------------------------

describe('grants clearing actions as rows', () => {
  const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha', role: 'office-manager' };

  function harness() {
    let grants = makeSeed();
    const portal = () => ({ core: makeCoreSeed(), grants }) as unknown as PortalState;
    const actions = grantsSlice.createActions(
      (action: AnyAction) => {
        grants = grantsSlice.reducer(grants, action);
      },
      portal,
      { today: TODAY, newId: prefix => `${prefix}-new`, user: KEISHA },
    );
    const diffOf = (run: () => void) => {
      const before = grants;
      run();
      return diffSlice(grantsTables, before, grants);
    };
    return { actions, diffOf };
  }

  it('unlinkDocument clears the office document with null', () => {
    const h = harness();
    const id = 'g-herb-alpert-2026-d3';
    expect(h.diffOf(() => h.actions.unlinkDocument(id))).toEqual([
      table('grant_documents', {
        updates: [
          {
            key: { id },
            set: { office_document_id: null, updated_at: TODAY },
            was: { office_document_id: 'doc-irs-letter', updated_at: '2026-07-06' },
          },
        ],
      }),
    ]);
  });

  it('restoring a funder clears both archive columns with null', () => {
    const h = harness();
    h.actions.archiveFunder('f-herb-alpert');
    expect(h.diffOf(() => h.actions.restoreFunder('f-herb-alpert'))).toEqual([
      table('funders', {
        updates: [
          {
            key: { id: 'f-herb-alpert' },
            set: { archived_at: null, archived_by: null },
            was: { archived_at: TODAY, archived_by: 's-keisha' },
          },
        ],
      }),
    ]);
  });
});
