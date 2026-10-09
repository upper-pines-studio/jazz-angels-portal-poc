import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import {
  OPERATIONS_ID,
  isOperations,
  operations,
  programName,
  programOptions,
  programProblem,
  programsList,
} from '../derive';
import { makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice, guardActions } from '../store';
import type { CoreState, PortalState, Role, SignedInUser } from '../types';

// Operations: the office's running costs and unrestricted money, apart from
// the programs (decision 0006). It keeps General operating's id, so saved data
// that names it loads unchanged.

const TODAY = '2026-10-07';
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });
const stateOf = (core: CoreState) => ({ core }) as unknown as PortalState;

/** The core slice behind its real rules, for one signed-in person. */
function core(user: SignedInUser = as('admin', 's-gwen'), start: CoreState = makeCoreSeed()) {
  let state = stateOf(start);
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

const OPERATIONS = { id: 'general-operating', name: 'Operations', short: 'Operations' };

describe('Operations', () => {
  it('keeps the id General operating had', () => {
    expect(OPERATIONS_ID).toBe('general-operating');
    expect(isOperations('general-operating')).toBe(true);
    expect(isOperations('in-school')).toBe(false);
  });

  it('is there in the demo and in a new office, named Operations', () => {
    for (const start of [makeCoreSeed(), makeCoreEmpty()]) {
      const state = stateOf(start);
      expect(operations(state)).toEqual(OPERATIONS);
      expect(programName(state, OPERATIONS_ID)).toBe('Operations');
    }
  });

  it('is not one of the programs on the Programs list', () => {
    const state = stateOf(makeCoreSeed());
    expect(programsList(state).map(p => p.id)).toEqual([
      'studio-sessions',
      'in-school',
      'homeschool',
      'jazz-legacy',
      'advanced-workshop',
    ]);
    expect(programsList(state, true).map(p => p.id)).not.toContain(OPERATIONS_ID);
  });

  it('comes last in every picker, after a program added since', () => {
    const c = core();
    c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
    const options = programOptions(c.state());
    expect(options.at(-1)).toEqual(OPERATIONS);
    expect(options.at(-2)!.name).toBe('Summer Jazz Camp');
    // An archived program a record already names stays before it.
    c.actions.archiveProgram('jazz-legacy');
    expect(programOptions(c.state(), 'jazz-legacy').at(-1)!.id).toBe(OPERATIONS_ID);
    expect(programOptions(c.state(), ['jazz-legacy']).map(p => p.id)).toContain('jazz-legacy');
  });
});

describe('the rules on Operations', () => {
  it('refuses archiving it, saying why', () => {
    const c = core();
    c.actions.archiveProgram(OPERATIONS_ID);
    expect(c.sent).toEqual([]);
    expect(c.refused).toEqual([
      "Operations can't be archived. It is the office's running costs, not a program.",
    ]);
  });

  it('refuses renaming it, the name or the short name', () => {
    const c = core();
    c.actions.updateProgram(OPERATIONS_ID, { name: 'General operating' });
    c.actions.updateProgram(OPERATIONS_ID, { short: 'Ops' });
    expect(c.sent).toEqual([]);
    expect(c.refused).toEqual(["Operations can't be renamed.", "Operations can't be renamed."]);
    expect(operations(c.state())).toEqual(OPERATIONS);
  });

  it('refuses a second Operations, added or renamed into', () => {
    const c = core();
    expect(c.actions.addProgram({ name: ' operations ', short: '' })).toBeUndefined();
    c.actions.updateProgram('in-school', { name: 'Operations' });
    const why = "Operations is already the office's running costs. Give the program another name.";
    expect(c.refused).toEqual([why, why]);
    expect(c.sent).toEqual([]);
    expect(programProblem(c.state().core.programs, { name: 'OPERATIONS' })).toBe(why);
  });

  it('leaves the "Programs" row of decision 0001 as it was', () => {
    for (const role of ['office-manager', 'bookkeeper', 'teacher', 'assistant'] as Role[]) {
      const c = core(as(role));
      c.actions.archiveProgram(OPERATIONS_ID);
      c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
      expect(c.sent, role).toEqual([]);
      expect(c.refused[1], role).toMatch(/^You can't do that as/);
    }
    for (const role of ['admin', 'director'] as Role[]) {
      const c = core(as(role));
      c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
      c.actions.archiveProgram('jazz-legacy');
      expect(c.refused, role).toEqual([]);
    }
  });
});

describe('loading a saved office', () => {
  const saved = (programs: unknown[]) => ({
    ...JSON.parse(JSON.stringify(makeCoreSeed())),
    programs,
  });

  it('renames a saved General operating to Operations and changes nothing else', () => {
    const before = JSON.parse(JSON.stringify(makeCoreSeed()));
    before.programs = before.programs.map((p: { id: string }) =>
      p.id === OPERATIONS_ID
        ? { id: OPERATIONS_ID, name: 'General operating', short: 'Operating' }
        : p,
    );
    const loaded = coreSlice.normalise!(before, false)!;
    expect(loaded.programs).toEqual(makeCoreSeed().programs);
    expect(loaded.programBudgets).toEqual(before.programBudgets);
    expect(loaded.projects).toEqual(before.projects);
  });

  it('gives a saved office without it an Operations, after its programs', () => {
    const loaded = coreSlice.normalise!(
      saved([{ id: 'p-camp', name: 'Summer Jazz Camp', short: 'Camp' }]),
      false,
    )!;
    expect(loaded.programs).toEqual([
      { id: 'p-camp', name: 'Summer Jazz Camp', short: 'Camp' },
      OPERATIONS,
    ]);
    expect(coreSlice.normalise!(saved([]), true)!.programs).toEqual([OPERATIONS]);
  });

  it('brings back an Operations that was archived or renamed before it could not be', () => {
    const loaded = coreSlice.normalise!(
      saved([
        {
          id: OPERATIONS_ID,
          name: 'Unrestricted',
          short: 'Unr.',
          archivedAt: '2026-09-01',
          archivedById: 's-gwen',
        },
      ]),
      false,
    )!;
    expect(loaded.programs).toEqual([OPERATIONS]);
  });
});
