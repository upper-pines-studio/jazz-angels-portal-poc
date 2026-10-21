import type { SupabaseClient } from '@supabase/supabase-js';
import type { RowKey, StaleWrite } from './diff';
import { StaleWriteError } from './persistence';
import type { Repository } from './persistence';
import { localRepository } from './repository';
import type { Row, Tables } from './rows';
import { supabase } from './supabase';

/**
 * The second `Repository` (decision 0009, #159): the portal's data in the
 * Supabase project's tables, read and written as the person signed in to it,
 * so every row meets the row policies (#154) and triggers (#155).
 *
 * - `load` selects each of the slice's tables (`tables.keys`) and turns the
 *   rows back into the slice through its `tables.fromRows` and `normalise`.
 *   When every one of them is empty it is a new office, and the slice starts
 *   from its `empty()` (decision 0004).
 * - `apply` sends `change.rows`, the row diff, to the database function
 *   `apply` (#156), which writes all of it in one transaction or none of it.
 *   A stale refusal (SQLSTATE `PT409`) rejects with a `StaleWriteError`, so the
 *   store rolls back, says someone else changed it first and loads the slice
 *   again (decision 0003, #124). Any other refusal (a row policy, 42501, or a
 *   trigger) rejects with an `Error` holding the database's own sentence.
 * - It takes no whole-portal replace, so Import and Reset stay hidden
 *   (decision 0008, 3C).
 *
 * `portalRepository()` picks it when the build has the Supabase variables and
 * the demo is off (`supabase()` in supabase.ts), and `localRepository`
 * otherwise.
 */

/** What the repository uses of a Supabase client; the tests hand it a stub. */
export type SupabaseLike = Pick<SupabaseClient, 'from' | 'rpc' | 'auth'>;

/** The rows one select asks for: PostgREST's `max_rows` (supabase/config.toml). */
export const PAGE_SIZE = 1000;

/** The SQLSTATE `public.apply` raises a stale write with. */
export const STALE_CODE = 'PT409';

/** What a refusal from the database carries (a `PostgrestError`). */
interface DatabaseError {
  message: string;
  code?: string;
  details?: string | null;
}

/** Said when nobody is signed in to the database, so a load never passes for an empty office. */
export const NOT_SIGNED_IN =
  'Nobody is signed in to the database, so the portal has nothing to show.';

function asError(error: DatabaseError): Error {
  return new Error(error.message);
}

/** The `StaleWriteError` a `PT409` stands for, from the `{table, key, reason}` in its detail. */
export function staleFrom(error: DatabaseError): StaleWriteError {
  let detail: Partial<StaleWrite> = {};
  try {
    detail = JSON.parse(error.details ?? '') as Partial<StaleWrite>;
  } catch {
    // An unreadable detail is still a stale write: the code says so.
  }
  const reason = detail.reason === 'gone' || detail.reason === 'taken' ? detail.reason : 'changed';
  return new StaleWriteError({
    table: typeof detail.table === 'string' ? detail.table : '',
    key: (detail.key ?? {}) as RowKey,
    reason,
  });
}

/** Every row of one table the signed-in person may read, page by page in key order. */
async function selectAll(client: SupabaseLike, table: string, key: readonly string[]) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select('*');
    for (const column of key) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw asError(error);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function signedIn(client: SupabaseLike): Promise<boolean> {
  const { data } = await client.auth.getSession();
  return Boolean(data.session);
}

/** A `Repository` on the Supabase project `client` is signed in to. */
export function supabaseRepository(client: SupabaseLike): Repository {
  return {
    acceptsReplace: false,
    async load(slice, _today, demo) {
      if (!(await signedIn(client))) throw new Error(NOT_SIGNED_IN);
      const keys = slice.tables.keys;
      const names = Object.keys(keys);
      const read = await Promise.all(names.map(table => selectAll(client, table, keys[table])));
      if (read.every(rows => rows.length === 0)) return slice.empty();
      const tables: Tables = Object.fromEntries(names.map((table, i) => [table, read[i]]));
      const state = slice.tables.fromRows(tables);
      const value = slice.normalise ? slice.normalise(state, demo) : state;
      if (value === undefined) {
        throw new Error(`The ${slice.id} data in the database could not be read.`);
      }
      return value;
    },
    async apply({ sliceId, rows }) {
      // A change that touched no stored column (a value SCHEMA.md does not keep) writes nothing.
      if (rows.length === 0) return;
      const { error } = await client.rpc('apply', { slice_id: sliceId, diff: rows });
      if (!error) return;
      throw error.code === STALE_CODE ? staleFrom(error) : asError(error);
    },
  };
}

let chosen: Repository | undefined;

/**
 * The portal's repository: on Supabase when the build has `VITE_SUPABASE_URL`
 * and `VITE_SUPABASE_PUBLISHABLE_KEY` and the demo is off, else on
 * localStorage, as before. The same one every time it is asked.
 */
export function portalRepository(): Repository {
  if (!chosen) {
    const client = supabase();
    chosen = client ? supabaseRepository(client) : localRepository;
  }
  return chosen;
}
