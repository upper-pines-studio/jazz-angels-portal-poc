import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { makeSeed } from '../seed';
import { grantsSlice, reducer } from '../slice';
import type { GrantsActions } from '../slice';
import type { GrantsState, NewGrantInput } from '../types';

const TODAY = '2026-09-13';
const HA = 'g-herb-alpert-2026';
const PORT = 'g-port-of-long-beach-2026';

/** A seed row without the fields its add action fills in itself. */
function without<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * The slice's raw actions on the seed. Every action sent is kept, so `resend`
 * can send them all again, as Try again does after a save that timed out.
 */
function harness() {
  let grants: GrantsState = makeSeed();
  let sent: AnyAction[] = [];
  let n = 0;
  const core = makeCoreSeed();
  const dispatch = (action: AnyAction) => {
    sent.push(action);
    grants = grantsSlice.reducer(grants, action);
  };
  const actions = grantsSlice.createActions(
    dispatch,
    () => ({ core, grants }) as unknown as PortalState,
    {
      today: TODAY,
      newId: prefix => `${prefix}-t${(n += 1)}`,
      user: { id: 's-keisha', name: 'Keisha Moore', role: 'office-manager' },
    },
  );
  return {
    actions,
    state: () => grants,
    sent: () => sent,
    resend() {
      const again = sent;
      sent = [];
      again.forEach(dispatch);
    },
  };
}

const NEW_GRANT: NewGrantInput = {
  newFunder: { name: 'Test Funder', type: 'foundation' },
  title: 'Test grant',
  programs: ['in-school'],
  restriction: 'restricted',
  ownerId: 's-barry',
  loiRequired: false,
  amountRequested: 9000,
  dates: { applicationDue: '2026-11-02' },
  templateId: 'tpl-foundation-standard',
};

const seed = makeSeed();
const toAssign = seed.transactions.find(t => t.status === 'to-assign')!;
const line = seed.budgetLines[0];
/** A line with expenses on it, and another line on the same grant to move them to. */
const fromLine = seed.budgetLines.find(l => seed.expenses.some(e => e.budgetLineId === l.id))!;
const toLine = seed.budgetLines.find(l => l.grantId === fromLine.grantId && l.id !== fromLine.id)!;

const paths: Array<[string, (a: GrantsActions) => unknown]> = [
  ['addFunder', a => a.addFunder(without(seed.funders[0], 'id'))],
  ['addGrant', a => a.addGrant(NEW_GRANT)],
  [
    'addGrant, brought in under way',
    a =>
      a.addGrant({
        ...NEW_GRANT,
        phase: 'active',
        inFlight: {
          amountAwarded: 9000,
          budgetLines: [{ category: 'Stipends', planned: 9000 }],
          payments: [{ label: 'First half', expectedDate: '2026-10-01', amount: 4500 }],
          reports: [{ kind: 'final', dueDate: '2027-06-30', status: 'upcoming' }],
        },
      }),
  ],
  [
    'renewGrant',
    a =>
      a.renewGrant({
        grantId: HA,
        title: 'Herb Alpert 2027',
        dates: {},
        ownerId: 's-barry',
        programs: ['in-school'],
      }),
  ],
  ['archiveGrant', a => a.archiveGrant(HA)],
  ['transition', a => a.transition(PORT, 'submitted', { date: TODAY })],
  ['addTask', a => a.addTask(without(seed.tasks[0], 'id'))],
  ['addDocument', a => a.addDocument(without(seed.documents[0], 'id'))],
  ['addPayment', a => a.addPayment(without(seed.payments[0], 'id'))],
  ['markPaymentReceived', a => a.markPaymentReceived(seed.payments[0].id, TODAY)],
  ['addBudgetLine', a => a.addBudgetLine(without(line, 'id'))],
  ['moveExpenses', a => a.moveExpenses(fromLine.id, toLine.id)],
  ['addExpense', a => a.addExpense(without(seed.expenses[0], 'id'))],
  ['syncQuickBooks', a => a.syncQuickBooks()],
  [
    'assignTransaction',
    a =>
      a.assignTransaction(toAssign.id, [
        { grantId: line.grantId, budgetLineId: line.id, amount: toAssign.amount },
      ]),
  ],
  ['acceptSuggestions', a => a.acceptSuggestions()],
  [
    'saveSplitRule',
    a => a.saveSplitRule({ ...without(seed.splitRules[0], 'id'), payee: 'A payee with no rule' }),
  ],
  ['addFile', a => a.addFile(without(seed.files[0], 'id', 'uploadedById', 'uploadedAt'))],
  ['addTerm', a => a.addTerm(without(seed.terms[0], 'id', 'order'))],
  ['addReport', a => a.addReport(without(seed.reports[0], 'id'))],
  ['markReportSubmitted', a => a.markReportSubmitted(seed.reports[0].id, TODAY)],
  [
    'giveShare',
    a =>
      a.giveShare({
        grantId: HA,
        target: { kind: 'program', programId: 'homeschool', fiscalYear: 'FY28' },
        amount: 500,
      }),
  ],
  ['addNote', a => a.addNote(HA, 'Called the program officer')],
  ['addTemplate', a => a.addTemplate(without(seed.templates[0], 'id'))],
  ['duplicateTemplate', a => a.duplicateTemplate(seed.templates[0].id)],
];

describe('grants inserts sent twice', () => {
  it.each(paths)('%s leaves one row', (_name, run) => {
    const h = harness();
    run(h.actions);
    expect(h.sent().length).toBeGreaterThan(0);
    const once = h.state();
    h.resend();
    expect(h.state()).toEqual(once);
  });

  it('adds a grant with one checklist, one register and one activity row', () => {
    const h = harness();
    const id = h.actions.addGrant(NEW_GRANT);
    const count = (s: GrantsState) => ({
      grants: s.grants.filter(g => g.id === id).length,
      funders: s.funders.length,
      tasks: s.tasks.filter(t => t.grantId === id).length,
      documents: s.documents.filter(d => d.grantId === id).length,
      activity: s.activity.filter(a => a.grantId === id).length,
    });
    const once = count(h.state());
    expect(once).toMatchObject({ grants: 1, activity: 1 });
    h.resend();
    expect(count(h.state())).toEqual(once);
  });

  it('gives each part of an assignment one activity row', () => {
    const h = harness();
    h.actions.assignTransaction(toAssign.id, [
      { grantId: line.grantId, budgetLineId: line.id, amount: toAssign.amount },
    ]);
    const rows = h.state().activity.length;
    h.resend();
    expect(h.state().activity).toHaveLength(rows);
    expect(h.state().expenses.filter(e => e.transactionId === toAssign.id)).toHaveLength(1);
  });

  it('pulls a QuickBooks transaction once even if it is waiting again', () => {
    const start = makeSeed();
    const pulled = reducer(start, { type: 'sync', at: `${TODAY}T09:00` });
    const again = reducer(
      { ...pulled, incoming: start.incoming },
      { type: 'sync', at: `${TODAY}T09:00` },
    );
    expect(again.transactions).toHaveLength(pulled.transactions.length);
  });
});
