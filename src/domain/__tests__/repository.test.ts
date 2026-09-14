import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  clear,
  exportJson,
  importJson,
  load,
  reset,
  save,
} from '../repository';
import { makeSeed } from '../seed';

/** Minimal in-memory localStorage so the repository can be exercised in node. */
function installStorage() {
  const data = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  return { data, ls };
}

describe('export / import round trip', () => {
  it('returns an identical state', () => {
    const state = makeSeed();
    const text = exportJson(state);
    expect(importJson(text)).toEqual(state);
  });

  it('writes readable, versioned JSON', () => {
    const parsed = JSON.parse(exportJson(makeSeed()));
    expect(parsed.version).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
    expect(parsed.state.grants).toHaveLength(10);
  });

  it('also accepts a bare AppState object', () => {
    const state = makeSeed();
    expect(importJson(JSON.stringify(state))).toEqual(state);
  });

  it('throws on garbage', () => {
    expect(() => importJson('not json at all')).toThrow(/valid JSON/);
    expect(() => importJson('"a string"')).toThrow();
    expect(() => importJson('{"hello":"world"}')).toThrow(/grant data/);
    expect(() => importJson(JSON.stringify({ version: 1, state: { grants: [] } }))).toThrow();
  });
});

describe('load / save', () => {
  beforeEach(() => {
    installStorage();
    clear();
  });

  it('seeds when nothing is stored', () => {
    const state = load();
    expect(state.grants).toHaveLength(10);
    expect(state.settings.fiscalYearStartMonth).toBe(7);
  });

  it('round-trips through storage', () => {
    const state = makeSeed();
    state.grants[0].title = 'Edited title';
    save(state);
    expect(load().grants[0].title).toBe('Edited title');
  });

  it('falls back to the seed when the payload has no version field', () => {
    const { ls } = installStorage();
    ls.setItem(STORAGE_KEY, JSON.stringify({ state: makeSeed() }));
    expect(load().grants[0].title).toBe('General operating support 2026');
  });

  it('falls back to the seed on unparseable or malformed data', () => {
    const { ls } = installStorage();
    ls.setItem(STORAGE_KEY, '{{{');
    expect(load().grants).toHaveLength(10);
    ls.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: { grants: 'nope' } }));
    expect(load().grants).toHaveLength(10);
  });

  it('reset clears the edit and reseeds', () => {
    const state = makeSeed();
    state.grants = [];
    save(state);
    expect(load().grants).toHaveLength(0);
    expect(reset().grants).toHaveLength(10);
    expect(load().grants).toHaveLength(10);
  });

  it('works with no localStorage at all', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => save(makeSeed())).not.toThrow();
    expect(load().grants).toHaveLength(10);
  });
});
