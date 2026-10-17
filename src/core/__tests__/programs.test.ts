import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import {
  inSchoolProgramIds,
  isInSchool,
  programName,
  programOptions,
  programProblem,
  programsList,
} from '../derive';
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
    // The id comes from the store's `newId`, never from the name.
    expect(id).toBe('p-1');
    expect(c.state().core.programs.at(-1)).toEqual({
      id,
      name: 'Summer Jazz Camp',
      short: 'Camp',
      inSchool: false,
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
      inSchool: true,
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

  it('is for Admin, Director and Office manager only (decision 0001, "Programs")', () => {
    for (const role of ['admin', 'director', 'office-manager'] as Role[]) {
      const c = core(as(role));
      c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
      c.actions.updateProgram('in-school', { short: 'Schools' });
      c.actions.archiveProgram('jazz-legacy');
      c.actions.restoreProgram('jazz-legacy');
      expect(c.refused, role).toEqual([]);
    }
    for (const role of ['bookkeeper', 'teacher', 'assistant', 'read-only'] as Role[]) {
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

describe('an in-school program', () => {
  it('is the seeded In-School Program, and nothing else, in the demo and a new office', () => {
    for (const start of [makeCoreSeed(), makeCoreEmpty()]) {
      const state = { core: start } as unknown as PortalState;
      expect(inSchoolProgramIds(state)).toEqual(['in-school']);
      expect(isInSchool(state, 'in-school')).toBe(true);
      expect(isInSchool(state, 'homeschool')).toBe(false);
      expect(isInSchool(state, 'general-operating')).toBe(false);
      expect(isInSchool(state, 'p-nowhere')).toBe(false);
    }
  });

  it('is marked when it is added or edited, and not unless it is', () => {
    const c = core();
    const camp = c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
    const schools = c.actions.addProgram({ name: 'School Residencies', short: '', inSchool: true });
    expect(isInSchool(c.state(), camp)).toBe(false);
    expect(inSchoolProgramIds(c.state())).toEqual(['in-school', schools]);

    c.actions.updateProgram(camp, { inSchool: true });
    c.actions.updateProgram('in-school', { inSchool: false });
    expect(inSchoolProgramIds(c.state())).toEqual([camp, schools]);
    // A rename leaves the flag as it was.
    c.actions.updateProgram(camp, { name: 'Summer Camp' });
    expect(isInSchool(c.state(), camp)).toBe(true);
  });

  it('stays in-school once archived, so the hours logged on it still count', () => {
    const c = core();
    c.actions.archiveProgram('in-school');
    expect(inSchoolProgramIds(c.state())).toEqual(['in-school']);
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
      inSchool: false,
    });
    expect(loaded.programs[7]).not.toHaveProperty('archivedAt');
    expect(loaded.programs[8]).toMatchObject({ archivedAt: '2026-09-01', archivedById: 's-gwen' });
  });

  it('marks a saved in-school program in-school, so the demo reads as it did', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    for (const p of saved.programs) delete p.inSchool;
    saved.programs.push({ id: 'p-camp', name: 'Summer Jazz Camp', short: 'Camp' });
    const loaded = coreSlice.normalise!(saved, false)!;
    expect(loaded.programs.slice(0, 6)).toEqual(makeCoreSeed().programs);
    expect(loaded.programs.filter(p => p.inSchool).map(p => p.id)).toEqual(['in-school']);
  });

  it('keeps a saved flag as it was, on the seeded In-School Program too', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    saved.programs.find((p: { id: string }) => p.id === 'in-school').inSchool = false;
    saved.programs.push({ id: 'p-camp', name: 'Summer Jazz Camp', short: 'Camp', inSchool: true });
    saved.programs.push({ id: 'p-odd', name: 'Odd', short: 'Odd', inSchool: 'yes' });
    const loaded = coreSlice.normalise!(saved, false)!;
    expect(loaded.programs.filter(p => p.inSchool).map(p => p.id)).toEqual(['p-camp']);
  });
});
