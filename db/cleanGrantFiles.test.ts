import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diffRows } from '../src/core/diff';
import type { ModuleSlice } from '../src/core/module';
import { makeCoreSeed } from '../src/core/seed';
import { coreSlice } from '../src/core/store';
import type { PortalState } from '../src/core/types';
import { grantsSlice, makeSeed as grantsSeed } from '../src/modules/grants/domain';
import { teachingSlice, makeSeed as teachingSeed } from '../src/modules/teaching/domain';
import { timesheetsSlice, makeSeed as timesheetsSeed } from '../src/modules/timesheets/domain';
import { freshTables, restoreStartingRows, startingRowsOf } from './startingRows';

/**
 * The clean-up of grant-file objects no row points to (#175), against the local Supabase: the
 * `clean-grant-files` Edge Function removes an orphaned object older than its grace period, and
 * leaves alone an object whose row exists, a fresh one, and anything in `office-documents`; only
 * the secret key runs it; and the pg_cron job reaches it through pg_net once the project's address
 * and key are in Vault.
 *
 * Objects are uploaded with the secret key (past the row rules) and aged by moving their
 * `created_at` back, the time the clean-up judges by. As in db/fileContents.test.ts, the demo's
 * rows go in first and everything is left as a reset leaves it after.
 */

const ROOT = new URL('..', import.meta.url);

function status(): Record<string, string> {
  const env = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const out: Record<string, string> = {};
  for (const [, key, value] of env.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)) out[key] = value;
  if (!out.API_URL) throw new Error('No local Supabase: run `supabase start` first.');
  return out;
}

const env = status();
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? env.DB_URL });
const admin = createClient(env.API_URL, env.SECRET_KEY, { auth: { persistSession: false } });
const FUNCTION = `${env.API_URL}/functions/v1/clean-grant-files`;

const SLICES = [coreSlice, grantsSlice, teachingSlice, timesheetsSlice] as unknown as Array<
  ModuleSlice<unknown, unknown>
>;
const demo = (): PortalState =>
  ({
    core: makeCoreSeed(),
    grants: grantsSeed(),
    teaching: teachingSeed(),
    timesheets: timesheetsSeed(),
  }) as unknown as PortalState;

let tables: string[] = [];
/** A grant file's id from the demo: its row stays for the whole file. */
let withRow = '';

const pdf = (text: string) => new Blob([`%PDF-1.4\n${text}\n%%EOF`], { type: 'application/pdf' });

async function put(bucket: string, name: string, ageHours = 0): Promise<void> {
  const { error } = await admin.storage
    .from(bucket)
    .upload(name, pdf(name), { contentType: 'application/pdf' });
  if (error) throw error;
  if (ageHours > 0) {
    await db.query(
      `update storage.objects set created_at = now() - make_interval(hours => $3)
        where bucket_id = $1 and name = $2`,
      [bucket, name, ageHours],
    );
  }
}

async function stored(bucket: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `select name from storage.objects where bucket_id = $1 order by name`,
    [bucket],
  );
  return rows.map(r => r.name);
}

async function run(headers: Record<string, string>) {
  const res = await fetch(FUNCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function empty(): Promise<void> {
  for (const bucket of ['grant-files', 'office-documents']) {
    const { data } = await admin.storage.from(bucket).list('', { limit: 1000 });
    if (data?.length) await admin.storage.from(bucket).remove(data.map(o => o.name));
  }
}

beforeAll(async () => {
  await db.connect();
  const found = await freshTables(text => db.query(text));
  const { rows: objects } = await db.query(`select count(*)::int as n from storage.objects`);
  if (objects[0].n > 0) throw new Error('storage.objects is not empty: run `supabase db reset`.');
  tables = found;
  await db.query('begin');
  await db.query('set local role service_role');
  const start = demo() as unknown as Record<string, unknown>;
  for (const slice of SLICES) {
    const all = slice.tables.toRows(start[slice.id]) as Record<string, object[]>;
    const rows = all.budget_versions
      ? { ...all, budget_versions: all.budget_versions.map(v => ({ ...v, added_by: 's-barry' })) }
      : all;
    await db.query('select public.apply($1, $2::jsonb)', [
      slice.id,
      JSON.stringify(diffRows(slice.tables.keys, startingRowsOf(slice.id), rows as never)),
    ]);
  }
  await db.query('commit');
  const { rows } = await db.query<{ id: string }>(`select id from public.grant_files limit 1`);
  withRow = rows[0].id;
}, 60_000);

afterAll(async () => {
  await db.query(`delete from vault.secrets where name in ('project_url', 'secret_key')`);
  if (tables.length) {
    await empty();
    await db.query(`truncate ${tables.join(', ')}`);
    await restoreStartingRows((text, values) => db.query(text, values));
  }
  await db.end();
});

describe('cleaning up grant-file objects no row points to (#175)', () => {
  it('removes an orphan past the grace period, and keeps one with a row, a fresh one and office documents', async () => {
    await put('grant-files', withRow, 72);
    await put('grant-files', 'file-orphan-old', 25);
    await put('grant-files', 'file-orphan-fresh');
    await put('grant-files', 'file-orphan-almost', 23);
    await put('office-documents', 'docv-orphan-old', 72);

    const { status: code, body } = await run({ apikey: env.SECRET_KEY });
    expect(code).toBe(200);
    expect(body).toEqual({ ok: true, checked: 4, removed: ['file-orphan-old'] });

    expect(await stored('grant-files')).toEqual(
      ['file-orphan-almost', 'file-orphan-fresh', withRow].sort(),
    );
    expect(await stored('office-documents')).toEqual(['docv-orphan-old']);
    // Gone from Storage itself, not only from its table.
    const { error } = await admin.storage.from('grant-files').download('file-orphan-old');
    expect(error).not.toBeNull();
    const kept = await admin.storage.from('grant-files').download(withRow);
    expect(kept.error).toBeNull();

    // Run again: nothing more to remove.
    expect((await run({ apikey: env.SECRET_KEY })).body.removed).toEqual([]);
  });

  it('runs only with the secret key', async () => {
    await put('grant-files', 'file-orphan-guarded', 48);
    const refused: Array<Record<string, string>> = [
      {},
      { apikey: env.PUBLISHABLE_KEY },
      { apikey: env.PUBLISHABLE_KEY, Authorization: `Bearer ${env.ANON_KEY}` },
      { apikey: 'sb_secret_not-the-key' },
    ];
    for (const headers of refused) {
      expect((await run(headers)).status).toBe(401);
    }
    expect(await stored('grant-files')).toContain('file-orphan-guarded');
  });

  it('is scheduled with pg_cron, and the job reaches the function once Vault has the address and key', async () => {
    const { rows: jobs } = await db.query(
      `select schedule, command, active from cron.job where jobname = 'clean-grant-files'`,
    );
    expect(jobs).toEqual([
      { schedule: '17 3 * * *', command: 'select jobs.clean_grant_files()', active: true },
    ]);

    // Nobody signed in may ring it.
    const { rows: grants } = await db.query(
      `select has_function_privilege('anon', 'jobs.clean_grant_files()', 'execute') as anon,
              has_function_privilege('authenticated', 'jobs.clean_grant_files()', 'execute')
                as authenticated,
              has_schema_privilege('authenticated', 'jobs', 'usage') as schema`,
    );
    expect(grants[0]).toEqual({ anon: false, authenticated: false, schema: false });

    // Without the project's address and key in Vault, the job does nothing.
    const { rows: none } = await db.query(`select jobs.clean_grant_files() as id`);
    expect(none[0].id).toBeNull();

    // With them, as a hosted project has (#162): the gateway's address inside Docker.
    await db.query(`select vault.create_secret('http://kong:8000', 'project_url')`);
    await db.query(`select vault.create_secret($1, 'secret_key')`, [env.SECRET_KEY]);
    const { rows: sent } = await db.query<{ id: string }>(`select jobs.clean_grant_files() as id`);
    expect(sent[0].id).not.toBeNull();

    let response: { status_code: number; content: string } | undefined;
    for (let i = 0; i < 60 && !response; i++) {
      await new Promise(r => setTimeout(r, 500));
      const { rows } = await db.query(
        `select status_code, content from net._http_response where id = $1`,
        [sent[0].id],
      );
      response = rows[0];
    }
    expect(response?.status_code).toBe(200);
    expect(JSON.parse(response!.content).removed).toEqual(['file-orphan-guarded']);
    expect(await stored('grant-files')).not.toContain('file-orphan-guarded');
  }, 60_000);
});
