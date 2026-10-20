import { expect } from 'vitest';

/**
 * Test helpers for decision 0008, 2A: each slice's `normalise` loads a `null`
 * optional field as a missing field, and rejects a `null` required one.
 */

type Rows = Array<{ id: string }>;

/** The state as a backend or an export would hand it back: JSON, nothing else. */
export const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The row with each of `fields` set to `null`, as a cleared column comes back. */
export const nulled = <T extends object>(row: T, fields: readonly string[]): T => ({
  ...row,
  ...Object.fromEntries(fields.map(f => [f, null])),
});

/** The row without `fields`: what a `null` optional field should load as. */
export const without = <T extends object>(row: T, fields: readonly string[]): T =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !fields.includes(k))) as T;

/**
 * Set every one of `fields` to `null` on one row of `key` in `state`, load it,
 * and check the row loads as it would have without those fields, and that the
 * rest of the state loads exactly as before.
 */
export function expectNullsLoadMissing<S extends object>(
  normalise: (raw: unknown) => S | undefined,
  state: S,
  key: keyof S,
  fields: readonly string[],
  pick: (row: { id: string }) => boolean = () => true,
): void {
  const base = normalise(stored(state));
  expect(base).toBeDefined();
  const rows = state[key] as Rows;
  const index = rows.findIndex(pick);
  expect(index, `a row in ${String(key)}`).toBeGreaterThanOrEqual(0);
  const id = rows[index].id;
  const raw = { ...state, [key]: rows.map((r, i) => (i === index ? nulled(r, fields) : r)) };
  const loaded = normalise(stored(raw));
  expect(loaded).toBeDefined();
  const row = (loaded![key] as Rows).find(r => r.id === id)!;
  const expected = (base![key] as Rows).find(r => r.id === id)!;
  expect(row).toEqual(without(expected, fields));
  for (const field of fields) expect(field in row, field).toBe(false);
  expect({ ...loaded, [key]: [] }).toEqual({ ...base, [key]: [] });
}
