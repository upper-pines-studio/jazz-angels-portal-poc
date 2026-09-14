import { makeSeed } from './seed';
import type { AppState } from './types';

/**
 * The only module that talks to storage. Screens never touch localStorage —
 * swap this file for a Supabase client later and nothing above it changes.
 */

export const STORAGE_KEY = 'ja-grants-v1';

/** Bumped when the stored shape changes; a payload without it is rejected. */
export const STORAGE_VERSION = 1;

interface Envelope {
  version: number;
  savedAt: string;
  state: AppState;
}

const COLLECTIONS = [
  'funders',
  'grants',
  'tasks',
  'documents',
  'payments',
  'budgetLines',
  'expenses',
  'reports',
  'activity',
  'staff',
  'programs',
  'templates',
] as const;

function storage(): Storage | undefined {
  try {
    if (typeof globalThis === 'undefined') return undefined;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    // Touch it: Safari private mode throws on access rather than on read.
    if (!ls || typeof ls.getItem !== 'function') return undefined;
    return ls;
  } catch {
    return undefined;
  }
}

function isState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(candidate[key])) return false;
  }
  const settings = candidate.settings as Record<string, unknown> | undefined;
  if (!settings || typeof settings !== 'object') return false;
  if (typeof settings.fiscalYearStartMonth !== 'number') return false;
  return true;
}

/** Fill in anything a slightly older payload is missing. */
function normalise(state: AppState): AppState {
  return {
    ...state,
    settings: { ...state.settings, fiscalYearStartMonth: state.settings?.fiscalYearStartMonth ?? 7 },
  };
}

/**
 * Read the saved state. Falls back to fresh demo data when nothing is stored,
 * when the payload is unreadable, or when it carries no `version` field.
 */
export function load(): AppState {
  const ls = storage();
  if (!ls) return makeSeed();

  let raw: string | null = null;
  try {
    raw = ls.getItem(STORAGE_KEY);
  } catch {
    return makeSeed();
  }
  if (!raw) return makeSeed();

  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (!parsed || typeof parsed !== 'object') return makeSeed();
    if (typeof parsed.version !== 'number') return makeSeed();
    if (!isState(parsed.state)) return makeSeed();
    return normalise(parsed.state);
  } catch {
    return makeSeed();
  }
}

/** Write the state. Silently does nothing when storage is unavailable or full. */
export function save(state: AppState): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(envelope(state)));
  } catch {
    // Quota or private mode — the POC keeps working from memory.
  }
}

function envelope(state: AppState): Envelope {
  return { version: STORAGE_VERSION, savedAt: new Date().toISOString(), state };
}

/** Pretty JSON for the "Export data" button in Settings. */
export function exportJson(state: AppState): string {
  return JSON.stringify(envelope(state), null, 2);
}

/**
 * Parse an exported file back into state. Accepts either the export envelope
 * or a bare AppState object. Throws with a readable message on garbage.
 */
export function importJson(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file does not look like a Jazz Angels export.');
  }

  const candidate = (parsed as Partial<Envelope>).state ?? parsed;
  if (!isState(candidate)) {
    throw new Error('That file is missing grant data, so it was not imported.');
  }
  return normalise(candidate);
}

/** Throw away everything and start again from the demo data. */
export function reset(): AppState {
  const ls = storage();
  if (ls) {
    try {
      ls.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  const fresh = makeSeed();
  save(fresh);
  return fresh;
}

/** Remove the saved state without seeding (used by tests). */
export function clear(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
