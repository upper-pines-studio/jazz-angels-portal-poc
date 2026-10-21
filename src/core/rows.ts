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

/**
 * A row as loaded (decision 0008, 2A). A cleared field is `null` on the wire
 * and in the database, and a missing field in state, so each of `optional`
 * that is `null` is left out. A `null` in any other field is a required field
 * with no value, and so is a row that is not an object: undefined, so the
 * slice's `normalise` rejects the slice and the portal keeps what is stored.
 * Every slice's `normalise` runs its state through `sliceNullsAsMissing`, which
 * calls this on each row.
 */
export function nullsAsMissing<T extends object>(
  row: T,
  optional: readonly (keyof T & string)[],
): T | undefined {
  return dropNulls(row, optional) as T | undefined;
}

function dropNulls(row: unknown, optional: readonly string[]): object | undefined {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined;
  const nulls = Object.entries(row).filter(([, value]) => value === null);
  if (nulls.length === 0) return row;
  if (nulls.some(([key]) => !optional.includes(key))) return undefined;
  return withoutNulls(row);
}

/** A collection's row type, or the type itself for a field that is not a list. */
type Element<V> = V extends readonly (infer R)[] ? R : V;

/**
 * The optional fields of each collection (or object, like `settings`) a slice
 * keeps, by its key. A key left out has none: all its fields are required.
 */
export type OptionalFields<S> = {
  readonly [K in keyof S]?: readonly (keyof Element<NonNullable<S[K]>> & string)[];
};

/**
 * A slice's state as loaded: the state itself, each of its collections row by
 * row and each object it holds through `nullsAsMissing`, with the optional
 * fields `optional` names. A collection the payload does not have stays
 * missing, for the slice to default or reject. Undefined when anything is
 * rejected.
 */
export function sliceNullsAsMissing<S extends object>(
  state: S,
  optional: OptionalFields<S>,
): S | undefined {
  const loaded = dropNulls(state, []);
  if (!loaded) return undefined;
  const fieldsOf = optional as { readonly [key: string]: readonly string[] | undefined };
  const out: { [key: string]: unknown } = {};
  for (const [key, value] of Object.entries(loaded)) {
    const fields = fieldsOf[key] ?? [];
    if (Array.isArray(value)) {
      const rows = value.map(row => dropNulls(row, fields));
      if (rows.some(row => row === undefined)) return undefined;
      out[key] = rows;
    } else if (value && typeof value === 'object') {
      const kept = dropNulls(value, fields);
      if (!kept) return undefined;
      out[key] = kept;
    } else {
      out[key] = value;
    }
  }
  return out as S;
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

/*
 * A `timestamptz` or `time` column comes back from the database in its own
 * form, not the one the state wrote: `2026-02-10T09:00:00+00:00` for
 * `2026-02-10T09:00:00.000Z`, `15:00:00` for `15:00`. Each slice's `fromRows`
 * reads such a column through the helper for the form its state keeps, so a
 * slice loaded from the database equals the slice that was saved (#159). Each
 * gives a value already in the state's form back unchanged, and one it cannot
 * read as it was.
 */

/** A zone-less date and time is UTC, as the database (whose zone is UTC) stores it. */
function utcMillis(value: string): number {
  const zoned = /T.*(Z|[+-]\d{2}(:?\d{2})?)$/.test(value) || !value.includes('T');
  return Date.parse(zoned ? value : `${value}Z`);
}

/** A `timestamptz` the state keeps as an ISO instant: `2026-02-10T09:00:00.000Z`. */
export function instantFrom(value: string): string {
  const ms = utcMillis(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/** A `timestamptz` the state keeps as a day: `2026-03-01`. */
export function dayFrom(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = utcMillis(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString().slice(0, 10);
}

/** A `timestamptz` the state keeps as a zone-less day and time: `2026-09-13T08:40`. */
export function minuteFrom(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const ms = utcMillis(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString().slice(0, 16);
}

/** A `time` the state keeps as hours and minutes: `15:00`. */
export function timeOfDayFrom(value: string): string {
  return /^\d{2}:\d{2}:00(\.0+)?$/.test(value) ? value.slice(0, 5) : value;
}
