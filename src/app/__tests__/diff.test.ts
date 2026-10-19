import { describe, expect, it } from 'vitest';
import { coreSlice } from '../../core';
import { applyDiff, diffSlice } from '../../core/diff';
import type { Tables } from '../../core/rows';
import type { PortalSlice } from '../../core/repository';
import { MODULES } from '../../modules';

/**
 * Every slice's row diff written onto its rows, as a backend writes it
 * (decision 0008, #122): from an empty office to the demo and back, the rows
 * come out as the slice maps the state it reached, and the same diff written
 * twice changes nothing the second time (#114).
 */

const SLICES = [coreSlice, ...MODULES.map(m => m.slice)] as PortalSlice[];

/** Rows in a stable order: a backend's tables have none. */
function unordered(tables: Tables): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map(r => JSON.stringify(r)).sort()]),
  );
}

describe.each(SLICES.map(s => [s.id, s] as const))('the %s rows', (_, slice) => {
  const empty = slice.empty();
  const seed = slice.seed('2026-09-13');

  it.each([
    ['empty to demo', empty, seed],
    ['demo to empty', seed, empty],
  ])('replays %s', (_label, from, to) => {
    const diff = diffSlice(slice.tables, from, to);
    const once = applyDiff(slice.tables.keys, slice.tables.toRows(from), diff);
    expect(unordered(once)).toEqual(unordered(slice.tables.toRows(to)));
    expect(unordered(applyDiff(slice.tables.keys, once, diff))).toEqual(unordered(once));
  });
});
