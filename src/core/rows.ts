/**
 * A slice's state as the rows of the tables in `docs/SCHEMA.md`, and back
 * (decision 0008, #121). Each slice says how its collections map onto its
 * tables: nested shapes become columns or child tables, as SCHEMA.md's
 * conventions say. Core only calls the mapping; the row diff a backend
 * Repository is handed is worked out from it (#122).
 *
 * Inside a row, columns are named as SCHEMA.md names them (`amount_awarded`,
 * `archived_by`). A row carries only stored columns, never a derived value. A
 * field the state leaves out is a `null` column, and a `null` column read
 * back is a missing field again.
 */

/** One column's value: what a `text`, `int`, `bool`, `date`, array or `jsonb` column holds. */
export type RowValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | { readonly [key: string]: unknown };

/** One row of one table, column by column. */
export type Row = { readonly [column: string]: RowValue };

/** Rows by table name: `{ grants: [...], grant_programs: [...] }`. */
export type Tables = { readonly [table: string]: readonly Row[] };

/**
 * How one slice's state maps onto its tables. Pure: no storage, no clock.
 * `fromRows(toRows(state))` gives the state back, bar what SCHEMA.md does not
 * store (grants' `incoming`, say).
 */
export interface SliceTables<S, T extends Tables = Tables> {
  /**
   * Each table the slice writes, with the columns of its primary key, parents
   * before children: the order a backend inserts in. A table another slice
   * also writes (`activity`) is listed by both; each writes only its own rows.
   */
  keys: { readonly [K in keyof T]: readonly string[] };
  /** The slice's state as rows by table, every table in `keys` present. */
  toRows(state: S): T;
  /** The slice's state from its rows. A missing singleton row takes the slice's default. */
  fromRows(tables: T): S;
}

/** A field the state may leave out, as a column: missing is `null`. */
export function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * An object with its `null` and `undefined` fields left out: how a row's
 * nullable columns become optional fields again.
 */
export function withoutNulls<T extends object>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], null | undefined> } {
  const kept = Object.entries(value).filter(([, v]) => v !== null && v !== undefined);
  return Object.fromEntries(kept) as { [K in keyof T]?: Exclude<T[K], null | undefined> };
}

/** The rows grouped by one column, each group in the rows' order. */
export function groupBy<R extends Row>(rows: readonly R[], column: keyof R): Map<RowValue, R[]> {
  const groups = new Map<RowValue, R[]>();
  for (const row of rows) {
    const key = row[column];
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}
