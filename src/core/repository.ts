import type { AnyAction, ModuleSlice } from './module';
import type { Repository } from './persistence';
import type { PortalState } from './types';

/**
 * The only module that talks to storage, and the first implementation of the
 * `Repository` interface in persistence.ts: `localRepository`, on localStorage.
 * Screens never touch localStorage; a backend replaces `localRepository` and
 * nothing above the store changes.
 *
 * One key per slice, so a module can be added without rewriting what is
 * already saved: `ja-portal:grants:v1`, `ja-portal:teaching:v1`, …
 */

/** A slice seen from the outside, where its state type is nobody's business. */
export type PortalSlice = ModuleSlice<unknown, unknown>;

export const STORAGE_PREFIX = 'ja-portal';

/** Bumped when a stored shape changes; it lives in the key, one per slice. */
export const STORAGE_VERSION = 1;

export function storageKey(sliceId: string): string {
  return `${STORAGE_PREFIX}:${sliceId}:v${STORAGE_VERSION}`;
}

export interface Envelope {
  version: number;
  savedAt: string;
  slices: Record<string, unknown>;
}

function storage(): Storage | undefined {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    // Touch it: Safari private mode throws on access rather than on read.
    if (!ls || typeof ls.getItem !== 'function') return undefined;
    return ls;
  } catch {
    return undefined;
  }
}

/** Run a slice's own validation, or accept any object when it has none. */
function accept(slice: PortalSlice, raw: unknown, demo: boolean): unknown | undefined {
  if (slice.normalise) return slice.normalise(raw, demo);
  return raw && typeof raw === 'object' ? raw : undefined;
}

/**
 * Where a slice starts when nothing is stored: the demo data in a demo build,
 * empty otherwise (decision 0004). `demo` comes from `isDemo()` in demo.ts.
 */
export function fresh(slice: PortalSlice, today: string, demo: boolean): unknown {
  return demo ? slice.seed(today) : slice.empty();
}

/** One slice as stored and accepted by its `normalise`, or undefined when nothing readable is. */
function readSlice(slice: PortalSlice, demo: boolean): unknown | undefined {
  const ls = storage();
  if (!ls) return undefined;
  try {
    const raw = ls.getItem(storageKey(slice.id));
    if (!raw) return undefined;
    return accept(slice, JSON.parse(raw), demo);
  } catch {
    return undefined;
  }
}

/** Read one slice, falling back to a fresh one when nothing readable is stored. */
export function loadSlice(slice: PortalSlice, today: string, demo: boolean): unknown {
  return readSlice(slice, demo) ?? fresh(slice, today, demo);
}

/**
 * Write one slice. Throws when storage is unavailable or full, so the store can
 * say the change was not saved.
 */
export function writeSlice(sliceId: string, data: unknown): void {
  const ls = storage();
  if (!ls) throw new Error('This browser is not letting the portal save anything.');
  try {
    ls.setItem(storageKey(sliceId), JSON.stringify(data));
  } catch {
    throw new Error('This browser has no room left to save the portal.');
  }
}

/** Write one slice. Silently does nothing when storage is unavailable or full. */
export function saveSlice(sliceId: string, data: unknown): void {
  try {
    writeSlice(sliceId, data);
  } catch {
    // Quota or private mode: the caller did not ask to know.
  }
}

/**
 * A development switch: with this preference set to `1`, every save fails, so
 * the failure path (the rollback, the toast, Roll call's Try again) can be seen
 * in the browser. Set it in devtools with
 * `localStorage.setItem('ja-portal:fail-saves', '1')`; remove it to save again.
 * Read only in `npm run dev`; a production build ignores it.
 */
export const FAIL_SAVES_KEY = 'ja-portal:fail-saves';

function failingOnPurpose(): boolean {
  return import.meta.env.DEV && loadPreference(FAIL_SAVES_KEY) === '1';
}

/**
 * A small per-browser preference (the collapsed rail, the demo date), stored under its own key
 * and outside the slices, so export, import and reset leave it alone. Null when
 * nothing is stored or storage is unavailable.
 */
export function loadPreference(key: string): string | null {
  const ls = storage();
  if (!ls) return null;
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

/** Write a preference. Silently does nothing when storage is unavailable or full. */
export function savePreference(key: string, value: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(key, value);
  } catch {
    // Quota or private mode — the preference lasts for this tab only.
  }
}

/** The whole portal: every registered slice, loaded, or fresh when nothing is stored. */
export function loadState(slices: PortalSlice[], today: string, demo: boolean): PortalState {
  const state: Record<string, unknown> = {};
  for (const slice of slices) state[slice.id] = loadSlice(slice, today, demo);
  return state as unknown as PortalState;
}

export function saveState(slices: PortalSlice[], state: PortalState): void {
  const bag = state as unknown as Record<string, unknown>;
  for (const slice of slices) saveSlice(slice.id, bag[slice.id]);
}

/**
 * The Repository on localStorage. `load` reads one slice's key (and writes a
 * fresh slice there when nothing readable is stored); `apply` writes
 * the slice's new state whole, so it has no need to read the action (a backend
 * will). Both answer at once, but as promises, like a backend.
 */
export const localRepository: Repository = {
  load(slice, today, demo) {
    const stored = readSlice(slice, demo);
    if (stored !== undefined) return Promise.resolve(stored);
    // A slice that starts fresh is kept as it started, so a later demo date
    // does not reseed it under the slices that point into it.
    const start = fresh(slice, today, demo);
    saveSlice(slice.id, start);
    return Promise.resolve(start);
  },
  apply(sliceId: string, _action: AnyAction, next: unknown) {
    try {
      if (failingOnPurpose())
        throw new Error(`Saving is switched off in this browser (${FAIL_SAVES_KEY}).`);
      writeSlice(sliceId, next);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  },
};

function envelope(slices: PortalSlice[], state: PortalState): Envelope {
  const bag = state as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const slice of slices) out[slice.id] = bag[slice.id];
  return { version: STORAGE_VERSION, savedAt: new Date().toISOString(), slices: out };
}

/** Pretty JSON for the "Export JSON" button in Settings. */
export function exportJson(slices: PortalSlice[], state: PortalState): string {
  return JSON.stringify(envelope(slices, state), null, 2);
}

/**
 * Parse an exported file back into state. A file written before a module
 * existed is fine: any slice it does not carry starts fresh instead, the demo
 * data in a demo build and empty otherwise. Throws with a readable message on
 * garbage. Nothing is written here: the store applies the result, one slice
 * at a time, like any other change.
 */
export function readImport(
  slices: PortalSlice[],
  text: string,
  today: string,
  demo: boolean,
): PortalState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file does not look like a Jazz Angels export.');
  }

  const bag = (parsed as Partial<Envelope>).slices;
  if (!bag || typeof bag !== 'object') {
    throw new Error('That file does not look like a Jazz Angels export.');
  }

  const state: Record<string, unknown> = {};
  let recognised = 0;
  for (const slice of slices) {
    const value = slice.id in bag ? accept(slice, bag[slice.id], demo) : undefined;
    if (value === undefined) {
      state[slice.id] = fresh(slice, today, demo);
    } else {
      state[slice.id] = value;
      recognised += 1;
    }
  }
  if (recognised === 0) {
    throw new Error('That file is missing portal data, so it was not imported.');
  }

  return state as unknown as PortalState;
}

/**
 * Every slice started again: from the demo data in a demo build, empty
 * otherwise. Settings offers the reset only in a demo build. Like
 * `readImport`, it writes nothing; the store applies it.
 */
export function freshState(slices: PortalSlice[], today: string, demo: boolean): PortalState {
  const state: Record<string, unknown> = {};
  for (const slice of slices) state[slice.id] = fresh(slice, today, demo);
  return state as unknown as PortalState;
}

/** Remove the saved slices without starting them again (used by tests). */
export function clear(slices: PortalSlice[]): void {
  const ls = storage();
  if (!ls) return;
  for (const slice of slices) {
    try {
      ls.removeItem(storageKey(slice.id));
    } catch {
      // ignore
    }
  }
}
