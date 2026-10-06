import { describe, expect, it } from 'vitest';
import decision from '../../../docs/decisions/0001-roles-and-permissions.md?raw';
import { PERMISSION_TABLE, can, cell, isOwnOnly, mayChangeStaff, meetsAny } from '../permissions';
import type { Cell, Need, Subject } from '../permissions';
import { ROLES, ROLE_LABELS } from '../roles';
import { coreSlice, guardActions, refusalMessage } from '../store';
import { makeCoreSeed } from '../seed';
import type { PortalState, Role, SignedInUser } from '../types';

/** The "What each role can do" table, read straight from the decision file. */
function decisionTable(): Array<{ label: string; cells: string[] }> {
  const section = decision.split('## What each role can do')[1].split('\n## ')[0];
  const lines = section.split('\n').filter(l => l.startsWith('|'));
  const [header, , ...rows] = lines;
  const split = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());
  expect(split(header).slice(1)).toEqual([
    'Admin',
    'Director',
    'Office manager',
    'Bookkeeper',
    'Teacher',
    'Assistant',
    'Read-only',
  ]);
  return rows.map(r => {
    const [label, ...cells] = split(r);
    return { label, cells };
  });
}

describe('the table', () => {
  it('has the columns in the order of ROLES', () => {
    expect(ROLES.map(r => ROLE_LABELS[r])).toEqual([
      'Admin',
      'Director',
      'Office manager',
      'Bookkeeper',
      'Teacher',
      'Office assistant',
      'Read-only',
    ]);
  });

  it('matches decision 0001 row for row and cell for cell', () => {
    const written = decisionTable();
    expect(PERMISSION_TABLE.map(([, label]) => label)).toEqual(written.map(r => r.label));
    for (const [i, [subject, , row]] of PERMISSION_TABLE.entries()) {
      ROLES.forEach((role, column) => {
        expect(`${subject}/${role}: ${cell(role, subject)}`).toBe(
          `${subject}/${role}: ${written[i].cells[column]}`,
        );
      });
      expect(row).toHaveLength(ROLES.length);
    }
  });
});

/**
 * What each kind of cell allows, asked without and with a record of one's own.
 * `Own classes` on Students and Guardian contacts is to see, not to change.
 */
const EXPECTED: Record<Cell, Record<Need, [boolean, boolean]>> = {
  Edit: { open: [true, true], view: [true, true], edit: [true, true] },
  View: { open: [true, true], view: [true, true], edit: [false, false] },
  'View all': { open: [true, true], view: [true, true], edit: [false, false] },
  'Any class': { open: [true, true], view: [true, true], edit: [true, true] },
  Yes: { open: [true, true], view: [true, true], edit: [true, true] },
  Own: { open: [true, true], view: [false, true], edit: [false, true] },
  'Own classes': { open: [true, true], view: [false, true], edit: [false, true] },
  'Counts only': { open: [true, true], view: [false, false], edit: [false, false] },
  '–': { open: [false, false], view: [false, false], edit: [false, false] },
};
const SEE_ONLY: Subject[] = ['students', 'guardian-contacts'];

describe('can, cell by cell', () => {
  for (const [subject, label] of PERMISSION_TABLE) {
    for (const role of ROLES) {
      const c = cell(role, subject);
      it(`${label} · ${ROLE_LABELS[role]} (${c})`, () => {
        for (const need of ['open', 'view', 'edit'] as Need[]) {
          let [other, own] = EXPECTED[c][need];
          if (need === 'edit' && c === 'Own classes' && SEE_ONLY.includes(subject)) {
            [other, own] = [false, false];
          }
          expect(can(role, subject, need, false), `${need}, not own`).toBe(other);
          expect(can(role, subject, need, true), `${need}, own`).toBe(own);
        }
      });
    }
  }
});

describe('the rules the table spells out', () => {
  it('lets a teacher take roll for their own class and no other', () => {
    expect(can('teacher', 'roll-call', 'edit', true)).toBe(true);
    expect(can('teacher', 'roll-call', 'edit', false)).toBe(false);
    expect(isOwnOnly('teacher', 'roll-call')).toBe(true);
    expect(isOwnOnly('director', 'roll-call')).toBe(false);
  });

  it('keeps guardian contacts from the bookkeeper, the assistant and Read-only', () => {
    for (const role of ['bookkeeper', 'assistant', 'read-only'] as Role[]) {
      expect(can(role, 'guardian-contacts', 'view', true)).toBe(false);
    }
    expect(can('teacher', 'guardian-contacts', 'view', true)).toBe(true);
    expect(can('teacher', 'guardian-contacts', 'view', false)).toBe(false);
  });

  it('gives Read-only student counts, not students', () => {
    expect(can('read-only', 'students', 'open')).toBe(true);
    expect(can('read-only', 'students', 'view', true)).toBe(false);
  });

  it('reads a list of requirements as any one of them, and none as open', () => {
    expect(meetsAny('bookkeeper', undefined)).toBe(true);
    expect(meetsAny('bookkeeper', [])).toBe(true);
    expect(meetsAny('bookkeeper', [{ subject: 'staff' }, { subject: 'quickbooks-sync' }])).toBe(
      true,
    );
    expect(meetsAny('teacher', [{ subject: 'staff' }, { subject: 'quickbooks-sync' }])).toBe(false);
    expect(meetsAny('assistant', { subject: 'grants', need: 'edit' })).toBe(true);
    expect(meetsAny('bookkeeper', { subject: 'grants', need: 'edit' })).toBe(false);
  });

  it('lets only an Admin make an Admin or change one', () => {
    expect(mayChangeStaff('admin', 'teacher', 'admin')).toBe(true);
    expect(mayChangeStaff('director', 'teacher', 'office-manager')).toBe(true);
    expect(mayChangeStaff('director', 'teacher', 'admin')).toBe(false);
    expect(mayChangeStaff('director', 'admin', 'admin')).toBe(false);
    expect(mayChangeStaff('office-manager', 'teacher', 'teacher')).toBe(false);
  });
});

describe('the store refuses what the role may not do', () => {
  const user = (role: Role): SignedInUser => ({ id: 's-someone', name: 'Someone', role });

  function core(role: Role) {
    let state = { core: makeCoreSeed() } as unknown as PortalState;
    const refused: string[] = [];
    const getState = () => state;
    const actions = guardActions(
      coreSlice.createActions(
        a => {
          state = { ...state, core: coreSlice.reducer(state.core, a) };
        },
        getState,
        { today: '2026-09-13', newId: p => `${p}-1`, user: user(role) },
      ),
      coreSlice.rules,
      getState,
      user(role),
      m => refused.push(m),
    );
    return { actions, refused, state: () => state };
  }

  it('changes nothing and says why, naming the role', () => {
    const h = core('teacher');
    const before = h.state();
    h.actions.addOrganization({ name: 'Somewhere', kind: 'school' } as never);
    expect(h.state()).toBe(before);
    expect(h.refused).toEqual(["You can't do that as a Teacher."]);
  });

  it('lets the work through for a role that may', () => {
    const h = core('office-manager');
    h.actions.addOrganization({ name: 'Somewhere', kind: 'school' } as never);
    expect(h.refused).toEqual([]);
    expect(h.state().core.organizations.some(o => o.name === 'Somewhere')).toBe(true);
  });

  it('keeps a Director from making anyone an Admin', () => {
    const h = core('director');
    h.actions.updateStaff('s-devon', { role: 'admin' });
    expect(h.refused).toHaveLength(1);
    expect(h.state().core.staff.find(s => s.id === 's-devon')?.role).toBe('teacher');
    h.actions.updateStaff('s-devon', { title: 'Lead Teaching Artist' });
    expect(h.state().core.staff.find(s => s.id === 's-devon')?.title).toBe('Lead Teaching Artist');
  });

  it('words the refusal for every role', () => {
    expect(refusalMessage('admin')).toBe("You can't do that as an Admin.");
    expect(refusalMessage('office-manager')).toBe("You can't do that as an Office manager.");
    expect(refusalMessage('assistant')).toBe("You can't do that as an Office assistant.");
    expect(refusalMessage('read-only')).toBe("You can't do that as a Read-only user.");
  });
});
