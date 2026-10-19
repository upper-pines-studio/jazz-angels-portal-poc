import { describe, expect, it, vi } from 'vitest';
import { applyDiff, diffRows, diffSlice, sameValue, writeOrder } from '../diff';
import type { Row, SliceTables, Tables } from '../rows';
import { makeCoreSeed } from '../seed';
import { coreSlice, makeReducer } from '../store';
import type { PortalSlice } from '../repository';
import type { CoreState, PortalState, SignedInUser } from '../types';

/**
 * The row diff of decision 0008 (#122): what `Repository.apply` is handed.
 * The slices' own compound and clearing actions are tested next to each slice
 * (`src/modules/<module>/domain/__tests__/diff.test.ts`).
 */

const KEYS = { parents: ['id'], links: ['parent_id', 'tag'], children: ['id'] };

const parent = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  name: id.toUpperCase(),
  note: null,
  ...extra,
});

/** Rows in a stable order, so a replay can be compared with what the slice gives. */
function sorted(tables: Tables): Tables {
  const out: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(tables)) {
    out[table] = [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

describe('diffRows', () => {
  const before: Tables = {
    parents: [parent('a'), parent('b', { note: 'kept' }), parent('c')],
    links: [{ parent_id: 'a', tag: 'x' }],
    children: [{ id: 'k1', parent_id: 'c', size: 1 }],
  };

  it('gives whole rows for inserts, changed columns with their old values for updates, keys for deletes', () => {
    const next: Tables = {
      parents: [parent('a', { name: 'Alpha' }), parent('b', { note: 'kept' }), parent('d')],
      links: [{ parent_id: 'a', tag: 'y' }],
      children: [],
    };
    expect(diffRows(KEYS, before, next)).toEqual([
      {
        table: 'parents',
        inserts: [parent('d')],
        updates: [{ key: { id: 'a' }, set: { name: 'Alpha' }, was: { name: 'A' } }],
        deletes: [{ key: { id: 'c' }, was: parent('c') }],
      },
      {
        table: 'links',
        inserts: [{ parent_id: 'a', tag: 'y' }],
        updates: [],
        deletes: [{ key: { parent_id: 'a', tag: 'x' }, was: { parent_id: 'a', tag: 'x' } }],
      },
      {
        table: 'children',
        inserts: [],
        updates: [],
        deletes: [{ key: { id: 'k1' }, was: { id: 'k1', parent_id: 'c', size: 1 } }],
      },
    ]);
  });

  it('lists only the tables that changed, in the order of keys', () => {
    const next = { ...before, children: [{ id: 'k1', parent_id: 'c', size: 2 }] };
    expect(diffRows(KEYS, before, next).map(t => t.table)).toEqual(['children']);
    expect(diffRows(KEYS, before, before)).toEqual([]);
    // Rows equal column by column, but not the same objects, are no change either.
    expect(diffRows(KEYS, before, structuredClone(before))).toEqual([]);
  });

  // Decision 0008, 2A: missing and undefined are the same, and either after a value is null.
  it('sends a cleared column as null, whether it was left out or set to undefined', () => {
    const was: Tables = {
      parents: [parent('a', { note: 'call first' }), parent('b', { note: 'x' })],
    };
    const cleared: Tables = {
      parents: [{ id: 'a', name: 'A', note: undefined } as unknown as Row, { id: 'b', name: 'B' }],
    };
    expect(diffRows(KEYS, was, cleared)).toEqual([
      {
        table: 'parents',
        inserts: [],
        updates: [
          { key: { id: 'a' }, set: { note: null }, was: { note: 'call first' } },
          { key: { id: 'b' }, set: { note: null }, was: { note: 'x' } },
        ],
        deletes: [],
      },
    ]);
    // And back: the old value of a column that had none is null.
    expect(diffRows(KEYS, cleared, was)[0].updates[0]).toEqual({
      key: { id: 'a' },
      set: { note: 'call first' },
      was: { note: null },
    });
    // Missing to undefined to null is no change at all.
    const none: Tables = { parents: [{ id: 'a', name: 'A', note: null }] };
    const left: Tables = { parents: [{ id: 'a', name: 'A' }] };
    expect(diffRows(KEYS, none, left)).toEqual([]);
  });

  it('writes an undefined column of an inserted row as null', () => {
    const next: Tables = { parents: [{ id: 'n', name: 'N', note: undefined } as unknown as Row] };
    expect(diffRows(KEYS, {}, next)[0].inserts).toEqual([{ id: 'n', name: 'N', note: null }]);
  });

  it('compares array and object columns by what they hold', () => {
    const a: Tables = {
      parents: [parent('a', { tags: ['grants', 'teaching'], detail: { n: 1 } })],
    };
    const same: Tables = {
      parents: [parent('a', { tags: ['grants', 'teaching'], detail: { n: 1 } })],
    };
    const changed: Tables = { parents: [parent('a', { tags: ['grants'], detail: { n: 1 } })] };
    expect(diffRows(KEYS, a, same)).toEqual([]);
    expect(diffRows(KEYS, a, changed)[0].updates).toEqual([
      { key: { id: 'a' }, set: { tags: ['grants'] }, was: { tags: ['grants', 'teaching'] } },
    ]);
  });

  it('skips a row that is the same object without reading its columns', () => {
    const row = parent('a');
    Object.defineProperty(row, 'note', {
      enumerable: true,
      get: () => {
        throw new Error('read');
      },
    });
    const next: Tables = { parents: [row, parent('b')] };
    expect(() => diffRows(KEYS, { parents: [row] }, next)).not.toThrow();
  });

  it('refuses two rows of one table with the same key', () => {
    expect(() => diffRows(KEYS, {}, { parents: [parent('a'), parent('a')] })).toThrow(
      /Two parents rows share the key/,
    );
  });
});

describe('sameValue', () => {
  it('treats null and undefined alike, and nothing else', () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue('', null)).toBe(false);
    expect(sameValue(false, null)).toBe(false);
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: null })).toBe(true);
  });
});

describe('writeOrder', () => {
  it('writes inserts and updates parents first, then deletes children first', () => {
    const before: Tables = {
      parents: [parent('old')],
      children: [
        { id: 'k1', parent_id: 'old' },
        { id: 'k2', parent_id: 'old' },
      ],
    };
    // k1 moves to a new parent, k2 goes, and so does the old parent.
    const next: Tables = { parents: [parent('new')], children: [{ id: 'k1', parent_id: 'new' }] };
    expect(writeOrder(diffRows(KEYS, before, next)).map(w => `${w.op} ${w.table}`)).toEqual([
      'insert parents',
      'update children',
      'delete children',
      'delete parents',
    ]);
  });
});

describe('applyDiff, as a backend writes it', () => {
  const before: Tables = {
    parents: [parent('a'), parent('b'), parent('c')],
    links: [{ parent_id: 'a', tag: 'x' }],
    children: [{ id: 'k1', parent_id: 'c', size: 1 }],
  };
  const next: Tables = {
    parents: [parent('a', { note: 'n' }), parent('b'), parent('d')],
    links: [
      { parent_id: 'a', tag: 'x' },
      { parent_id: 'd', tag: 'y' },
    ],
    children: [{ id: 'k2', parent_id: 'd', size: 3 }],
  };
  const diff = diffRows(KEYS, before, next);

  it('turns the rows before into the rows after', () => {
    expect(sorted(applyDiff(KEYS, before, diff))).toEqual(sorted(next));
  });

  // #114: an insert is an upsert and a delete of a row already gone is a no-op.
  it('changes nothing when the same diff is sent twice', () => {
    const once = applyDiff(KEYS, before, diff);
    expect(sorted(applyDiff(KEYS, once, diff))).toEqual(sorted(once));
  });
});

describe('diffSlice', () => {
  interface Bag {
    items: Array<{ id: string; label?: string }>;
  }
  const toRows = vi.fn((s: Bag) => ({
    items: s.items.map(i => ({ id: i.id, label: i.label ?? null })),
  }));
  const tables: SliceTables<Bag> = {
    keys: { items: ['id'] },
    toRows,
    fromRows: t => ({ items: t.items.map(r => ({ id: String(r.id) })) }),
  };

  it('is no change for the same state, without mapping it', () => {
    const state: Bag = { items: [{ id: 'a' }] };
    toRows.mockClear();
    expect(diffSlice(tables, state, state)).toEqual([]);
    expect(toRows).not.toHaveBeenCalled();
  });

  it("maps each state once, so a change's after is not mapped again as the next one's before", () => {
    const s0: Bag = { items: [{ id: 'a' }] };
    const s1: Bag = { items: [{ id: 'a', label: 'One' }] };
    const s2: Bag = { items: [{ id: 'a' }] };
    toRows.mockClear();
    expect(diffSlice(tables, s0, s1)[0].updates).toEqual([
      { key: { id: 'a' }, set: { label: 'One' }, was: { label: null } },
    ]);
    expect(diffSlice(tables, s1, s2)[0].updates).toEqual([
      { key: { id: 'a' }, set: { label: null }, was: { label: 'One' } },
    ]);
    expect(toRows).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Core's clearing action: Restore (decision 0008, 2A)
// ---------------------------------------------------------------------------

describe("core's rows", () => {
  const ADMIN: SignedInUser = { id: 's-barry', name: 'Barry', role: 'admin' };
  const SLICES = [coreSlice] as unknown as PortalSlice[];

  function harness() {
    const reducer = makeReducer(SLICES);
    let state = { core: makeCoreSeed() } as unknown as PortalState;
    const actions = coreSlice.createActions(
      action => {
        state = reducer(state, action);
      },
      () => state,
      { today: '2026-09-13', newId: prefix => `${prefix}-new`, user: ADMIN },
    );
    /** The core rows one step changes. */
    const diffOf = (step: () => void) => {
      const before: CoreState = state.core;
      step();
      return diffSlice(coreSlice.tables, before, state.core);
    };
    return { actions, diffOf };
  }

  // A restored person whose archive columns stayed set could not sign in.
  it('clears both archive columns with null when a staff member is restored', () => {
    const h = harness();
    h.actions.archiveStaff('s-devon');
    expect(h.diffOf(() => h.actions.restoreStaff('s-devon'))).toEqual([
      {
        table: 'staff',
        inserts: [],
        updates: [
          {
            key: { id: 's-devon' },
            set: { archived_at: null, archived_by: null },
            was: { archived_at: '2026-09-13', archived_by: 's-barry' },
          },
        ],
        deletes: [],
      },
    ]);
  });
});
