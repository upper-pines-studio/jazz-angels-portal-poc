import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { applyDiff, checkStale, diffRows } from '../src/core/diff';
import type { RowDiff } from '../src/core/diff';
import type { Row, SliceTables, Tables } from '../src/core/rows';
import { makeCoreSeed } from '../src/core/seed';
import { coreTables } from '../src/core/tables';
import * as grantsSeed from '../src/modules/grants/domain/seed';
import { grantsTables } from '../src/modules/grants/domain/tables';
import * as teachingSeed from '../src/modules/teaching/domain/seed';
import { teachingTables } from '../src/modules/teaching/domain/tables';
import * as timesheetsSeed from '../src/modules/timesheets/domain/seed';
import { timesheetsTables } from '../src/modules/timesheets/domain/tables';

/**
 * `public.apply(slice_id, diff)` (#156, decision 0009): the row diff the
 * browser builds, written in one transaction or not at all, refusing a stale
 * write as `checkStale` does. Every `checkStale` case in
 * `src/core/__tests__/stale.test.ts` is replayed here against the database,
 * and the database must agree with `checkStale`: refused with the same table,
 * key and reason, or written as `applyDiff` writes it.
 *
 * The calls run as `service_role`, which bypasses row level security: no
 * policies exist yet, so every other role is refused everything. The per-role
 * tests come with the policies (#154). One test runs as `authenticated` to see
 * a policy's refusal come back as one, not as a stale write.
 *
 * Every test runs in a transaction that is rolled back. Run by `npm run test:db`.
 */

/** The local database's address: `SUPABASE_DB_URL`, or what `supabase status` says. */
function databaseUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const url = /^DB_URL="?([^"\n]+)"?$/m.exec(env)?.[1];
  if (!url) throw new Error('No local database: run `supabase start` first.');
  return url;
}

const client = new pg.Client({ connectionString: databaseUrl() });

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(async () => {
  await client.query('begin');
  await client.query('set local role service_role');
});
afterEach(() => client.query('rollback'));

/** One apply, as its own step: its error, or undefined when it went through. */
async function apply(sliceId: string, diff: unknown): Promise<pg.DatabaseError | undefined> {
  await client.query('savepoint apply');
  try {
    await client.query('select public.apply($1, $2::jsonb)', [sliceId, JSON.stringify(diff)]);
    await client.query('release savepoint apply');
    return undefined;
  } catch (error) {
    await client.query('rollback to savepoint apply');
    return error as pg.DatabaseError;
  }
}

/** Apply that must go through. */
async function applied(sliceId: string, diff: unknown) {
  const error = await apply(sliceId, diff);
  expect(error?.message).toBeUndefined();
}

/** The rows of each table in `keys` as stored, in a stable order. */
async function read(keys: { readonly [table: string]: readonly string[] }): Promise<Tables> {
  const out: Record<string, Row[]> = {};
  for (const table of Object.keys(keys)) {
    const { rows } = await client.query<{ row: Row }>(
      `select to_jsonb(t) as row from public.${table} t`,
    );
    out[table] = sorted(rows.map(r => r.row));
  }
  return out;
}

const sorted = (rows: readonly Row[]): Row[] =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const sortedTables = (tables: Tables): Tables =>
  Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, sorted(rows)]));

/** What the stale error says, as the Supabase repository (#159) will read it. */
const staleOf = (error: pg.DatabaseError | undefined) =>
  error?.code === 'PT409' ? JSON.parse(error.detail ?? 'null') : undefined;

/**
 * Store `stored` (through apply, as inserts), send `diff`, and check the
 * database agrees with `checkStale` and `applyDiff`: refused with the same
 * table, key and reason and every table as it was, or written as `applyDiff`
 * writes it.
 */
async function agrees(
  sliceId: string,
  keys: { readonly [table: string]: readonly string[] },
  stored: Tables,
  diff: RowDiff,
) {
  await applied(sliceId, diffRows(keys, {}, stored));
  const expected = checkStale(keys, stored, diff);
  const error = await apply(sliceId, diff);
  if (expected) {
    expect(error?.code, error?.message).toBe('PT409');
    expect(staleOf(error)).toEqual(expected);
    expect(await read(keys)).toEqual(sortedTables({ ...emptyOf(keys), ...stored }));
  } else {
    expect(error?.message).toBeUndefined();
    expect(await read(keys)).toEqual(
      sortedTables({ ...emptyOf(keys), ...applyDiff(keys, stored, diff) }),
    );
  }
  return expected;
}

const emptyOf = (keys: { readonly [table: string]: readonly string[] }): Tables =>
  Object.fromEntries(Object.keys(keys).map(t => [t, []]));

// --- The checkStale cases, on `staff` ----------------------------------------

const STAFF = { staff: ['id'] };

const person = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  name: id.toUpperCase(),
  title: 'Teaching artist',
  role: 'teacher',
  teaches: true,
  email: null,
  archived_at: null,
  archived_by: null,
  ...extra,
});

const STORED: Tables = {
  staff: [
    person('s-ana', { name: 'Ana', email: 'ana@jazzangels.org' }),
    person('s-ben', { name: 'Ben' }),
  ],
};

const one = (id: string) => STORED.staff.find(r => r.id === id)!;
/** The diff a person makes who read `before` and changed it to `next`. */
const change = (before: Row[], next: Row[]): RowDiff =>
  diffRows(STAFF, { staff: before }, { staff: next });

describe('apply, against checkStale (#124, #156)', () => {
  it('lets an update through when the columns it changes are as it read them', async () => {
    const diff = change([one('s-ana')], [{ ...one('s-ana'), name: 'Ana María' }]);
    expect(await agrees('core', STAFF, STORED, diff)).toBeUndefined();
  });

  it('refuses an update when a column it changes holds someone else’s value', async () => {
    const read = { ...one('s-ana'), name: 'Anna' };
    const diff = change([read], [{ ...read, name: 'Ana María' }]);
    expect(await agrees('core', STAFF, STORED, diff)).toEqual({
      table: 'staff',
      key: { id: 's-ana' },
      reason: 'changed',
    });
  });

  it('keeps a colleague’s change to another column of the same row', async () => {
    const read = { ...one('s-ana'), email: null };
    const diff = change([read], [{ ...read, name: 'Ana María' }]);
    expect(await agrees('core', STAFF, STORED, diff)).toBeUndefined();
    expect((await storedStaff('s-ana')).email).toBe('ana@jazzangels.org');
  });

  it('lets an update through again when it was already written: a resend', async () => {
    const diff = change([one('s-ana')], [{ ...one('s-ana'), teaches: false }]);
    const once = applyDiff(STAFF, STORED, diff);
    expect(await agrees('core', STAFF, once, diff)).toBeUndefined();
  });

  it('refuses an update to a row that is gone', async () => {
    const read = person('s-gone');
    const diff = change([read], [{ ...read, teaches: false }]);
    expect((await agrees('core', STAFF, STORED, diff))?.reason).toBe('gone');
  });

  it('treats a missing column and null alike', async () => {
    const { email: _email, ...noEmail } = one('s-ben');
    const diff = change([noEmail], [{ ...noEmail, email: 'ben@jazzangels.org' }]);
    expect(diff[0].updates[0].was).toEqual({ email: null });
    expect(await agrees('core', STAFF, STORED, diff)).toBeUndefined();
  });

  it('lets a delete through when the row is as it was read, or already gone', async () => {
    const diff = change([one('s-ben')], []);
    expect(await agrees('core', STAFF, STORED, diff)).toBeUndefined();
    // Sent again, on the rows it left: the row is gone, so the delete is done.
    await applied('core', diff);
    expect(await read(STAFF)).toEqual(sortedTables(applyDiff(STAFF, STORED, diff)));
  });

  it('refuses a delete when the row changed since it was read', async () => {
    const diff = change([{ ...one('s-ben'), name: 'Benjamin' }], []);
    expect(await agrees('core', STAFF, STORED, diff)).toEqual({
      table: 'staff',
      key: { id: 's-ben' },
      reason: 'changed',
    });
  });

  it('lets an insert through under a free key, and again when sent twice', async () => {
    const diff = change([], [person('s-cleo', { name: 'Cleo' })]);
    expect(await agrees('core', STAFF, STORED, diff)).toBeUndefined();
    await applied('core', diff);
    expect(await read(STAFF)).toEqual(sortedTables(applyDiff(STAFF, STORED, diff)));
  });

  it('refuses an insert whose key already holds a different row, rather than write over it', async () => {
    const diff = change([], [person('s-ben', { name: 'Someone else' })]);
    expect(await agrees('core', STAFF, STORED, diff)).toEqual({
      table: 'staff',
      key: { id: 's-ben' },
      reason: 'taken',
    });
  });

  it('compares arrays by content (settings.enabled_modules)', async () => {
    const keys = { settings: ['id'] };
    const row = { id: 1, fiscal_year_start_month: 7, enabled_modules: ['grants', 'teaching'] };
    const diff = diffRows(
      keys,
      { settings: [row] },
      { settings: [{ ...row, enabled_modules: ['grants'] }] },
    );
    expect(await agrees('core', keys, { settings: [row] }, diff)).toBeUndefined();
    await client.query('rollback; begin; set local role service_role');
    const other = { ...row, enabled_modules: ['timesheets'] };
    expect((await agrees('core', keys, { settings: [other] }, diff))?.reason).toBe('changed');
  });

  it('compares jsonb by content, whatever the key order (activity.detail)', async () => {
    const keys = { activity: ['id'] };
    const row = {
      id: 'a-1',
      subject_kind: 'time-entry',
      subject_id: 'te-1',
      at: '2026-09-13T10:00:00+00:00',
      who_id: null,
      who: 'Ana',
      text: 'Changed the hours',
      kind: 'changed',
      detail: { reason: 'typo', changes: [{ field: 'hours', from: 2, to: 3 }] },
    };
    const read = {
      ...row,
      detail: { changes: [{ to: 3, from: 2, field: 'hours' }], reason: 'typo' },
    };
    const diff = diffRows(
      keys,
      { activity: [read] },
      { activity: [{ ...read, text: 'Fixed the hours' }] },
    );
    expect(await agrees('timesheets', keys, { activity: [row] }, diff)).toBeUndefined();
    await client.query('rollback; begin; set local role service_role');
    const del = diffRows(keys, { activity: [read] }, { activity: [] });
    const changed = { ...row, detail: { reason: 'typo', changes: [] } };
    expect((await agrees('timesheets', keys, { activity: [changed] }, del))?.reason).toBe(
      'changed',
    );
  });
});

async function storedStaff(id: string): Promise<Row> {
  const { rows } = await client.query<{ row: Row }>(
    'select to_jsonb(s) as row from public.staff s where id = $1',
    [id],
  );
  return rows[0].row;
}

// --- One transaction ---------------------------------------------------------

describe('apply, all or nothing', () => {
  const KEYS = { checklist_templates: ['id'], checklist_template_items: ['id'] };
  const template = (id: string): Row => ({ id, name: id, description: null });
  const item = (id: string, template_id: string, extra: Partial<Row> = {}): Row => ({
    id,
    template_id,
    phase: 'applying',
    title: `Item ${id}`,
    offset_days: -7,
    anchor: 'applicationDue',
    sort_order: 0,
    ...extra,
  });
  const before: Tables = {
    checklist_templates: [template('old')],
    checklist_template_items: [item('i-1', 'old'), item('i-2', 'old')],
  };

  it('writes parents first and deletes children first, as writeOrder does', async () => {
    // i-1 moves to a new template, i-2 goes, and so does the old template.
    const next: Tables = {
      checklist_templates: [template('new')],
      checklist_template_items: [item('i-1', 'new')],
    };
    await applied('grants', diffRows(KEYS, {}, before));
    await applied('grants', diffRows(KEYS, before, next));
    expect(await read(KEYS)).toEqual(sortedTables(next));
  });

  it('writes nothing when one row is stale, whichever table it is in', async () => {
    await applied('grants', diffRows(KEYS, {}, before));
    // The change adds a template and renames i-1; i-2 was changed by someone else meanwhile.
    const read2 = {
      ...before,
      checklist_template_items: [item('i-1', 'old'), item('i-2', 'old', { title: 'Was' })],
    };
    const next: Tables = {
      checklist_templates: [template('old'), template('another')],
      checklist_template_items: [item('i-1', 'old', { title: 'Renamed' })],
    };
    const error = await apply('grants', diffRows(KEYS, read2, next));
    expect(staleOf(error)).toEqual({
      table: 'checklist_template_items',
      key: { id: 'i-2' },
      reason: 'changed',
    });
    expect(await read(KEYS)).toEqual(sortedTables(before));
  });

  it('writes nothing when a constraint refuses a later row', async () => {
    await applied('grants', diffRows(KEYS, {}, before));
    const next: Tables = {
      checklist_templates: [template('old'), template('another')],
      checklist_template_items: [...before.checklist_template_items, item('i-3', 'nowhere')],
    };
    const error = await apply('grants', diffRows(KEYS, before, next));
    expect(error?.code).toBe('23503');
    expect(staleOf(error)).toBeUndefined();
    expect(await read(KEYS)).toEqual(sortedTables(before));
  });

  it('accepts the same diff sent twice, and the second changes nothing', async () => {
    await applied('grants', diffRows(KEYS, {}, before));
    const next: Tables = {
      checklist_templates: [template('old'), template('new')],
      checklist_template_items: [item('i-1', 'new', { sort_order: 2 }), item('i-3', 'old')],
    };
    const diff = diffRows(KEYS, before, next);
    await applied('grants', diff);
    const once = await read(KEYS);
    await applied('grants', diff);
    expect(await read(KEYS)).toEqual(once);
    expect(once).toEqual(sortedTables(next));
  });

  it('reads each value through its column type, so the same instant written another way is the same', async () => {
    const keys = { activity: ['id'] };
    const row = {
      id: 'a-1',
      subject_kind: 'grant',
      subject_id: 'g-1',
      at: '2026-09-13T10:00:00.000Z',
      who_id: null,
      who: null,
      text: 'Added the grant',
      kind: null,
      detail: null,
    };
    const insert = diffRows(keys, {}, { activity: [row] });
    await applied('grants', insert);
    await applied('grants', insert);
    const update = diffRows(
      keys,
      { activity: [{ ...row, at: '2026-09-13T06:00:00-04:00' }] },
      { activity: [{ ...row, at: '2026-09-13T06:00:00-04:00', text: 'Added it' }] },
    );
    await applied('grants', update);
  });
});

// --- What it accepts ---------------------------------------------------------

describe('apply, the diff it accepts', () => {
  const empty = (table: string) => [{ table, inserts: [], updates: [], deletes: [] }];

  const SLICES: Record<string, SliceTables<never>> = {
    core: coreTables as unknown as SliceTables<never>,
    grants: grantsTables as unknown as SliceTables<never>,
    teaching: teachingTables as unknown as SliceTables<never>,
    timesheets: timesheetsTables as unknown as SliceTables<never>,
  };

  it.each(Object.keys(SLICES))(
    "accepts exactly the %s slice's tables, keyed as its tables.keys says",
    async sliceId => {
      const keys = SLICES[sliceId].keys;
      for (const table of Object.keys(keys)) {
        expect((await apply(sliceId, empty(table)))?.message, table).toBeUndefined();
        const { rows } = await client.query<{ key: string[] }>(
          `select array_agg(a.attname::text order by k.ord) as key
             from pg_index i
             cross join lateral unnest(i.indkey::int2[]) with ordinality as k (attnum, ord)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
            where i.indrelid = $1::regclass and i.indisprimary`,
          [`public.${table}`],
        );
        expect(rows[0].key, table).toEqual(keys[table]);
      }
      const others = Object.entries(SLICES)
        .flatMap(([, s]) => Object.keys(s.keys))
        .filter(t => !(t in keys));
      for (const table of [...new Set(others), 'logins', 'nowhere']) {
        const error = await apply(sliceId, empty(table));
        expect(error?.code, table).toBe('22023');
        expect(error?.message).toBe(`The ${sliceId} slice does not write the ${table} table.`);
      }
    },
  );

  it('refuses an unknown slice, a column the table does not have, and a key that is not the primary key', async () => {
    expect((await apply('payroll', []))?.message).toBe(`There is no 'payroll' slice.`);
    const refused = async (diff: unknown) => (await apply('core', diff))?.message;
    expect(await refused({ table: 'staff' })).toBe('The diff is not a list of tables.');
    expect(await refused([{ table: 'staff', inserts: [] }])).toBe(
      'The staff diff needs inserts, updates and deletes lists.',
    );
    expect(
      await refused([
        {
          table: 'staff',
          inserts: [{ ...person('s-x'), nickname: 'X' }],
          updates: [],
          deletes: [],
        },
      ]),
    ).toBe('The staff table has no nickname column.');
    expect(
      await refused([
        {
          table: 'staff',
          inserts: [],
          updates: [{ key: { id: 's-ana' }, set: { shoe: 9 }, was: { shoe: 8 } }],
          deletes: [],
        },
      ]),
    ).toBe('The staff table has no shoe column.');
    expect(
      await refused([
        {
          table: 'staff',
          inserts: [],
          updates: [{ key: { name: 'Ana' }, set: { title: 'X' }, was: { title: 'Y' } }],
          deletes: [],
        },
      ]),
    ).toBe('A staff key must name id, and nothing else.');
    expect(
      await refused([
        { table: 'staff', inserts: [{ ...person('s-x'), id: null }], updates: [], deletes: [] },
      ]),
    ).toBe('A staff row has no id.');
    expect(
      await refused([
        {
          table: 'staff',
          inserts: [],
          updates: [{ key: { id: 's-ana' }, set: { title: 'X' }, was: {} }],
          deletes: [],
        },
      ]),
    ).toBe('A staff update must change something, and name the same columns in set and was.');
  });

  // From no rows at all: an empty slice already holds rows of its own (the programs, settings).
  it(
    'takes every slice’s demo rows as the browser sends them, and the same again changes nothing',
    { timeout: 20_000 },
    async () => {
      const slices: Array<[string, SliceTables<never>, unknown]> = [
        ['core', SLICES.core, makeCoreSeed()],
        ['grants', SLICES.grants, grantsSeed.makeSeed()],
        ['teaching', SLICES.teaching, teachingSeed.makeSeed()],
        ['timesheets', SLICES.timesheets, timesheetsSeed.makeSeed()],
      ];
      const diffs = slices.map(
        ([sliceId, tables, seed]) =>
          [sliceId, diffRows(tables.keys, {}, tables.toRows(seed as never))] as const,
      );
      // `budget_versions.added_by` is the database's to set (SCHEMA.md, "Who did it"), by a
      // trigger that comes in #155; until then a stand-in, for this transaction only.
      await client.query('reset role');
      await client.query(`
      create function pg_temp.added_by() returns trigger language plpgsql as $$
      begin new.added_by := coalesce(new.added_by, 's-barry'); return new; end $$;
      create trigger zz_added_by before insert on public.budget_versions
        for each row execute function pg_temp.added_by();`);
      await client.query('set local role service_role');
      for (const [sliceId, diff] of diffs) await applied(sliceId, diff);
      const everything = async () => {
        const out: Tables[] = [];
        for (const [, tables] of slices) out.push(await read(tables.keys));
        return out;
      };
      const once = await everything();
      expect(once[1].expenses.length).toBeGreaterThan(0);
      for (const [sliceId, diff] of diffs) await applied(sliceId, diff);
      expect(await everything()).toEqual(once);
    },
  );
});

// --- Who may call it ---------------------------------------------------------

describe('apply, as the caller', () => {
  it('runs as the caller, so a write their policy forbids is refused as a policy, not a stale write', async () => {
    await client.query('set local role authenticated');
    const error = await apply('core', diffRows(STAFF, {}, { staff: [person('s-new')] }));
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/row-level security/);
    expect(staleOf(error)).toBeUndefined();
    await client.query('set local role service_role');
    expect(await read(STAFF)).toEqual({ staff: [] });
  });

  it('is security invoker with a fixed search_path, and not callable by anon', async () => {
    const { rows } = await client.query<{ definer: boolean; config: string[] }>(
      `select prosecdef as definer, proconfig as config from pg_proc
        where oid = 'public.apply(text, jsonb)'::regprocedure`,
    );
    expect(rows).toEqual([{ definer: false, config: ['search_path=""'] }]);
    const { rows: privileged } = await client.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'public.apply(text, jsonb)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.apply(text, jsonb)', 'execute') as authenticated`,
    );
    expect(privileged).toEqual([{ anon: false, authenticated: true }]);
  });
});
