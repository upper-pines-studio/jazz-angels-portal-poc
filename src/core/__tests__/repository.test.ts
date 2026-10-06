import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleSlice } from '../module';
import {
  clear,
  exportJson,
  importJson,
  loadPreference,
  loadState,
  reset,
  savePreference,
  saveSlice,
  saveState,
  storageKey,
} from '../repository';
import type { PortalSlice } from '../repository';
import { coreSlice } from '../store';
import type { PortalState } from '../types';

/** Minimal in-memory localStorage so the repository can be exercised in node. */
function installStorage() {
  const data = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: k => data.get(k) ?? null,
    key: i => Array.from(data.keys())[i] ?? null,
    removeItem: k => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  return { data, ls };
}

interface NoteState {
  notes: string[];
}

const notes: ModuleSlice<NoteState, Record<string, never>> = {
  id: 'notes',
  seed: () => ({ notes: ['first'] }),
  reducer: state => state,
  createActions: () => ({}),
  normalise: raw => (Array.isArray((raw as NoteState)?.notes) ? (raw as NoteState) : undefined),
};

const SLICES = [coreSlice, notes] as unknown as PortalSlice[];
const TODAY = '2026-09-13';
const bag = (state: PortalState) => state as unknown as Record<string, unknown>;

beforeEach(() => {
  installStorage();
  clear(SLICES);
});

describe('one key per slice', () => {
  it('names the keys after the slice and the version', () => {
    expect(storageKey('core')).toBe('ja-portal:core:v1');
    expect(storageKey('notes')).toBe('ja-portal:notes:v1');
  });

  it('seeds every slice when nothing is stored', () => {
    const state = loadState(SLICES, TODAY);
    expect(state.core.staff).toHaveLength(5);
    expect(bag(state).notes).toEqual({ notes: ['first'] });
  });

  it('writes only the slice it is given', () => {
    const { data } = installStorage();
    saveSlice('notes', { notes: ['chart'] });
    expect([...data.keys()]).toEqual(['ja-portal:notes:v1']);
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['chart'] });
    // Core was never written, so it comes back seeded.
    expect(loadState(SLICES, TODAY).core.staff).toHaveLength(5);
  });

  it('falls back to the seed on unreadable or malformed data', () => {
    const { ls } = installStorage();
    ls.setItem(storageKey('notes'), '{{{');
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['first'] });
    ls.setItem(storageKey('notes'), JSON.stringify({ notes: 'nope' }));
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['first'] });
  });

  it('works with no localStorage at all', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => saveState(SLICES, loadState(SLICES, TODAY))).not.toThrow();
    expect(loadState(SLICES, TODAY).core.staff).toHaveLength(5);
  });
});

describe('preferences', () => {
  it('reads back what was written, under the key it was given', () => {
    const { data } = installStorage();
    expect(loadPreference('ja-sidebar-collapsed')).toBeNull();
    savePreference('ja-sidebar-collapsed', '1');
    expect(data.get('ja-sidebar-collapsed')).toBe('1');
    expect(loadPreference('ja-sidebar-collapsed')).toBe('1');
  });

  it('survives a reset, which only touches the slices', () => {
    savePreference('ja-sidebar-collapsed', '1');
    reset(SLICES, TODAY);
    expect(loadPreference('ja-sidebar-collapsed')).toBe('1');
  });

  it('fails quietly with no localStorage at all', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => savePreference('ja-sidebar-collapsed', '1')).not.toThrow();
    expect(loadPreference('ja-sidebar-collapsed')).toBeNull();
  });
});

describe('export and import', () => {
  it('round-trips through the envelope', () => {
    const state = loadState(SLICES, TODAY);
    const parsed = JSON.parse(exportJson(SLICES, state));
    expect(parsed.version).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
    expect(Object.keys(parsed.slices)).toEqual(['core', 'notes']);
    expect(importJson(SLICES, exportJson(SLICES, state), TODAY)).toEqual(state);
  });

  it('seeds a slice the file does not carry', () => {
    const older = JSON.stringify({
      version: 1,
      savedAt: '2026-09-01T00:00:00.000Z',
      slices: { core: coreSlice.seed(TODAY) },
    });
    const state = importJson(SLICES, older, TODAY);
    expect(bag(state).notes).toEqual({ notes: ['first'] });
    expect(state.core.staff).toHaveLength(5);
  });

  it('saves what it imported', () => {
    const state = loadState(SLICES, TODAY);
    bag(state).notes = { notes: ['imported'] };
    importJson(SLICES, exportJson(SLICES, state), TODAY);
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['imported'] });
  });

  it('throws on garbage', () => {
    expect(() => importJson(SLICES, 'not json at all', TODAY)).toThrow(/valid JSON/);
    expect(() => importJson(SLICES, '"a string"', TODAY)).toThrow();
    expect(() => importJson(SLICES, '{"hello":"world"}', TODAY)).toThrow(/Jazz Angels export/);
    expect(() => importJson(SLICES, '{"version":1,"slices":{"other":{}}}', TODAY)).toThrow(
      /missing portal data/,
    );
  });
});

describe('reset', () => {
  it('reseeds and rewrites every slice', () => {
    saveSlice('notes', { notes: ['edited'] });
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['edited'] });
    expect(bag(reset(SLICES, TODAY)).notes).toEqual({ notes: ['first'] });
    expect(bag(loadState(SLICES, TODAY)).notes).toEqual({ notes: ['first'] });
  });
});
