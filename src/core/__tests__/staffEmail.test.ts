import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import { STAFF_EMAIL_REFUSAL, looksLikeEmail, staffEmailProblem, tidyEmail } from '../staff';
import { makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice, guardActions } from '../store';
import type { CoreState, PortalState, Role, SignedInUser, StaffMember } from '../types';

const TODAY = '2026-10-07';
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

/** The core slice behind its real rules, for one signed-in person. */
function core(user: SignedInUser = as('director', 's-denise'), start: CoreState = makeCoreSeed()) {
  let state = { core: start } as unknown as PortalState;
  let n = 0;
  const refused: string[] = [];
  const getState = () => state;
  const actions = guardActions(
    coreSlice.createActions(
      (a: AnyAction) => {
        state = { ...state, core: coreSlice.reducer(state.core, a) };
      },
      getState,
      { today: TODAY, newId: p => `${p}-${(n += 1)}`, user },
    ),
    coreSlice.rules,
    getState,
    user,
    m => refused.push(m),
  );
  return { actions, refused, state: () => state.core };
}

const person: Omit<StaffMember, 'id'> = {
  name: 'Dana Whitfield',
  title: 'Teaching Artist',
  role: 'teacher',
  teaches: true,
};

describe('the staff email (#152)', () => {
  it('reads what looks like an email', () => {
    expect(looksLikeEmail(' dana@example.org ')).toBe(true);
    for (const bad of ['dana', 'dana@', '@example.org', 'dana@example', 'da na@example.org']) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });

  it('tidies to trimmed lower-case, or nothing when blank', () => {
    expect(tidyEmail('  Dana@Example.ORG ')).toBe('dana@example.org');
    expect(tidyEmail('   ')).toBeUndefined();
    expect(tidyEmail(undefined)).toBeUndefined();
  });

  it('refuses a bad email with a sentence, and lets blank through', () => {
    const staff = makeCoreSeed().staff;
    expect(staffEmailProblem(staff, 'dana@')).toBe(STAFF_EMAIL_REFUSAL);
    expect(staffEmailProblem(staff, '')).toBeUndefined();
    expect(staffEmailProblem(staff, undefined)).toBeUndefined();
    expect(staffEmailProblem(staff, 'dana@example.org')).toBeUndefined();
  });

  it('refuses an email another current person has, naming them, whatever its case', () => {
    const staff = makeCoreSeed().staff;
    expect(staffEmailProblem(staff, ' Barry.Cogert@Example.org ')).toBe(
      'Barry Cogert already has that email. Each person needs their own.',
    );
    // Your own address is not a clash with yourself.
    expect(staffEmailProblem(staff, 'barry.cogert@example.org', 's-barry')).toBeUndefined();
  });

  it('lets an archived person’s address be used again', () => {
    const staff = makeCoreSeed().staff.map(s =>
      s.id === 's-barry' ? { ...s, archivedAt: TODAY, archivedById: 's-gwen' } : s,
    );
    expect(staffEmailProblem(staff, 'barry.cogert@example.org')).toBeUndefined();
  });

  it('adds a person with a tidy email', () => {
    const c = core();
    const id = c.actions.addStaff({ ...person, email: ' Dana@Example.org ' });
    expect(c.state().staff.find(s => s.id === id)?.email).toBe('dana@example.org');
  });

  it('adds a person with no email, and a blank one is not stored', () => {
    const c = core();
    const a = c.actions.addStaff(person);
    const b = c.actions.addStaff({ ...person, name: 'Sam', email: '  ' });
    expect(c.state().staff.find(s => s.id === a)).not.toHaveProperty('email');
    expect(c.state().staff.find(s => s.id === b)?.email).toBeUndefined();
  });

  it('refuses a bad and a duplicate email on add, saving nothing', () => {
    const c = core();
    const before = c.state().staff.length;
    c.actions.addStaff({ ...person, email: 'nope' });
    c.actions.addStaff({ ...person, email: 'tess.holloway@example.org' });
    expect(c.refused).toEqual([
      STAFF_EMAIL_REFUSAL,
      'Tess Holloway already has that email. Each person needs their own.',
    ]);
    expect(c.state().staff).toHaveLength(before);
  });

  it('changes, refuses and clears an email on update', () => {
    const c = core();
    c.actions.updateStaff('s-devon', { email: 'Devon@Example.org' });
    expect(c.state().staff.find(s => s.id === 's-devon')?.email).toBe('devon@example.org');

    c.actions.updateStaff('s-devon', { email: 'renee.cole@example.org' });
    c.actions.updateStaff('s-devon', { email: 'devon' });
    expect(c.refused).toHaveLength(2);
    expect(c.state().staff.find(s => s.id === 's-devon')?.email).toBe('devon@example.org');

    c.actions.updateStaff('s-devon', { email: '' });
    expect(c.state().staff.find(s => s.id === 's-devon')?.email).toBeUndefined();
  });

  it('leaves the email alone when an update does not mention it', () => {
    const c = core();
    c.actions.updateStaff('s-devon', { title: 'Lead Teaching Artist' });
    expect(c.state().staff.find(s => s.id === 's-devon')?.email).toBe('devon.price@example.org');
  });

  it('is changed by whoever may edit staff, and no one else', () => {
    const teacher = core(as('teacher', 's-devon'));
    teacher.actions.updateStaff('s-renee', { email: 'r@example.org' });
    expect(teacher.refused).toHaveLength(1);
    expect(teacher.state().staff.find(s => s.id === 's-renee')?.email).toBe(
      'renee.cole@example.org',
    );
    const admin = core(as('admin', 's-gwen'));
    admin.actions.updateStaff('s-renee', { email: 'r@example.org' });
    expect(admin.state().staff.find(s => s.id === 's-renee')?.email).toBe('r@example.org');
  });

  it('saved data without the field loads unchanged, and with an untidy one loads tidy', () => {
    const seed = makeCoreSeed();
    const old = JSON.parse(JSON.stringify(seed));
    for (const s of old.staff) delete s.email;
    old.staff[0].email = ' Barry@Example.org ';
    const loaded = coreSlice.normalise!(old, true)!;
    expect(loaded.staff[0].email).toBe('barry@example.org');
    expect(loaded.staff[1]).not.toHaveProperty('email');
    expect(makeCoreEmpty().staff.every(s => !('email' in s) || tidyEmail(s.email))).toBe(true);
  });

  it('round-trips through the rows, null when missing', () => {
    const state = makeCoreSeed();
    state.staff[1] = { ...state.staff[1], email: undefined };
    const rows = coreSlice.tables.toRows(state);
    expect(rows.staff[0]).toMatchObject({ email: 'barry.cogert@example.org' });
    expect(rows.staff[1]).toMatchObject({ email: null });
    const back = coreSlice.tables.fromRows(rows);
    expect(back.staff[0].email).toBe('barry.cogert@example.org');
    expect(back.staff[1]).not.toHaveProperty('email');
  });
});
