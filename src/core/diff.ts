import type { Row, RowValue, SliceTables, Tables } from './rows';

/**
 * The row diff of decision 0008 (1A and 2A, #122): what one change did to a
 * slice's tables, worked out from the slice's rows before and after it. A
 * backend `Repository` writes it; `localRepository` never reads it.
 *
 * - An insert carries the whole row.
 * - An update names the row by its key and carries only the columns that
 *   changed (`set`), each with the value it had before (`was`), so the server
 *   can refuse a write to a row that changed since it was read (#124).
 * - A delete names the row by its key, with the row as it was read (`was`),
 *   for the same check.
 * - A column that lost its value is `null`. A column that is missing and one
 *   set to `undefined` are the same thing, so a field cleared either way goes
 *   out as `null` (2A).
 *
 * Every value is absolute (`done = true`, never "flip it") and an insert is a
 * new row under a client-made id, so a backend can write an insert as an
 * upsert and treat a delete of a row already gone as done: the same diff sent
 * twice changes nothing the second time (#114).
 */

/** A row's primary key, column by column: `{ id: 'g-1' }`, `{ grant_id, program_id }`. */
export type RowKey = { readonly [column: string]: RowValue };

/** One row's changed columns: their new values, and what they were. */
export interface RowUpdate {
  key: RowKey;
  set: { readonly [column: string]: RowValue };
  was: { readonly [column: string]: RowValue };
}

/** One row gone, by its key, with the row as it was read. */
export interface RowDelete {
  key: RowKey;
  was: Row;
}

/** What one change did to one table. Only a table the change touched is listed. */
export interface TableDiff {
  table: string;
  inserts: Row[];
  updates: RowUpdate[];
  deletes: RowDelete[];
}

/**
 * What one change did to one slice, table by table, in the order of the
 * slice's `keys`: parents before children. A backend writes the inserts and
 * updates in this order and the deletes in the reverse one, children first,
 * so no foreign key is ever left pointing at nothing (`writeOrder`).
 */
export type RowDiff = TableDiff[];

/** One write, in the order a backend makes them: see `writeOrder`. */
export type RowWrite =
  | { table: string; op: 'insert'; row: Row }
  | ({ table: string; op: 'update' } & RowUpdate)
  | ({ table: string; op: 'delete' } & RowDelete);

const nullish = (value: RowValue | undefined): value is null | undefined =>
  value === null || value === undefined;

/** Two column values the same: `null` and `undefined` alike, arrays and objects by content. */
export function sameValue(a: RowValue | undefined, b: RowValue | undefined): boolean {
  if (a === b) return true;
  if (nullish(a) || nullish(b)) return nullish(a) && nullish(b);
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as readonly RowValue[];
    return a.length === other.length && a.every((v: RowValue, i: number) => sameValue(v, other[i]));
  }
  const left = a as { readonly [key: string]: RowValue };
  const right = b as { readonly [key: string]: RowValue };
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(k => sameValue(left[k], right[k]));
}

/** A row with every `undefined` column written as `null`. */
function withNulls(row: Row): Row {
  const entries = Object.entries(row);
  if (entries.every(([, v]) => v !== undefined)) return row;
  return Object.fromEntries(entries.map(([c, v]) => [c, v === undefined ? null : v]));
}

function keyOf(row: Row, columns: readonly string[]): RowKey {
  return Object.fromEntries(columns.map(c => [c, row[c] ?? null]));
}

/** A key as one string, for the lookup: the key columns' values in order. */
function keyString(row: Row, columns: readonly string[]): string {
  return JSON.stringify(columns.map(c => row[c] ?? null));
}

function byKey(table: string, rows: readonly Row[], columns: readonly string[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const key = keyString(row, columns);
    if (map.has(key)) throw new Error(`Two ${table} rows share the key ${key}.`);
    map.set(key, row);
  }
  return map;
}

/** One row's changed columns, or undefined when nothing changed. */
function rowUpdate(before: Row, next: Row, key: RowKey): RowUpdate | undefined {
  const set: Record<string, RowValue> = {};
  const was: Record<string, RowValue> = {};
  let changed = false;
  for (const column of new Set([...Object.keys(before), ...Object.keys(next)])) {
    const old = before[column];
    const now = next[column];
    if (sameValue(old, now)) continue;
    set[column] = now ?? null;
    was[column] = old ?? null;
    changed = true;
  }
  return changed ? { key, set, was } : undefined;
}

function diffTable(
  table: string,
  columns: readonly string[],
  before: readonly Row[],
  next: readonly Row[],
): TableDiff | undefined {
  if (before === next) return undefined;
  const old = byKey(table, before, columns);
  const inserts: Row[] = [];
  const updates: RowUpdate[] = [];
  const seen = new Set<string>();
  for (const row of next) {
    const key = keyString(row, columns);
    if (seen.has(key)) throw new Error(`Two ${table} rows share the key ${key}.`);
    seen.add(key);
    const was = old.get(key);
    if (!was) inserts.push(withNulls(row));
    else if (was !== row) {
      const update = rowUpdate(was, row, keyOf(row, columns));
      if (update) updates.push(update);
    }
  }
  const deletes: RowDelete[] = [];
  for (const [key, row] of old) {
    if (!seen.has(key)) deletes.push({ key: keyOf(row, columns), was: withNulls(row) });
  }
  if (!inserts.length && !updates.length && !deletes.length) return undefined;
  return { table, inserts, updates, deletes };
}

/**
 * The diff between two sets of a slice's rows, keyed by each table's primary
 * key in `keys`, in the order of `keys`. A table missing from either side
 * counts as empty. Rows that are the same object are skipped without a look
 * at their columns. Throws when two rows of one table share a key: a mapping
 * bug a backend must not write.
 */
export function diffRows(
  keys: { readonly [table: string]: readonly string[] },
  before: Tables,
  next: Tables,
): RowDiff {
  const diff: RowDiff = [];
  for (const [table, columns] of Object.entries(keys)) {
    const change = diffTable(table, columns, before[table] ?? [], next[table] ?? []);
    if (change) diff.push(change);
  }
  return diff;
}

/** Each slice state's rows, kept while the state lives: a change's `next` is the next one's `before`. */
const rowsCache = new WeakMap<SliceTables<never>, WeakMap<object, Tables>>();

function rowsOf<S>(tables: SliceTables<S>, state: S): Tables {
  if (typeof state !== 'object' || state === null) return tables.toRows(state);
  let cache = rowsCache.get(tables as SliceTables<never>);
  if (!cache) {
    cache = new WeakMap();
    rowsCache.set(tables as SliceTables<never>, cache);
  }
  let rows = cache.get(state);
  if (!rows) {
    rows = tables.toRows(state);
    cache.set(state, rows);
  }
  return rows;
}

/**
 * What a change did to one slice: its state before and after, through the
 * slice's own `tables`, diffed. The same state twice is no change at all.
 */
export function diffSlice<S>(tables: SliceTables<S>, before: S, next: S): RowDiff {
  if (before === next) return [];
  return diffRows(tables.keys, rowsOf(tables, before), rowsOf(tables, next));
}

/**
 * The diff as single writes, in the order a backend makes them inside its one
 * transaction: every table's inserts and updates parents first, then every
 * table's deletes children first. A row moving from one parent to another
 * (a file to a new expense) is updated before its old parent is deleted.
 */
export function writeOrder(diff: RowDiff): RowWrite[] {
  const writes: RowWrite[] = [];
  for (const { table, inserts, updates } of diff) {
    for (const row of inserts) writes.push({ table, op: 'insert', row });
    for (const update of updates) writes.push({ table, op: 'update', ...update });
  }
  for (const { table, deletes } of [...diff].reverse()) {
    for (const gone of deletes) writes.push({ table, op: 'delete', ...gone });
  }
  return writes;
}

/**
 * The diff written onto rows held in memory, as a backend writes it: an insert
 * is an upsert on its key, an update sets its columns on the row with its key
 * (and does nothing when there is none), a delete of a row already gone does
 * nothing. The reference for what `apply` means, and what the tests replay.
 */
export function applyDiff(
  keys: { readonly [table: string]: readonly string[] },
  tables: Tables,
  diff: RowDiff,
): Tables {
  const out: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(tables)) out[table] = [...rows];
  for (const write of writeOrder(diff)) {
    const columns = keys[write.table];
    const rows = (out[write.table] ??= []);
    const key = keyString(write.op === 'insert' ? write.row : write.key, columns);
    const at = rows.findIndex(r => keyString(r, columns) === key);
    if (write.op === 'insert') {
      if (at === -1) rows.push(write.row);
      else rows[at] = write.row;
    } else if (write.op === 'update') {
      if (at !== -1) rows[at] = { ...rows[at], ...write.set };
    } else if (at !== -1) rows.splice(at, 1);
  }
  return out;
}
