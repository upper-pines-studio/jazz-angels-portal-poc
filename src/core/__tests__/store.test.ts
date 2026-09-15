import { describe, expect, it, vi } from 'vitest';
import type { ModuleSlice } from '../module';
import * as repository from '../repository';
import type { PortalSlice } from '../repository';
import { coreSlice, makeReducer, newId } from '../store';
import type { PortalState } from '../types';

/**
 * Composition is tested with two invented slices, so the test says nothing
 * about grants, teaching or timesheets.
 */

interface CountState { count: number }
interface NoteState { notes: string[] }

const counter: ModuleSlice<CountState, { bump(): void }> = {
  id: 'counter',
  seed: () => ({ count: 0 }),
  reducer: (state, action) =>
    action.type === 'counter/bump' ? { count: state.count + 1 } : state,
  createActions: (dispatch) => ({ bump: () => dispatch({ type: 'counter/bump' }) }),
  normalise: (raw) =>
    raw && typeof (raw as CountState).count === 'number' ? (raw as CountState) : undefined,
};

const notes: ModuleSlice<NoteState, { add(text: string): void }> = {
  id: 'notes',
  seed: () => ({ notes: [] }),
  reducer: (state, action) =>
    action.type === 'notes/add' ? { notes: [...state.notes, String(action.text)] } : state,
  createActions: (dispatch) => ({ add: (text) => dispatch({ type: 'notes/add', text }) }),
};

const SLICES = [counter, notes] as unknown as PortalSlice[];
type TestState = { counter: CountState; notes: NoteState };
const asTest = (state: PortalState) => state as unknown as TestState;

describe('newId', () => {
  it('prefixes and never repeats', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId('g')));
    expect(ids.size).toBe(200);
    expect([...ids].every((id) => id.startsWith('g-'))).toBe(true);
  });
});

describe('composing slices', () => {
  const seeded = () => repository.loadState(SLICES, '2026-09-13');

  it('builds one key per slice from the seeds', () => {
    expect(asTest(seeded())).toEqual({ counter: { count: 0 }, notes: { notes: [] } });
  });

  it('routes an action to the slice named in its type', () => {
    const reducer = makeReducer(SLICES);
    const start = seeded();
    const next = reducer(start, { type: 'counter/bump' });

    expect(asTest(next).counter.count).toBe(1);
    // The slice that was not addressed keeps its identity, so nothing re-renders.
    expect(asTest(next).notes).toBe(asTest(start).notes);
  });

  it('leaves the state alone for an action no slice owns', () => {
    const reducer = makeReducer(SLICES);
    const start = seeded();
    expect(reducer(start, { type: 'teaching/roll' })).toBe(start);
  });

  it('replaces everything on portal/replace', () => {
    const reducer = makeReducer(SLICES);
    const replacement = { counter: { count: 9 }, notes: { notes: ['hi'] } };
    const next = reducer(seeded(), { type: 'portal/replace', state: replacement });
    expect(asTest(next)).toEqual(replacement);
  });

  it('gives each slice actions that dispatch in its own namespace', () => {
    const dispatch = vi.fn();
    const ctx = { today: '2026-09-13', newId };
    counter.createActions(dispatch, () => seeded(), ctx).bump();
    notes.createActions(dispatch, () => seeded(), ctx).add('chart');

    expect(dispatch.mock.calls.map((c) => c[0].type)).toEqual(['counter/bump', 'notes/add']);
  });
});

describe('the core slice', () => {
  const seed = () => coreSlice.seed('2026-09-13');

  it('seeds the five staff, the six programs and all three modules', () => {
    const state = seed();
    expect(state.staff).toHaveLength(5);
    expect(state.staff.filter((s) => s.teaches).map((s) => s.name)).toEqual([
      'Barry Cogert',
      'Albert Alva',
      'Devon Price',
      'Renee Cole',
    ]);
    expect(state.programs.every((p) => p.short.length > 0)).toBe(true);
    expect(state.settings).toEqual({
      fiscalYearStartMonth: 7,
      enabledModules: ['grants', 'teaching', 'timesheets'],
    });
  });

  it('adds and patches a person', () => {
    const dispatched: Array<{ type: string; [k: string]: unknown }> = [];
    const actions = coreSlice.createActions(
      (a) => dispatched.push(a),
      () => ({ core: seed() }) as PortalState,
      { today: '2026-09-13', newId },
    );
    const id = actions.addStaff({ name: 'Dana Whitfield', role: 'Teaching Artist', teaches: true });
    expect(id.startsWith('s-')).toBe(true);

    let state = seed();
    for (const action of dispatched) state = coreSlice.reducer(state, action);
    expect(state.staff.at(-1)).toMatchObject({ name: 'Dana Whitfield', teaches: true });

    state = coreSlice.reducer(state, { type: 'core/update-staff', id: 's-denise', patch: { teaches: true } });
    expect(state.staff.find((s) => s.id === 's-denise')?.teaches).toBe(true);
  });

  it('turns a module off and on again', () => {
    const dispatched: Array<{ type: string; [k: string]: unknown }> = [];
    let state = seed();
    const actions = coreSlice.createActions(
      (a) => {
        dispatched.push(a);
        state = coreSlice.reducer(state, a);
      },
      () => ({ core: state }) as PortalState,
      { today: '2026-09-13', newId },
    );

    actions.setModuleEnabled('teaching', false);
    expect(state.settings.enabledModules).toEqual(['grants', 'timesheets']);
    actions.setModuleEnabled('teaching', true);
    expect(state.settings.enabledModules).toEqual(['grants', 'timesheets', 'teaching']);
  });

  it('fills teaches, short and enabledModules in from an older payload', () => {
    const filled = coreSlice.normalise?.({
      staff: [{ id: 's-1', name: 'Barry Cogert', role: 'Program Director' }],
      programs: [{ id: 'in-school', name: 'In-School Program' }],
      settings: { fiscalYearStartMonth: 7 },
    });
    expect(filled?.staff[0].teaches).toBe(false);
    expect(filled?.programs[0].short).toBe('In-School Program');
    expect(filled?.settings.enabledModules).toEqual(['grants', 'teaching', 'timesheets']);
  });
});
