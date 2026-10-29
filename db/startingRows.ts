import { diffRows } from '../src/core/diff';
import type { SliceTables, Tables } from '../src/core/rows';
import { makeCoreEmpty } from '../src/core/seed';
import { coreTables } from '../src/core/tables';
import { makeEmpty as grantsEmpty } from '../src/modules/grants/domain/seed';
import { grantsTables } from '../src/modules/grants/domain/tables';
import { makeEmpty as teachingEmpty } from '../src/modules/teaching/domain/seed';
import { teachingTables } from '../src/modules/teaching/domain/tables';
import { makeEmpty as timesheetsEmpty } from '../src/modules/timesheets/domain/seed';
import { timesheetsTables } from '../src/modules/timesheets/domain/tables';

/**
 * A new office's starting rows (#177): what the `starting_rows` migration
 * writes, which is each slice's `empty()` as rows but for the staff (a real
 * office starts with its first Admin, not the demo's sign-in people).
 * `db/startingRows.test.ts` checks the migration still writes exactly these.
 *
 * Each slice's tables and `makeEmpty`, not the slices themselves, so the
 * Playwright specs can use it without the React store.
 */

type Query = (text: string, values?: unknown[]) => Promise<unknown>;

type Slice = { id: string; tables: SliceTables<never>; empty: () => unknown };

const SLICES = [
  { id: 'core', tables: coreTables, empty: makeCoreEmpty },
  { id: 'grants', tables: grantsTables, empty: grantsEmpty },
  { id: 'teaching', tables: teachingTables, empty: teachingEmpty },
  { id: 'timesheets', tables: timesheetsTables, empty: timesheetsEmpty },
] as unknown as Slice[];

/** Each slice's starting rows by table, only the tables that have some. */
export function startingRows(): Array<{ slice: Slice; rows: Tables }> {
  return SLICES.map(slice => {
    const all = slice.tables.toRows(slice.empty() as never) as Tables;
    const rows = Object.fromEntries(
      Object.entries(all).filter(([table, r]) => table !== 'staff' && r.length > 0),
    );
    return { slice, rows };
  }).filter(({ rows }) => Object.keys(rows).length > 0);
}

/** One slice's starting rows: what a load on top of them diffs from. */
export function startingRowsOf(sliceId: string): Tables {
  return startingRows().find(({ slice }) => slice.id === sliceId)?.rows ?? {};
}

/** The tables that start with rows, parents first. */
export const STARTING_TABLES: readonly string[] = startingRows().flatMap(({ slice, rows }) =>
  Object.keys(slice.tables.keys).filter(table => table in rows),
);

/**
 * The tables in `public`, once each is found as `supabase db reset` leaves it:
 * the starting rows, and nothing else. For a test that commits, so a database
 * someone else filled is left alone.
 */
export async function freshTables(
  query: (text: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
): Promise<string[]> {
  const counts = new Map(
    startingRows().flatMap(({ rows }) => Object.entries(rows).map(([t, r]) => [t, r.length])),
  );
  const { rows: found } = await query(
    `select tablename as name from pg_tables where schemaname = 'public'`,
  );
  for (const { name } of found as Array<{ name: string }>) {
    const { rows } = await query(`select count(*)::int as n from public.${name}`);
    if (rows[0].n !== (counts.get(name) ?? 0)) {
      throw new Error(`public.${name} is not as a reset leaves it: run \`supabase db reset\`.`);
    }
  }
  return found.map(({ name }) => `public.${name}`);
}

/**
 * Delete the starting rows, children first, for a test that writes a fixture
 * of its own from an empty office. Inside the test's transaction, so its
 * rollback brings them back.
 */
export async function clearStartingRows(query: Query): Promise<void> {
  for (const table of [...STARTING_TABLES].reverse()) await query(`delete from public.${table}`);
}

/**
 * Write the starting rows back, as the migration wrote them, through `apply`
 * with nobody signed in: for a test that commits, after it has emptied every
 * table. Runs in a transaction of its own.
 */
export async function restoreStartingRows(query: Query): Promise<void> {
  await query('begin');
  await query('set local role service_role');
  for (const { slice, rows } of startingRows()) {
    await query('select public.apply($1, $2::jsonb)', [
      slice.id,
      JSON.stringify(diffRows(slice.tables.keys, {}, rows)),
    ]);
  }
  await query('commit');
}
