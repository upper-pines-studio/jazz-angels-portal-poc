import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diffRows, diffSlice } from '../src/core/diff';
import { removeContents, signedUrl, uploadContents } from '../src/core/fileContents';
import type { ModuleSlice } from '../src/core/module';
import { makeCoreSeed } from '../src/core/seed';
import { coreSlice } from '../src/core/store';
import { supabaseRepository } from '../src/core/supabaseRepository';
import type { PortalState, Role } from '../src/core/types';
import { grantsSlice, makeSeed as grantsSeed } from '../src/modules/grants/domain';
import { teachingSlice, makeSeed as teachingSeed } from '../src/modules/teaching/domain';
import { timesheetsSlice, makeSeed as timesheetsSeed } from '../src/modules/timesheets/domain';
import { freshTables, restoreStartingRows, startingRowsOf } from './startingRows';

/**
 * File contents in Storage (#161) against the local Supabase: a permitted role uploads a grant
 * file's and an office document version's bytes and reads back the same bytes through a signed
 * link; a role the rules refuse gets an error, on upload and on open; an office document
 * version's object is added once and never replaced or removed; and a grant file's object is
 * removed while its row still exists, before the row is deleted.
 *
 * As in db/repository.test.ts the rows are committed (the REST API answers on its own
 * connections), so the demo goes in first and every table is left as a reset leaves it after.
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

const PASSWORD = 'file-contents-test-47';
const PEOPLE = {
  's-keisha': 'office-manager',
  's-albert': 'teacher',
  's-margaret': 'read-only',
} as const satisfies Record<string, Role>;
type Who = keyof typeof PEOPLE;
const emailOf = (who: Who) => `${who}@file-contents-test.example.org`;

const SLICES = [coreSlice, grantsSlice, teachingSlice, timesheetsSlice] as unknown as Array<
  ModuleSlice<unknown, unknown>
>;
const TODAY = '2026-09-20';
const demo = (): PortalState =>
  ({
    core: makeCoreSeed(),
    grants: grantsSeed(),
    teaching: teachingSeed(),
    timesheets: timesheetsSeed(),
  }) as unknown as PortalState;

const clients = {} as Record<Who, SupabaseClient>;
const userIds: string[] = [];
let tables: string[] = [];
let ids = 0;

async function signIn(who: Who): Promise<SupabaseClient> {
  const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: emailOf(who),
    password: PASSWORD,
  });
  if (error) throw error;
  return client;
}

/** A small, valid PDF-shaped file: Storage checks the type the upload declares, not the bytes. */
const bytes = (text: string) => new Blob([`%PDF-1.4\n${text}\n%%EOF`], { type: 'application/pdf' });

async function read(url: string): Promise<string> {
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  return res.text();
}

/** Add a grant file's row (a "File" on the first grant) through the repository, as `who`. */
async function addGrantFileRow(who: Who): Promise<string> {
  const repo = supabaseRepository(clients[who]);
  const before = (await repo.load(grantsSlice as never, TODAY, false)) as PortalState['grants'];
  const grant = before.grants.find(g => !g.archivedAt)!;
  const id = `file-fc${++ids}`;
  const row = {
    id,
    grantId: grant.id,
    kind: 'other' as const,
    name: `scan-${ids}.pdf`,
    format: 'pdf' as const,
    sizeKb: 1,
    pages: 1,
    uploadedById: who,
    uploadedAt: TODAY,
  };
  const next = { ...before, files: [...before.files, row] };
  const rows = diffSlice(grantsSlice.tables as never, before as never, next as never);
  await repo.apply({ sliceId: 'grants', action: { type: 'grants/add-file' }, rows, next });
  return id;
}

/** Add a version of the first office document through the repository, as `who`. */
async function addVersionRow(who: Who): Promise<string> {
  const repo = supabaseRepository(clients[who]);
  const before = (await repo.load(coreSlice as never, TODAY, false)) as PortalState['core'];
  const doc = before.officeDocuments.find(d => !d.archivedAt)!;
  const id = `docv-fc${++ids}`;
  const version = {
    id,
    number: Math.max(0, ...doc.versions.map(v => v.number)) + 1,
    name: `letter-${ids}.pdf`,
    format: 'pdf' as const,
    sizeKb: 1,
    pages: 1,
    addedById: who,
    addedAt: TODAY,
  };
  const next = {
    ...before,
    officeDocuments: before.officeDocuments.map(d =>
      d.id === doc.id ? { ...d, versions: [...d.versions, version] } : d,
    ),
  };
  const rows = diffSlice(coreSlice.tables as never, before as never, next as never);
  await repo.apply({ sliceId: 'core', action: { type: 'core/add-version' }, rows, next });
  return id;
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
  for (const who of Object.keys(PEOPLE) as Who[]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailOf(who),
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userIds.push(data.user.id);
    await db.query(
      `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
       values ($1, $2, 's-gwen', now(), now())`,
      [data.user.id, who],
    );
    clients[who] = await signIn(who);
  }
}, 60_000);

afterAll(async () => {
  if (tables.length) {
    // Objects go through Storage's own API; the tables then hold only the starting rows.
    for (const bucket of ['grant-files', 'office-documents']) {
      const { data } = await admin.storage.from(bucket).list('', { limit: 1000 });
      if (data?.length) await admin.storage.from(bucket).remove(data.map(o => o.name));
    }
    await db.query(`truncate ${tables.join(', ')}`);
    await restoreStartingRows((text, values) => db.query(text, values));
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await db.end();
});

describe('file contents in Supabase Storage (#161)', () => {
  it('uploads a grant file as a permitted role and reads back the same bytes', async () => {
    const id = await addGrantFileRow('s-keisha');
    const problem = await uploadContents(
      'grant-files',
      id,
      bytes('award letter'),
      'pdf',
      clients['s-keisha'],
    );
    expect(problem).toBeUndefined();

    // Another session of the same person, as after a reload or in another browser.
    const reopened = await signIn('s-keisha');
    const link = await signedUrl('grant-files', id, {}, reopened);
    if (!('url' in link)) throw new Error(link.error);
    expect(await read(link.url)).toBe('%PDF-1.4\naward letter\n%%EOF');

    // Read-only may read it too, as it may read the row.
    const margaret = await signedUrl('grant-files', id, {}, clients['s-margaret']);
    expect('url' in margaret).toBe(true);
  });

  it('refuses a role that may not change the grant file, and a role that may not see it', async () => {
    const id = await addGrantFileRow('s-keisha');
    // Read-only can read the row but not update it: the upload is refused with a sentence.
    const refused = await uploadContents(
      'grant-files',
      id,
      bytes('nope'),
      'pdf',
      clients['s-margaret'],
    );
    expect(refused).toBe('Your role may not add this file.');
    // Nothing was stored, so there is nothing to open.
    const none = await signedUrl('grant-files', id, {}, clients['s-keisha']);
    expect(none).toEqual({ error: expect.stringContaining('could not be opened') });

    // Once it is there, a Teacher, who may not see a grant's files, gets the plain sentence too.
    expect(await uploadContents('grant-files', id, bytes('ok'), 'pdf', clients['s-keisha'])).toBe(
      undefined,
    );
    const teacher = await signedUrl('grant-files', id, {}, clients['s-albert']);
    expect(teacher).toEqual({ error: expect.stringContaining('could not be opened') });
  });

  it('uploads an office document version once, reads it back, and never replaces or removes it', async () => {
    const id = await addVersionRow('s-keisha');
    expect(
      await uploadContents('office-documents', id, bytes('irs'), 'pdf', clients['s-keisha']),
    ).toBeUndefined();

    const reopened = await signIn('s-keisha');
    const link = await signedUrl('office-documents', id, {}, reopened);
    if (!('url' in link)) throw new Error(link.error);
    expect(await read(link.url)).toBe('%PDF-1.4\nirs\n%%EOF');

    // Added once: a second upload under the same name is refused, and the bytes stay.
    const again = await uploadContents(
      'office-documents',
      id,
      bytes('other'),
      'pdf',
      clients['s-keisha'],
    );
    expect(again).toBeDefined();
    const still = await signedUrl('office-documents', id, {}, clients['s-keisha']);
    if (!('url' in still)) throw new Error(still.error);
    expect(await read(still.url)).toBe('%PDF-1.4\nirs\n%%EOF');

    // No one may remove it: the call reports no error, and the object is still there.
    await clients['s-keisha'].storage.from('office-documents').remove([id]);
    const kept = await signedUrl('office-documents', id, {}, clients['s-keisha']);
    expect('url' in kept).toBe(true);
  });

  it('refuses an office document upload by someone who did not add the version, and by Read-only', async () => {
    const id = await addVersionRow('s-keisha');
    expect(
      await uploadContents('office-documents', id, bytes('x'), 'pdf', clients['s-margaret']),
    ).toBe('Your role may not add this file.');
    // The Teacher may not see office documents at all.
    expect(
      await uploadContents('office-documents', id, bytes('x'), 'pdf', clients['s-albert']),
    ).toBe('Your role may not add this file.');
  });

  it('removes a grant file’s object while its row exists, then the row can go', async () => {
    const id = await addGrantFileRow('s-keisha');
    await uploadContents('grant-files', id, bytes('receipt'), 'pdf', clients['s-keisha']);

    // A role that may not change the row cannot remove the object.
    await removeContents([id], clients['s-margaret']);
    expect('url' in (await signedUrl('grant-files', id, {}, clients['s-keisha']))).toBe(true);

    expect(await removeContents([id], clients['s-keisha'])).toBeUndefined();
    const gone = await signedUrl('grant-files', id, {}, clients['s-keisha']);
    expect('error' in gone).toBe(true);
    const { rows } = await db.query(
      `select count(*)::int as n from storage.objects where name = $1`,
      [id],
    );
    expect(rows[0].n).toBe(0);

    // The row is deleted after, through the repository, as the screen does.
    const repo = supabaseRepository(clients['s-keisha']);
    const before = (await repo.load(grantsSlice as never, TODAY, false)) as PortalState['grants'];
    const next = { ...before, files: before.files.filter(f => f.id !== id) };
    const rowsDiff = diffSlice(grantsSlice.tables as never, before as never, next as never);
    await repo.apply({
      sliceId: 'grants',
      action: { type: 'grants/delete-file' },
      rows: rowsDiff,
      next,
    });
    const after = (await repo.load(grantsSlice as never, TODAY, false)) as PortalState['grants'];
    expect(after.files.some(f => f.id === id)).toBe(false);
  });
});
