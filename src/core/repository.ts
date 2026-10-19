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

/**
 * Where a slice's backup goes when what is stored under its key cannot be read:
 * `ja-portal:grants:unreadable-2026-10-16T09:30:00.000Z`. Kept so the data can be
 * recovered by hand; nothing in the portal reads it back.
 */
export function unreadableKey(sliceId: string, at: string): string {
  return `${STORAGE_PREFIX}:${sliceId}:unreadable-${at}`;
}

/**
 * What a slice's key holds: nothing, data its `normalise` accepts, or data that
 * cannot be read (not JSON, or rejected by `normalise`), with the raw string so
 * it can be kept. "Missing" and "unreadable" are told apart because only a
 * missing slice may be started fresh over its key.
 */
type Stored =
  { kind: 'missing' } | { kind: 'read'; value: unknown } | { kind: 'unreadable'; raw: string };

function readSlice(slice: PortalSlice, demo: boolean): Stored {
  const ls = storage();
  if (!ls) return { kind: 'missing' };
  let raw: string | null;
  try {
    raw = ls.getItem(storageKey(slice.id));
  } catch {
    return { kind: 'missing' };
  }
  if (!raw) return { kind: 'missing' };
  try {
    const value = accept(slice, JSON.parse(raw), demo);
    return value === undefined ? { kind: 'unreadable', raw } : { kind: 'read', value };
  } catch {
    return { kind: 'unreadable', raw };
  }
}

/**
 * Read one slice, or a fresh one when nothing readable is stored. It writes
 * nothing, so unreadable data stays where it is; sign-in reads the staff this way
 * before the store mounts. The store itself loads through `localRepository`.
 */
export function loadSlice(slice: PortalSlice, today: string, demo: boolean): unknown {
  const stored = readSlice(slice, demo);
  return stored.kind === 'read' ? stored.value : fresh(slice, today, demo);
}

/**
 * The saved data for one slice could not be read. `localRepository.load`
 * rejects with it after putting the raw data aside, and the store shows its
 * message in place of the portal.
 */
export class UnreadableDataError extends Error {
  constructor(
    readonly sliceId: string,
    readonly backupKey: string | undefined,
  ) {
    super(
      `The ${sliceId} data saved in this browser could not be read. It was kept as it was` +
        (backupKey ? `, with a copy under ${backupKey}, ` : ', ') +
        'so nothing is lost.',
    );
    this.name = 'UnreadableDataError';
  }
}

/** Copy unreadable data to its own key. Undefined when the browser will not store it. */
function keepUnreadable(sliceId: string, raw: string): string | undefined {
  const ls = storage();
  if (!ls) return undefined;
  const key = unreadableKey(sliceId, new Date().toISOString());
  try {
    ls.setItem(key, raw);
    return key;
  } catch {
    return undefined;
  }
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

/** The whole portal: every registered slice, loaded, or fresh when nothing readable is stored. Writes nothing. */
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
 * The Repository on localStorage. `load` reads one slice's key. When the key is
 * missing it writes a fresh slice there; when the key holds data that cannot be
 * read it copies that data to an `unreadableKey`, leaves the original alone and
 * rejects with an `UnreadableDataError`, so nothing saved is ever written over.
 * `apply` writes the slice's new state whole, so it has no need to read the
 * action (a backend will). Both answer at once, but as promises, like a backend.
 * It accepts a whole-state replace: each slice is one key, written over whole.
 */
export const localRepository: Repository = {
  acceptsReplace: true,
  load(slice, today, demo) {
    const stored = readSlice(slice, demo);
    if (stored.kind === 'read') return Promise.resolve(stored.value);
    if (stored.kind === 'unreadable') {
      return Promise.reject(
        new UnreadableDataError(slice.id, keepUnreadable(slice.id, stored.raw)),
      );
    }
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
 * data in a demo build and empty otherwise. A slice the file does carry but
 * its `normalise` rejects stops the whole import, so an office never loses a
 * module's data to a bad file. Throws with a readable message on garbage. Nothing is written here: the store applies the result, one slice
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
    if (!(slice.id in bag)) {
      state[slice.id] = fresh(slice, today, demo);
      continue;
    }
    const value = accept(slice, bag[slice.id], demo);
    if (value === undefined) {
      throw new Error(
        `The ${slice.id} data in that file could not be read, so nothing was imported.`,
      );
    }
    state[slice.id] = value;
    recognised += 1;
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
