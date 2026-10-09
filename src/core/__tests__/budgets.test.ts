import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import {
  fiscalYearChoices,
  fiscalYearNamed,
  fiscalYearsOverlapping,
  fundingSummary,
  programBudget,
  projectOverlaps,
  projectsForProgram,
  projectsInFiscalYear,
  sameTarget,
  targetBudget,
  targetKey,
  targetName,
} from '../derive';
import { makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice, describeCoreChange, guardActions } from '../store';
import type { CoreState, PortalState, ProjectInput, Role, SignedInUser } from '../types';

const TODAY = '2026-10-07';
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });
const stateOf = (core: CoreState) => ({ core }) as unknown as PortalState;

/** The core slice behind its real rules, for one signed-in person. */
function core(user: SignedInUser = as('office-manager', 's-keisha'), start = makeCoreSeed()) {
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

const SHOWCASE: ProjectInput = {
  name: '  Fall Recital ',
  programId: 'studio-sessions',
  start: '2026-11-01',
  end: '2026-11-30',
  budget: 2500,
};

describe('fiscal years by name', () => {
  it('turns a name back into its dates', () => {
    expect(fiscalYearNamed('FY27', 7)).toEqual({
      label: 'FY27',
      start: '2026-07-01',
      end: '2027-06-30',
    });
    expect(fiscalYearNamed('FY27', 1)).toEqual({
      label: 'FY27',
      start: '2027-01-01',
      end: '2027-12-31',
    });
    expect(fiscalYearNamed('2027', 7)).toBeUndefined();
  });

  it('lists every fiscal year a span touches', () => {
    expect(fiscalYearsOverlapping('2027-06-21', '2027-07-30', 7).map(fy => fy.label)).toEqual([
      'FY27',
      'FY28',
    ]);
    expect(fiscalYearsOverlapping('2026-09-01', '2026-12-15', 7).map(fy => fy.label)).toEqual([
      'FY27',
    ]);
    expect(fiscalYearsOverlapping('2027-01-01', '2026-01-01', 7)).toEqual([]);
  });

  it('offers this year, the next, and every year with a budget or a project', () => {
    const state = stateOf(makeCoreSeed());
    expect(fiscalYearChoices(state, '2026-09-13').map(fy => fy.label)).toEqual(['FY27', 'FY28']);
    state.core.programBudgets.push({ programId: 'in-school', fiscalYear: 'FY25', amount: 1 });
    expect(fiscalYearChoices(state, '2026-09-13').map(fy => fy.label)).toEqual([
      'FY25',
      'FY27',
      'FY28',
    ]);
  });
});

describe('a program budget for each fiscal year', () => {
  it('reads the demo budgets for FY27, and none for a year nobody set', () => {
    const state = stateOf(makeCoreSeed());
    expect(programBudget(state, 'studio-sessions', 'FY27')).toBe(18000);
    expect(programBudget(state, 'studio-sessions', 'FY28')).toBeUndefined();
  });

  it('sets a year, and setting it again replaces it', () => {
    const c = core();
    c.actions.setProgramBudget('in-school', 'FY28', 16000);
    c.actions.setProgramBudget('in-school', 'FY28', 17500);
    expect(programBudget(c.state(), 'in-school', 'FY28')).toBe(17500);
    expect(programBudget(c.state(), 'in-school', 'FY27')).toBe(15000);
    expect(c.state().core.programBudgets.filter(b => b.programId === 'in-school')).toHaveLength(2);
    expect(describeCoreChange(c.sent[0])).toBe('the program budget');
  });

  it('refuses part dollars, a negative budget, a year that is not one and a missing program', () => {
    const c = core();
    c.actions.setProgramBudget('in-school', 'FY28', 100.5);
    c.actions.setProgramBudget('in-school', 'FY28', -1);
    c.actions.setProgramBudget('in-school', '2028', 100);
    c.actions.setProgramBudget('p-gone', 'FY28', 100);
    expect(c.refused).toEqual([
      'Enter the budget in whole dollars, 0 or more.',
      'Enter the budget in whole dollars, 0 or more.',
      'Pick a fiscal year for the budget.',
      'That program is no longer in the portal.',
    ]);
    expect(c.sent).toEqual([]);
  });

  it('follows "Program budgets and projects": the bookkeeper edits, the assistant and a teacher may not', () => {
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const c = core(as(role));
      c.actions.setProgramBudget('homeschool', 'FY28', 7000);
      expect(c.refused).toEqual([]);
    }
    for (const role of ['assistant', 'teacher', 'read-only'] as Role[]) {
      const c = core(as(role));
      c.actions.setProgramBudget('homeschool', 'FY28', 7000);
      expect(c.sent).toEqual([]);
      expect(c.refused).toHaveLength(1);
    }
  });
});

describe('projects', () => {
  it('adds a project under a program, tidied, with a generated id', () => {
    const c = core();
    const id = c.actions.addProject(SHOWCASE);
    expect(id).toMatch(/^prj-[0-9a-z]{10}$/);
    expect(c.state().core.projects.at(-1)).toEqual({ ...SHOWCASE, id, name: 'Fall Recital' });
    expect(describeCoreChange(c.sent[0])).toBe('the project');
  });

  it('says why a project cannot be saved', () => {
    const c = core();
    c.actions.addProject({ ...SHOWCASE, name: ' ' });
    c.actions.addProject({ ...SHOWCASE, programId: 'p-gone' });
    c.actions.addProject({ ...SHOWCASE, end: '' });
    c.actions.addProject({ ...SHOWCASE, end: '2026-10-01' });
    c.actions.addProject({ ...SHOWCASE, budget: 12.5 });
    c.actions.updateProject('prj-gone', { name: 'Anything' });
    expect(c.refused).toEqual([
      'Give the project a name.',
      'Pick the program it is part of.',
      'Give the project a start and an end date.',
      'The project ends before it starts.',
      'Enter the budget in whole dollars, 0 or more.',
      'That project is no longer in the portal.',
    ]);
    expect(c.sent).toEqual([]);
  });

  it('edits a project, checking the whole project as it would be', () => {
    const c = core();
    c.actions.updateProject('prj-showcase', { budget: 9500, name: ' Spring Showcase ' });
    expect(c.state().core.projects.find(p => p.id === 'prj-showcase')).toMatchObject({
      name: 'Spring Showcase',
      budget: 9500,
      start: '2027-03-01',
    });
    c.actions.updateProject('prj-showcase', { end: '2027-02-01' });
    expect(c.refused).toEqual(['The project ends before it starts.']);
  });

  it('archives and restores a project; it leaves the lists and stays findable', () => {
    const c = core();
    c.actions.archiveProject('prj-showcase');
    const archived = c.state().core.projects.find(p => p.id === 'prj-showcase');
    expect(archived).toMatchObject({ archivedAt: TODAY, archivedById: 's-keisha' });
    expect(projectsForProgram(c.state(), 'studio-sessions').map(p => p.id)).toEqual([
      'prj-instruments',
    ]);
    expect(projectsForProgram(c.state(), 'studio-sessions', true).map(p => p.id)).toEqual([
      'prj-instruments',
      'prj-showcase',
    ]);
    expect(describeCoreChange(c.sent[0])).toBe('the archive change');
    c.actions.restoreProject('prj-showcase');
    expect(projectsForProgram(c.state(), 'studio-sessions')).toHaveLength(2);
  });

  it('lets only the roles that edit program budgets change projects', () => {
    const c = core(as('assistant'));
    c.actions.addProject(SHOWCASE);
    c.actions.archiveProject('prj-showcase');
    expect(c.sent).toEqual([]);
    expect(c.refused).toEqual([
      "You can't do that as an Office assistant.",
      "You can't do that as an Office assistant.",
    ]);
  });

  it('counts a project in every fiscal year its dates overlap', () => {
    const state = stateOf(makeCoreSeed());
    const fy27 = fiscalYearNamed('FY27', 7)!;
    const fy28 = fiscalYearNamed('FY28', 7)!;
    const intensive = state.core.projects.find(p => p.id === 'prj-intensive')!;
    expect(projectOverlaps(intensive, fy27)).toBe(true);
    expect(projectOverlaps(intensive, fy28)).toBe(true);
    expect(projectsInFiscalYear(state, fy27).map(p => p.id)).toEqual([
      'prj-instruments',
      'prj-showcase',
      'prj-intensive',
    ]);
    expect(projectsInFiscalYear(state, fy28).map(p => p.id)).toEqual(['prj-intensive']);
  });
});

describe('a program year or a project as a funding target', () => {
  const state = stateOf(makeCoreSeed());
  const program = { kind: 'program', programId: 'in-school', fiscalYear: 'FY27' } as const;
  const project = { kind: 'project', projectId: 'prj-showcase' } as const;

  it('reads its budget and its name', () => {
    expect(targetBudget(state, program)).toBe(15000);
    expect(targetBudget(state, { ...program, fiscalYear: 'FY28' })).toBe(0);
    expect(targetBudget(state, project)).toBe(9000);
    expect(targetName(state, program)).toBe('In-School Program, FY27');
    expect(targetName(state, project)).toBe('Spring Showcase 2027');
  });

  it('tells targets apart, the fiscal year included', () => {
    expect(sameTarget(program, { ...program })).toBe(true);
    expect(sameTarget(program, { ...program, fiscalYear: 'FY28' })).toBe(false);
    expect(sameTarget(project, { kind: 'project', projectId: 'prj-showcase' })).toBe(true);
    expect(targetKey(program)).toBe('program:in-school:FY27');
    expect(targetKey(project)).toBe('project:prj-showcase');
  });

  it('adds up the sheet: awarded, if awarded, still to find, over budget', () => {
    expect(
      fundingSummary(15000, [
        { amount: 6000, ifAwarded: false },
        { amount: 4000, ifAwarded: true },
      ]),
    ).toEqual({
      budget: 15000,
      awarded: 6000,
      ifAwarded: 4000,
      funded: 10000,
      stillToFind: 5000,
      overBudget: 0,
    });
    expect(fundingSummary(1000, [{ amount: 1500, ifAwarded: false }])).toMatchObject({
      stillToFind: 0,
      overBudget: 500,
    });
  });
});

describe('loading and starting', () => {
  it('loads a save from before budgets and projects with none, demo or not', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    delete saved.programBudgets;
    delete saved.projects;
    for (const demo of [false, true]) {
      const loaded = coreSlice.normalise!(saved, demo)!;
      expect(loaded.programBudgets).toEqual([]);
      expect(loaded.projects).toEqual([]);
      expect(loaded.programs).toEqual(makeCoreSeed().programs);
    }
  });

  it('loads saved budgets and projects as they are, dropping a row that is not a budget', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    saved.programBudgets.push({ programId: 'in-school' });
    const loaded = coreSlice.normalise!(saved)!;
    expect(loaded.programBudgets).toEqual(makeCoreSeed().programBudgets);
    expect(loaded.projects).toEqual(makeCoreSeed().projects);
  });

  it('starts a new office with no budgets and no projects', () => {
    expect(makeCoreEmpty().programBudgets).toEqual([]);
    expect(makeCoreEmpty().projects).toEqual([]);
  });
});
