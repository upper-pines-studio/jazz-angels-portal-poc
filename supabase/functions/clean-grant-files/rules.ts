/**
 * Which grant-file objects the clean-up removes (#175). No imports, so it reads the same here and
 * in a test.
 */

/**
 * How old an object must be before the clean-up may take it. A grant file's row is saved first
 * and its bytes uploaded after, so an object younger than this may belong to a row still on its
 * way; a day leaves room for a slow connection, a retry, and a clock that is off.
 */
export const GRACE_MS = 24 * 60 * 60 * 1000;

export interface StoredObject {
  name: string;
  /** Storage's own time, an ISO string; null for a folder, which `grant-files` never has. */
  created_at: string | null;
}

/** The objects old enough to be judged: past the grace period, as of `now`. */
export function pastGrace(objects: StoredObject[], now: number, graceMs = GRACE_MS): string[] {
  return objects
    .filter(o => o.created_at !== null && now - Date.parse(o.created_at) > graceMs)
    .map(o => o.name);
}

/** Of those names, the ones no `grant_files` row has as its id. */
export function orphans(names: string[], rowIds: Iterable<string>): string[] {
  const rows = new Set(rowIds);
  return names.filter(n => !rows.has(n));
}
