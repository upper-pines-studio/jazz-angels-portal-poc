import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diffRows } from '../src/core/diff';
import type { Row } from '../src/core/rows';
import { STARTING_TABLES, freshTables, startingRows } from './startingRows';

/**
 * A new office's starting rows (#177): the `starting_rows` migration writes
 * exactly what each slice's `empty()` gives, but for the staff, so a portal on
 * Supabase starts where one in the browser does; and `setup.add_first_admin`
 * makes the first Admin, who can then save a change that points at a program.
 *
 * Each test runs in a transaction that is rolled back. Run by `npm run test:db`.
 */

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
const sql = (text: string, values: unknown[] = []) => client.query(text, values);

const AUTH_ID = '00000000-0000-4000-8000-000000000177';

const sorted = (rows: readonly Row[]): Row[] =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** An invited person, as the dashboard's Invite user leaves them. */
async function invite(email: string) {
  await sql(
    `insert into auth.users (id, aud, role, email, invited_at)
     values ($1, 'authenticated', 'authenticated', $2, now())`,
    [AUTH_ID, email],
  );
}

/** The refusal's sentence, with the transaction carrying on after it. */
async function refusal(text: string, values: unknown[] = []): Promise<string> {
  await sql('savepoint attempt');
  try {
    await sql(text, values);
    return '';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await sql('rollback to savepoint attempt');
  }
}

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(() => sql('begin'));
afterEach(() => sql('rollback'));

describe("a new office's starting rows (#177)", () => {
  it('writes each slice’s empty() as rows, but for the staff, and nothing else', async () => {
    await freshTables(text => sql(text));
    for (const { slice, rows } of startingRows()) {
      for (const [table, expected] of Object.entries(rows)) {
        const { rows: stored } = await sql(`select to_jsonb(t) as row from public.${table} t`);
        expect(sorted(stored.map(r => r.row)), `${slice.id}: ${table}`).toEqual(sorted(expected));
      }
    }
    expect(STARTING_TABLES).toEqual([
      'programs',
      'settings',
      'reminder_defaults',
      'checklist_templates',
      'checklist_template_items',
      'quickbooks_connection',
    ]);
    const { rows } = await sql(
      `select (select count(*) from public.staff)::int as staff,
              (select count(*) from public.logins)::int as logins`,
    );
    expect(rows[0]).toEqual({ staff: 0, logins: 0 });
  });
});

describe('the first Admin (#177)', () => {
  it('makes their record and login once they are invited, and they can save a change', async () => {
    await invite('Nina.Ortiz@example.org');
    const { rows } = await sql(`select setup.add_first_admin($1, $2, $3) as id`, [
      ' nina.ortiz@example.org ',
      ' Nina Ortiz ',
      'Executive Director',
    ]);
    const id: string = rows[0].id;
    expect(id).toMatch(/^s-[0-9a-f]{32}$/);
    const { rows: staff } = await sql(
      `select name, title, role, teaches, email, archived_at from public.staff where id = $1`,
      [id],
    );
    expect(staff).toEqual([
      {
        name: 'Nina Ortiz',
        title: 'Executive Director',
        role: 'admin',
        teaches: false,
        email: 'nina.ortiz@example.org',
        archived_at: null,
      },
    ]);
    const { rows: logins } = await sql(
      `select auth_user_id, invited_by, accepted_at from public.logins where staff_id = $1`,
      [id],
    );
    expect(logins).toEqual([{ auth_user_id: AUTH_ID, invited_by: id, accepted_at: null }]);

    // Signed in, the first change that points at a starting program goes through (#177's why).
    await sql(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: AUTH_ID, role: 'authenticated' }),
    ]);
    await sql('set local role authenticated');
    const project = {
      id: 'prj-first',
      name: 'Spring concert',
      program_id: 'studio-sessions',
      start_date: '2027-03-01',
      end_date: '2027-05-31',
      budget: 1500,
      archived_at: null,
      archived_by: null,
    };
    await sql('select public.apply($1, $2::jsonb)', [
      'core',
      JSON.stringify(diffRows({ projects: ['id'] }, {}, { projects: [project] })),
    ]);
    const { rows: saved } = await sql(
      `select program_id from public.projects where id = 'prj-first'`,
    );
    expect(saved).toEqual([{ program_id: 'studio-sessions' }]);
  });

  it('refuses someone nobody has invited', async () => {
    expect(
      await refusal(`select setup.add_first_admin('nobody@example.org', 'No One', 'Director')`),
    ).toBe('Nobody is invited as nobody@example.org yet. Invite them from Authentication first.');
  });

  it('refuses once the office has a sign-in', async () => {
    await invite('nina.ortiz@example.org');
    await sql(`select setup.add_first_admin('nina.ortiz@example.org', 'Nina Ortiz', 'Director')`);
    expect(
      await refusal(
        `select setup.add_first_admin('nina.ortiz@example.org', 'Nina Ortiz', 'Director')`,
      ),
    ).toBe('The office already has a sign-in. Invite everyone else from Settings.');
  });

  it('is the database owner’s alone: nobody the REST API signs in may run it', async () => {
    const { rows } = await sql(
      `select r.rolname as role,
              has_schema_privilege(r.rolname, 'setup', 'usage') as schema,
              has_function_privilege(r.rolname, 'setup.add_first_admin(text, text, text)', 'execute')
                as function
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')
        order by r.rolname`,
    );
    expect(rows).toEqual([
      { role: 'anon', schema: false, function: false },
      { role: 'authenticated', schema: false, function: false },
      { role: 'service_role', schema: false, function: false },
    ]);
  });
});
