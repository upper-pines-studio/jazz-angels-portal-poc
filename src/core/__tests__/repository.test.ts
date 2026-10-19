import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleSlice } from '../module';
import {
  clear,
  exportJson,
  readImport,
  loadPreference,
  loadState,
  freshState,
  FAIL_SAVES_KEY,
  localRepository,
  savePreference,
  saveSlice,
  saveState,
  storageKey,
  UnreadableDataError,
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
  empty: () => ({ notes: [] }),
  reducer: state => state,
  createActions: () => ({}),
  rules: {},
  tables: {
    keys: { notes: ['id'] },
    toRows: s => ({ notes: s.notes.map((text, i) => ({ id: i + 1, text })) }),
    fromRows: t => ({ notes: (t.notes ?? []).map(r => String(r.text)) }),
  },
  normalise: raw => (Array.isArray((raw as NoteState)?.notes) ? (raw as NoteState) : undefined),
};

const SLICES = [coreSlice, notes] as unknown as PortalSlice[];
const TODAY = '2026-09-13';
/** The demo switch, as `isDemo()` gives it in `npm run dev`. The last block turns it off. */
const DEMO = true;
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
    const state = loadState(SLICES, TODAY, DEMO);
    expect(state.core.staff).toHaveLength(10);
    expect(bag(state).notes).toEqual({ notes: ['first'] });
  });

  it('writes only the slice it is given', () => {
    const { data } = installStorage();
    saveSlice('notes', { notes: ['chart'] });
    expect([...data.keys()]).toEqual(['ja-portal:notes:v1']);
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['chart'] });
    // Core was never written, so it comes back seeded.
    expect(loadState(SLICES, TODAY, DEMO).core.staff).toHaveLength(10);
  });

  it('falls back to the seed on unreadable or malformed data, and writes nothing', () => {
    const { ls } = installStorage();
    ls.setItem(storageKey('notes'), '{{{');
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['first'] });
    ls.setItem(storageKey('notes'), JSON.stringify({ notes: 'nope' }));
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['first'] });
    expect(ls.getItem(storageKey('notes'))).toBe(JSON.stringify({ notes: 'nope' }));
  });

  it('works with no localStorage at all', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => saveState(SLICES, loadState(SLICES, TODAY, DEMO))).not.toThrow();
    expect(loadState(SLICES, TODAY, DEMO).core.staff).toHaveLength(10);
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
    freshState(SLICES, TODAY, DEMO);
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
    const state = loadState(SLICES, TODAY, DEMO);
    const parsed = JSON.parse(exportJson(SLICES, state));
    expect(parsed.version).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
    expect(Object.keys(parsed.slices)).toEqual(['core', 'notes']);
    expect(readImport(SLICES, exportJson(SLICES, state), TODAY, DEMO)).toEqual(state);
  });

  it('seeds a slice the file does not carry', () => {
    const older = JSON.stringify({
      version: 1,
      savedAt: '2026-09-01T00:00:00.000Z',
      slices: { core: coreSlice.seed(TODAY) },
    });
    const state = readImport(SLICES, older, TODAY, DEMO);
    expect(bag(state).notes).toEqual({ notes: ['first'] });
    expect(state.core.staff).toHaveLength(10);
  });

  // Since #19 the store applies an import like any change, so reading one writes nothing.
  it('reads what the file holds and leaves storage alone', () => {
    const state = loadState(SLICES, TODAY, DEMO);
    bag(state).notes = { notes: ['imported'] };
    const read = readImport(SLICES, exportJson(SLICES, state), TODAY, DEMO);
    expect(bag(read).notes).toEqual({ notes: ['imported'] });
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['first'] });
  });

  it('refuses the whole file when a slice it carries cannot be read', () => {
    const { data } = installStorage();
    saveSlice('notes', { notes: ['kept'] });
    const before = new Map(data);
    const file = JSON.stringify({
      version: 1,
      savedAt: '2026-09-01T00:00:00.000Z',
      slices: { core: coreSlice.seed(TODAY), notes: { notes: 'an older shape' } },
    });
    expect(() => readImport(SLICES, file, TODAY, DEMO)).toThrow(
      'The notes data in that file could not be read, so nothing was imported.',
    );
    expect(data).toEqual(before);
  });

  it('throws on garbage', () => {
    expect(() => readImport(SLICES, 'not json at all', TODAY, DEMO)).toThrow(/valid JSON/);
    expect(() => readImport(SLICES, '"a string"', TODAY, DEMO)).toThrow();
    expect(() => readImport(SLICES, '{"hello":"world"}', TODAY, DEMO)).toThrow(
      /Jazz Angels export/,
    );
    expect(() => readImport(SLICES, '{"version":1,"slices":{"other":{}}}', TODAY, DEMO)).toThrow(
      /missing portal data/,
    );
  });
});

describe('reset', () => {
  // Since #19 the store applies the fresh state, one slice at a time, so this writes nothing.
  it('starts every slice again from the seed', () => {
    saveSlice('notes', { notes: ['edited'] });
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['edited'] });
    expect(bag(freshState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['first'] });
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['edited'] });
  });
});

describe('the localStorage repository', () => {
  it('loads one slice per call, as stored', async () => {
    saveSlice('notes', { notes: ['stored'] });
    expect(await localRepository.load(notes as unknown as PortalSlice, TODAY, DEMO)).toEqual({
      notes: ['stored'],
    });
    const core = (await localRepository.load(SLICES[0], TODAY, DEMO)) as PortalState['core'];
    expect(core.staff).toHaveLength(10);
  });

  it('keeps a slice that started fresh, so it loads the same next time', async () => {
    const { data } = installStorage();
    await localRepository.load(notes as unknown as PortalSlice, TODAY, DEMO);
    expect(JSON.parse(data.get(storageKey('notes'))!)).toEqual({ notes: ['first'] });
  });

  it('starts a missing slice fresh and saves it, writing no backup', async () => {
    const { data } = installStorage();
    expect(await localRepository.load(notes as unknown as PortalSlice, TODAY, DEMO)).toEqual({
      notes: ['first'],
    });
    expect([...data.keys()]).toEqual([storageKey('notes')]);
  });

  it.each([
    ['is not JSON', '{{{'],
    ['its normalise rejects', JSON.stringify({ notes: 'an older shape' })],
  ])('keeps saved data that %s, backs it up and rejects', async (_, raw) => {
    const { data } = installStorage();
    data.set(storageKey('notes'), raw);
    const load = localRepository.load(notes as unknown as PortalSlice, TODAY, DEMO);
    await expect(load).rejects.toThrow(UnreadableDataError);
    await expect(load).rejects.toThrow(/The notes data saved in this browser could not be read/);
    await expect(load).rejects.toThrow(/kept as it was/);
    // The original key is untouched, and a backup holds the same string.
    expect(data.get(storageKey('notes'))).toBe(raw);
    const backups = [...data.keys()].filter(k => k.startsWith('ja-portal:notes:unreadable-'));
    expect(backups).toHaveLength(1);
    expect(data.get(backups[0])).toBe(raw);
    expect(backups[0]).toMatch(/^ja-portal:notes:unreadable-\d{4}-\d{2}-\d{2}T/);
  });

  it('still rejects, and still keeps the data, when the backup cannot be written', async () => {
    const { data, ls } = installStorage();
    data.set(storageKey('notes'), '{{{');
    ls.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    await expect(
      localRepository.load(notes as unknown as PortalSlice, TODAY, DEMO),
    ).rejects.toMatchObject({ sliceId: 'notes', backupKey: undefined });
    expect([...data.entries()]).toEqual([[storageKey('notes'), '{{{']]);
  });

  it('applies a change by writing the slice it is given, and only that one', async () => {
    const { data } = installStorage();
    await localRepository.apply('notes', { type: 'notes/add' }, { notes: ['applied'] });
    expect([...data.keys()]).toEqual([storageKey('notes')]);
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['applied'] });
  });

  it('rejects when the browser will not store it', async () => {
    const { ls } = installStorage();
    ls.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    await expect(
      localRepository.apply('notes', { type: 'notes/add' }, { notes: ['x'] }),
    ).rejects.toThrow(/no room left/);
    delete (globalThis as { localStorage?: Storage }).localStorage;
    await expect(
      localRepository.apply('notes', { type: 'notes/add' }, { notes: ['x'] }),
    ).rejects.toThrow(/not letting the portal save/);
  });

  it('fails every save on purpose while the development switch is set', async () => {
    savePreference(FAIL_SAVES_KEY, '1');
    await expect(
      localRepository.apply('notes', { type: 'notes/add' }, { notes: ['x'] }),
    ).rejects.toThrow(/switched off/);
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['first'] });
    savePreference(FAIL_SAVES_KEY, '0');
    await localRepository.apply('notes', { type: 'notes/add' }, { notes: ['x'] });
    expect(bag(loadState(SLICES, TODAY, DEMO)).notes).toEqual({ notes: ['x'] });
  });
});

describe('with the demo off', () => {
  const OFF = false;

  it('starts every slice empty when nothing is stored', () => {
    const state = loadState(SLICES, TODAY, OFF);
    expect(bag(state).notes).toEqual({ notes: [] });
    expect(state.core.organizations).toEqual([]);
    expect(state.core.venues).toEqual([]);
    // Programs come pre-loaded, and the people the seven logins belong to.
    expect(state.core.programs).toHaveLength(6);
    expect(state.core.staff.map(s => s.id).sort()).toEqual(
      ['s-barry', 's-devon', 's-gwen', 's-keisha', 's-margaret', 's-tess', 's-walt'].sort(),
    );
  });

  it('gives the seed with the demo on, for the same empty storage', () => {
    const state = loadState(SLICES, TODAY, true);
    expect(bag(state).notes).toEqual({ notes: ['first'] });
    expect(state.core.staff).toHaveLength(10);
  });

  it('starts an unreadable slice empty, not from the demo', () => {
    const { ls } = installStorage();
    ls.setItem(storageKey('notes'), '{{{');
    expect(bag(loadState(SLICES, TODAY, OFF)).notes).toEqual({ notes: [] });
  });

  it('does not write empty data over a saved slice it cannot read', async () => {
    const { data } = installStorage();
    const older = JSON.stringify({ items: ['a grant saved before notes existed'] });
    data.set(storageKey('notes'), older);
    await expect(localRepository.load(notes as unknown as PortalSlice, TODAY, OFF)).rejects.toThrow(
      /notes data/,
    );
    expect(data.get(storageKey('notes'))).toBe(older);
  });

  it('fills a slice the import does not carry with empty data', () => {
    const file = JSON.stringify({
      version: 1,
      savedAt: '2026-10-01T00:00:00.000Z',
      slices: { core: coreSlice.empty() },
    });
    const state = readImport(SLICES, file, TODAY, OFF);
    expect(bag(state).notes).toEqual({ notes: [] });
  });

  it('keeps only the login staff when a saved core lacks them, and no seeded places', () => {
    saveSlice('core', { staff: [], programs: [], settings: {} });
    const core = loadState(SLICES, TODAY, OFF).core;
    expect(core.staff).toHaveLength(7);
    expect(core.staff.some(s => s.id === 's-albert')).toBe(false);
    expect(core.venues).toEqual([]);
    expect(core.organizations).toEqual([]);
  });

  it('resets to empty', () => {
    saveSlice('notes', { notes: ['edited'] });
    expect(bag(freshState(SLICES, TODAY, OFF)).notes).toEqual({ notes: [] });
  });
});

describe('the demo date', () => {
  it('is never part of an export', () => {
    const text = exportJson(SLICES, loadState(SLICES, TODAY, DEMO));
    expect(text).not.toContain('demoToday');
  });

  it('is dropped from an older file on import', () => {
    const core = { ...coreSlice.seed(TODAY), settings: { fiscalYearStartMonth: 7 } };
    const older = JSON.stringify({
      version: 1,
      savedAt: '2026-09-01T00:00:00.000Z',
      slices: { core: { ...core, settings: { ...core.settings, demoToday: '2026-09-13' } } },
    });
    const state = readImport(SLICES, older, TODAY, DEMO);
    expect('demoToday' in state.core.settings).toBe(false);
  });
});
