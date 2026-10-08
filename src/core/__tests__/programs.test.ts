import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import { programName, programOptions, programProblem, programsList } from '../derive';
import { makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice, describeCoreChange, guardActions } from '../store';
import type { CoreState, PortalState, Role, SignedInUser } from '../types';

const TODAY = '2026-10-07';
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

/** The core slice behind its real rules, for one signed-in person. */
function core(user: SignedInUser = as('director', 's-denise'), start: CoreState = makeCoreSeed()) {
  let state = { core: start } as unknown as PortalState;
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const getState = () => state;
  const actions = guardActions(
    coreSlice.createActions(
      a => {
        sent.push(a);
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
  return { actions, refused, sent, state: () => state };
}

describe('adding and renaming a program', () => {
  it('gives a new program a generated id, not one made from its name', () => {
    const c = core();
    const id = c.actions.addProgram({ name: '  Summer Jazz Camp ', short: ' Camp ' });
    expect(id).toMatch(/^p-[0-9a-z]{10}$/);
    expect(c.state().core.programs.at(-1)).toEqual({
      id,
      name: 'Summer Jazz Camp',
      short: 'Camp',
    });
    expect(describeCoreChange(c.sent[0])).toBe('the program');
  });

  it('takes the name as the short name when none is given', () => {
    const c = core();
    c.actions.addProgram({ name: 'Summer Jazz Camp', short: '' });
    expect(c.state().core.programs.at(-1)).toMatchObject({ short: 'Summer Jazz Camp' });
  });

  it('renames a program and keeps its id, so everything that names it follows', () => {
    const c = core();
    c.actions.updateProgram('in-school', { name: 'In-School Residencies' });
    expect(c.state().core.programs.find(p => p.id === 'in-school')).toEqual({
      id: 'in-school',
      name: 'In-School Residencies',
      short: 'In-school',
    });
    expect(programName(c.state(), 'in-school')).toBe('In-School Residencies');
  });

  it('refuses a blank name and a name another program has, saying why', () => {
    const c = core();
    expect(c.actions.addProgram({ name: ' ', short: '' })).toBeUndefined();
    c.actions.addProgram({ name: 'homeschool program', short: '' });
    c.actions.updateProgram('in-school', { name: 'Jazz Legacy Program' });
    expect(c.refused).toEqual([
      'Give the program a name.',
      'There is already a program called Homeschool Program.',
      'There is already a program called Jazz Legacy Program.',
    ]);
    expect(c.sent).toEqual([]);
    // Its own name is not a clash.
    expect(
      programProblem(c.state().core.programs, { name: 'In-School Program' }, 'in-school'),
    ).toBe(undefined);
  });

  it('is for Admin and Director only (decision 0001, "Programs")', () => {
    for (const role of ['admin', 'director'] as Role[]) {
      const c = core(as(role));
      c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
      c.actions.updateProgram('in-school', { short: 'Schools' });
      c.actions.archiveProgram('jazz-legacy');
      c.actions.restoreProgram('jazz-legacy');
      expect(c.refused, role).toEqual([]);
    }
    for (const role of [
      'office-manager',
      'bookkeeper',
      'teacher',
      'assistant',
      'read-only',
    ] as Role[]) {
      const c = core(as(role));
      c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
      c.actions.updateProgram('in-school', { short: 'Schools' });
      c.actions.archiveProgram('jazz-legacy');
      c.actions.restoreProgram('jazz-legacy');
      expect(c.sent, role).toEqual([]);
      expect(c.refused, role).toHaveLength(4);
    }
  });

  it('lets a new office with no programs add its first', () => {
    const empty = { ...makeCoreEmpty(), programs: [] };
    const c = core(as('admin', 's-gwen'), empty);
    c.actions.addProgram({ name: 'Studio Semester Sessions', short: 'Studio' });
    expect(programOptions(c.state()).map(p => p.name)).toEqual(['Studio Semester Sessions']);
  });
});

describe('archiving and restoring a program', () => {
  it('takes it off the pickers and keeps its name on what names it', () => {
    const c = core();
    c.actions.archiveProgram('jazz-legacy');
    const archived = c.state().core.programs.find(p => p.id === 'jazz-legacy')!;
    expect(archived).toMatchObject({ archivedAt: TODAY, archivedById: 's-denise' });
    expect(describeCoreChange(c.sent[0])).toBe('the archive change');

    expect(programOptions(c.state()).map(p => p.id)).not.toContain('jazz-legacy');
    // A record already on it keeps it in its own picker.
    expect(programOptions(c.state(), 'jazz-legacy').map(p => p.id)).toContain('jazz-legacy');
    expect(programName(c.state(), 'jazz-legacy')).toBe('Jazz Legacy Program');
    expect(programsList(c.state()).map(p => p.id)).not.toContain('jazz-legacy');
    expect(programsList(c.state(), true).at(-1)!.id).toBe('jazz-legacy');

    c.actions.restoreProgram('jazz-legacy');
    expect(programOptions(c.state()).map(p => p.id)).toContain('jazz-legacy');
  });
});

describe('loading saved programs', () => {
  it('keeps every id as it was, seeded or generated, and tidies the rest', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    saved.programs.push({ id: 'p-0a1b2c3d4e', name: 'Summer Jazz Camp' });
    saved.programs.push({ id: 'p-old', name: 'Old Program', short: 'Old', archivedAt: null });
    saved.programs.push({
      id: 'p-gone',
      name: 'Gone',
      short: 'Gone',
      archivedAt: '2026-09-01',
      archivedById: 's-gwen',
    });
    const loaded = coreSlice.normalise!(saved, false)!;
    expect(loaded.programs.map(p => p.id)).toEqual([
      'studio-sessions',
      'in-school',
      'homeschool',
      'jazz-legacy',
      'advanced-workshop',
      'general-operating',
      'p-0a1b2c3d4e',
      'p-old',
      'p-gone',
    ]);
    expect(loaded.programs.slice(0, 6)).toEqual(makeCoreSeed().programs);
    expect(loaded.programs[6]).toEqual({
      id: 'p-0a1b2c3d4e',
      name: 'Summer Jazz Camp',
      short: 'Summer Jazz Camp',
    });
    expect(loaded.programs[7]).not.toHaveProperty('archivedAt');
    expect(loaded.programs[8]).toMatchObject({ archivedAt: '2026-09-01', archivedById: 's-gwen' });
  });
});
