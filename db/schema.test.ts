import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schemaTables } from '../src/app/__tests__/schemaDoc';

/**
 * The local Supabase database against `docs/SCHEMA.md` (#153): every table the
 * diagrams draw is in `public` with exactly the columns drawn, each of the type
 * drawn and nullable exactly when the diagram says `null`; nothing else is in
 * `public`; row level security is on everywhere; and no foreign key cascades
 * (decision 0002). Run by `npm run test:db`, which resets the database from the
 * migrations first; it needs `supabase start` (and so Docker).
 */

const SCHEMA = schemaTables(readFileSync(new URL('../docs/SCHEMA.md', import.meta.url), 'utf8'));

/** A diagram's type as Postgres names it (`information_schema.columns.udt_name`). */
const UDT: Record<string, string> = {
  text: 'text',
  int: 'int4',
  bool: 'bool',
  date: 'date',
  time: 'time',
  timestamptz: 'timestamptz',
  uuid: 'uuid',
  numeric: 'numeric',
  jsonb: 'jsonb',
  'text[]': '_text',
  'int[]': '_int4',
};

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

interface Column {
  table: string;
  column: string;
  udt: string;
  nullable: boolean;
}

const client = new pg.Client({ connectionString: databaseUrl() });
let columns: Column[] = [];

beforeAll(async () => {
  await client.connect();
  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: 'YES' | 'NO';
  }>(
    `select c.table_name, c.column_name, c.udt_name, c.is_nullable
       from information_schema.columns c
       join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'`,
  );
  columns = rows.map(r => ({
    table: r.table_name,
    column: r.column_name,
    udt: r.udt_name,
    nullable: r.is_nullable === 'YES',
  }));
});

afterAll(() => client.end());

const columnsOf = (table: string) => columns.filter(c => c.table === table);

describe('the database against SCHEMA.md (#153)', () => {
  it('reads the schema', () => {
    expect(SCHEMA.tables.size).toBeGreaterThan(40);
    for (const type of SCHEMA.types.values()) expect(Object.keys(UDT)).toContain(type);
  });

  it('has exactly the tables the diagrams draw', () => {
    const tables = [...new Set(columns.map(c => c.table))].sort();
    expect(tables).toEqual([...SCHEMA.tables.keys()].sort());
  });

  it.each([...SCHEMA.tables.keys()])('has exactly the columns drawn: %s', table => {
    const drawn = SCHEMA.tables.get(table) ?? [];
    expect(
      columnsOf(table)
        .map(c => c.column)
        .sort(),
    ).toEqual([...drawn].sort());
  });

  it.each([...SCHEMA.tables.keys()])('gives each column the type drawn: %s', table => {
    for (const c of columnsOf(table)) {
      expect(c.udt, `${table}.${c.column}`).toBe(UDT[SCHEMA.types.get(`${table}.${c.column}`)!]);
    }
  });

  it.each([...SCHEMA.tables.keys()])(
    'makes a column nullable exactly when the diagram says null: %s',
    table => {
      for (const c of columnsOf(table)) {
        expect(c.nullable, `${table}.${c.column}`).toBe(
          SCHEMA.nullable.has(`${table}.${c.column}`),
        );
      }
    },
  );

  it('switches on row level security for every table in public', async () => {
    const { rows } = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map(r => r.relname)).toEqual([]);
  });

  it('restricts every foreign key on delete: nothing cascades (decision 0002)', async () => {
    const { rows } = await client.query<{ conname: string; confdeltype: string }>(
      `select c.conname, c.confdeltype
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public' and c.contype = 'f'`,
    );
    expect(rows.length).toBeGreaterThan(60);
    expect(rows.filter(r => r.confdeltype !== 'r').map(r => r.conname)).toEqual([]);
  });

  it('refuses two current sessions on one line that share a day (decision 0007)', async () => {
    await client.query('begin');
    try {
      await client.query(`insert into public.programs values ('p', 'P', 'P', false, null, null)`);
      const term = (id: string, program: string | null, start: string, end: string) =>
        client.query(
          `insert into public.terms (id, name, program_id, start_date, end_date, meetings_planned)
           values ($1, $1, $2, $3, $4, 10)`,
          [id, program, start, end],
        );
      await term('all-1', null, '2026-09-01', '2026-12-15');
      await term('p-1', 'p', '2026-09-01', '2026-12-15');
      await client.query('savepoint clash');
      await expect(term('all-2', null, '2026-12-15', '2027-03-01')).rejects.toThrow(
        /terms_no_overlap_on_a_line/,
      );
      await client.query('rollback to savepoint clash');
      await client.query(`update public.terms set archived_at = '2026-10-01' where id = 'p-1'`);
      await term('p-2', 'p', '2026-10-01', '2027-01-31');
    } finally {
      await client.query('rollback');
    }
  });
});
