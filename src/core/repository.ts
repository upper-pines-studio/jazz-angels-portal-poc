import type { ModuleSlice } from './module';
import type { PortalState } from './types';

/**
 * The only module that talks to storage. Screens never touch localStorage —
 * swap this file for a Supabase client later and nothing above it changes.
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

/** Read one slice, falling back to a fresh one when nothing readable is stored. */
export function loadSlice(slice: PortalSlice, today: string, demo: boolean): unknown {
  const ls = storage();
  if (!ls) return fresh(slice, today, demo);
  try {
    const raw = ls.getItem(storageKey(slice.id));
    if (!raw) return fresh(slice, today, demo);
    return accept(slice, JSON.parse(raw), demo) ?? fresh(slice, today, demo);
  } catch {
    return fresh(slice, today, demo);
  }
}

/** Write one slice. Silently does nothing when storage is unavailable or full. */
export function saveSlice(sliceId: string, data: unknown): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(storageKey(sliceId), JSON.stringify(data));
  } catch {
    // Quota or private mode — the POC keeps working from memory.
  }
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
 * Parse an exported file back into state and save it. A file written before a
 * module existed is fine: any slice it does not carry starts fresh instead,
 * the demo data in a demo build and empty otherwise. Throws with a readable
 * message on garbage.
 */
export function importJson(
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

  const next = state as unknown as PortalState;
  saveState(slices, next);
  return next;
}

/**
 * Throw everything away and start every slice again: from the demo data in a
 * demo build, empty otherwise. Settings offers it only in a demo build.
 */
export function reset(slices: PortalSlice[], today: string, demo: boolean): PortalState {
  const state: Record<string, unknown> = {};
  for (const slice of slices) state[slice.id] = fresh(slice, today, demo);
  const next = state as unknown as PortalState;
  saveState(slices, next);
  return next;
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
