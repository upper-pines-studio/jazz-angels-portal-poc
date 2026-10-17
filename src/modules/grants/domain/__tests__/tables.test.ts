import { describe, expect, it } from 'vitest';
import { makeEmpty, makeSeed } from '../seed';
import { grantsSlice } from '../slice';
import { firstBudgetId, grantsTables } from '../tables';
import type { GrantsState } from '../types';

/** What reading the rows back gives: `incoming` is not stored (SCHEMA.md). */
const stored = (state: GrantsState): GrantsState => ({ ...state, incoming: [] });

describe('grants tables (#121)', () => {
  it.each([
    ['demo seed', makeSeed()],
    ['empty', makeEmpty()],
  ])('round-trips the %s', (_, state) => {
    const rows = grantsTables.toRows(state);
    expect(Object.keys(rows)).toEqual(Object.keys(grantsTables.keys));
    expect(grantsTables.fromRows(rows)).toEqual(stored(state));
  });

  it('is the mapping on the grants slice', () => {
    expect(grantsSlice.tables).toBe(grantsTables);
  });

  it("puts a grant's dates and how it was brought in on its row, and its programs in grant_programs", () => {
    const state = makeSeed();
    const grant = {
      ...state.grants[0],
      programs: ['studio-sessions', 'in-school'],
      dates: { applicationDue: '2026-10-01', periodEnd: '2027-06-30' },
      broughtIn: { phase: 'active' as const, on: '2026-09-01' },
    };
    const rows = grantsTables.toRows({ ...state, grants: [grant] });
    expect(rows.grants[0]).toMatchObject({
      application_due: '2026-10-01',
      period_end: '2027-06-30',
      loi_due: null,
      brought_in_phase: 'active',
      brought_in_on: '2026-09-01',
    });
    expect(rows.grant_programs).toEqual([
      { grant_id: grant.id, program_id: 'studio-sessions' },
      { grant_id: grant.id, program_id: 'in-school' },
    ]);
    const back = grantsTables.fromRows(rows).grants[0];
    expect(back.dates).toEqual(grant.dates);
    expect(back.broughtIn).toEqual(grant.broughtIn);
  });

  it("gives every grant its first budget, and each line's planned amount in it", () => {
    const state = makeSeed();
    const rows = grantsTables.toRows(state);
    expect(rows.budget_versions).toHaveLength(state.grants.length);
    const line = state.budgetLines[0];
    expect(rows.budget_line_amounts).toContainEqual({
      budget_version_id: firstBudgetId(line.grantId),
      budget_line_id: line.id,
      planned: line.planned,
    });
    expect(rows.budget_lines[0]).not.toHaveProperty('planned');
  });

  it("reads a line's planned amount from its grant's newest budget", () => {
    const state = makeSeed();
    const line = state.budgetLines[0];
    const rows = grantsTables.toRows(state);
    const second = `${line.grantId}-budget-2`;
    const back = grantsTables.fromRows({
      ...rows,
      budget_versions: [...rows.budget_versions, { id: second, grant_id: line.grantId, number: 2 }],
      budget_line_amounts: [
        ...rows.budget_line_amounts,
        { budget_version_id: second, budget_line_id: line.id, planned: line.planned + 500 },
      ],
    });
    expect(back.budgetLines[0].planned).toBe(line.planned + 500);
  });

  it("numbers a template's items, a split rule's parts and keeps them in that order", () => {
    const state = makeSeed();
    const rows = grantsTables.toRows(state);
    const template = state.templates[0];
    const items = rows.checklist_template_items.filter(i => i.template_id === template.id);
    expect(items.map(i => i.sort_order)).toEqual(template.items.map((_, i) => i + 1));
    const back = grantsTables.fromRows({
      ...rows,
      checklist_template_items: [...rows.checklist_template_items].reverse(),
      split_rule_parts: [...rows.split_rule_parts].reverse(),
    });
    expect(back.templates).toEqual(state.templates);
    expect(back.splitRules).toEqual(state.splitRules);
  });

  it("writes a share's target as columns", () => {
    const rows = grantsTables.toRows(makeSeed()).grant_shares;
    const program = rows.find(r => r.target_kind === 'program')!;
    const project = rows.find(r => r.target_kind === 'project')!;
    expect(program.project_id).toBeNull();
    expect(program.fiscal_year).toBe('FY27');
    expect(project.program_id).toBeNull();
    expect(project.fiscal_year).toBeNull();
  });

  it('keeps the log as activity rows on the grant, and reads back only those', () => {
    const state = makeSeed();
    const rows = grantsTables.toRows(state);
    expect(rows.activity[0]).toMatchObject({
      subject_kind: 'grant',
      subject_id: state.activity[0].grantId,
      who_id: state.activity[0].whoId,
    });
    const step = {
      id: 'te-1:1',
      subject_kind: 'time-entry',
      subject_id: 'te-1',
      at: '2026-09-08',
      who_id: 's-ana',
      who: null,
      text: 'Logged',
      kind: null,
      detail: null,
    } as unknown as (typeof rows.activity)[number];
    expect(grantsTables.fromRows({ ...rows, activity: [...rows.activity, step] }).activity).toEqual(
      state.activity,
    );
  });

  it('writes QuickBooks as not connected with nulls until it is', () => {
    const rows = grantsTables.toRows(makeEmpty());
    expect(rows.quickbooks_connection).toEqual([
      { id: 1, connected: false, company: null, last_synced_at: null },
    ]);
    expect(rows.transactions).toEqual([]);
  });
});
