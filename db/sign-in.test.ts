import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  arrivalFrom,
  choosePassword,
  sendPasswordReset,
  signInWithEmail,
  sessionRefused,
  whoSignedIn,
} from '../src/core/supabaseAuth';

/**
 * Sign-in through Supabase (#160; decision 0009) against the local Supabase, with the browser's
 * own functions (src/core/supabaseAuth.ts) and the publishable key: who an account is
 * (`public.signed_in_staff()`), signing in with an email and password, an account with no login
 * and an archived person refused, an invitation's link (#157) choosing the first password, and
 * a reset email's link choosing a new one. Mailpit catches the emails.
 *
 * Every id and address carries this run's suffix, and everything it made is removed afterwards.
 */

function localStack(): Record<string, string> {
  const env = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const vars: Record<string, string> = {};
  for (const m of env.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)) vars[m[1]] = m[2];
  if (!vars.API_URL) throw new Error('No local Supabase: run `supabase start` first.');
  return vars;
}

const stack = localStack();
const API = stack.API_URL;
const KEY = stack.PUBLISHABLE_KEY ?? stack.ANON_KEY;
const MAILPIT = stack.MAILPIT_URL ?? stack.INBUCKET_URL;
const admin = createClient(API, stack.SECRET_KEY ?? stack.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? stack.DB_URL });

const run = Date.now().toString(36);
const id = (name: string) => `sgn-${name}-${run}`;
const address = (name: string) => `sgn-${name}-${run}@example.org`;
const PASSWORD = 'sign-in-test-37';
/** Where the emailed links come back to: the dev server, on the redirect allow list. */
const PORTAL = 'http://localhost:5181/';

/** A browser-like client: the publishable key, a session of its own, kept in memory. */
function browser(): SupabaseClient {
  return createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(name: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = browser();
  const { error } = await client.auth.signInWithPassword({ email: address(name), password });
  if (error) throw error;
  return client;
}

async function makeUser(name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: address(name),
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

/** The newest email Mailpit caught for an address with this subject, waiting for it. */
async function emailTo(email: string, subject: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"${subject}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
      return ((await message.json()) as { HTML: string }).HTML;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No "${subject}" email reached ${email}.`);
}

/** Follow an emailed link as the browser would: where Supabase sends the person back to. */
async function follow(html: string): Promise<URL> {
  const link = /href="([^"]+)"/.exec(html)![1].replaceAll('&amp;', '&');
  const res = await fetch(link, { redirect: 'manual' });
  return new URL(res.headers.get('location')!);
}

/** A client holding the session the link's address carries. */
async function sessionFrom(back: URL): Promise<SupabaseClient> {
  const params = new URLSearchParams(back.hash.slice(1));
  const client = browser();
  const { error } = await client.auth.setSession({
    access_token: params.get('access_token')!,
    refresh_token: params.get('refresh_token')!,
  });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  await db.connect();
  const staff: [string, string, boolean][] = [
    ['admin', 'admin', false],
    ['teacher', 'teacher', false],
    ['gone', 'bookkeeper', true],
    ['new', 'office-manager', false],
  ];
  for (const [name, role, archived] of staff) {
    await db.query(
      `insert into public.staff (id, name, title, role, teaches, email, archived_at)
       values ($1, $2, 'Staff', $3, false, $4, $5)`,
      [id(name), `Person ${name}`, role, address(name), archived ? '2026-10-01' : null],
    );
  }
  for (const name of ['admin', 'teacher', 'gone']) {
    const user = await makeUser(name);
    await db.query(
      `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
       values ($1, $2, $2, now(), now())`,
      [user, id(name)],
    );
  }
  await makeUser('stranger');
});

afterAll(async () => {
  const ids = `sgn-%-${run}`;
  await db.query(
    `delete from public.activity
      where subject_kind = 'staff' and (subject_id like $1 or who_id like $1)`,
    [ids],
  );
  await db.query('delete from public.logins where staff_id like $1', [ids]);
  await db.query('delete from auth.users where email like $1', [`sgn-%-${run}@example.org`]);
  await db.query('delete from public.staff where id like $1', [ids]);
  await db.end();
});

describe('signed_in_staff()', () => {
  it('answers with the staff record behind the login', async () => {
    const client = await signedIn('teacher');
    expect(await whoSignedIn(client)).toEqual({ staffId: id('teacher') });
  });

  it('says an archived record is archived, and a user with no login has no staff record', async () => {
    expect(await whoSignedIn(await signedIn('gone'))).toEqual({ refusal: 'archived' });
    expect(await whoSignedIn(await signedIn('stranger'))).toEqual({ refusal: 'no-staff' });
  });

  it('answers nobody signed out', async () => {
    const { error } = await browser().rpc('signed_in_staff');
    expect(error?.code).toBe('42501');
  });

  it('is security definer with a fixed search_path, for authenticated only', async () => {
    const { rows } = await db.query(
      `select prosecdef as definer, proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p where oid = 'public.signed_in_staff()'::regprocedure`,
    );
    expect(rows).toEqual([
      { definer: true, config: ['search_path=""'], anon: false, authenticated: true },
    ]);
  });
});

describe('signing in with an email and password', () => {
  it('signs in as the staff record, whatever the case of the address', async () => {
    const client = browser();
    const result = await signInWithEmail(client, ` ${address('teacher').toUpperCase()} `, PASSWORD);
    expect(result).toEqual({ ok: true, staffId: id('teacher'), email: address('teacher') });
    expect((await client.auth.getSession()).data.session).not.toBeNull();
  });

  it('a wrong password, or an address with no account, is a mismatch', async () => {
    expect(await signInWithEmail(browser(), address('teacher'), 'not-it')).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(await signInWithEmail(browser(), address('nobody'), PASSWORD)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('refuses an archived person and a user with no login, and leaves no session', async () => {
    for (const [name, reason] of [
      ['gone', 'archived'],
      ['stranger', 'no-staff'],
    ] as const) {
      const client = browser();
      expect(await signInWithEmail(client, address(name), PASSWORD)).toEqual({ ok: false, reason });
      expect((await client.auth.getSession()).data.session).toBeNull();
    }
  });

  it('signing out ends the session for the database too', async () => {
    const client = await signedIn('teacher');
    const token = (await client.auth.getSession()).data.session!.access_token;
    await client.auth.signOut({ scope: 'local' });
    expect((await client.auth.getSession()).data.session).toBeNull();
    // The refresh token is revoked: the session cannot be renewed.
    const refreshed = await fetch(`${API}/auth/v1/user`, {
      headers: { apikey: KEY, Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(refreshed.status);
  });

  it('a token the database will not take is one the repository signs out on', async () => {
    const res = await fetch(`${API}/rest/v1/staff?select=id`, {
      headers: { apikey: KEY, Authorization: 'Bearer not-a-token' },
    });
    const body = (await res.json()) as { code: string; message: string };
    expect(res.status).toBe(401);
    expect(sessionRefused(body)).toBe(true);
  });
});

describe('an invitation: choosing the first password', () => {
  let back: URL;

  it('the invitation link comes back to the portal as an invitation', async () => {
    const asAdmin = await signedIn('admin');
    const { error } = await asAdmin.functions.invoke('invite-staff', {
      body: { staffId: id('new'), redirectTo: PORTAL },
    });
    expect(error).toBeNull();
    back = await follow(await emailTo(address('new'), "You're invited"));
    expect(back.origin + back.pathname).toBe(PORTAL);
    expect(arrivalFrom(back.hash, back.search)).toEqual({ kind: 'invite' });
  });

  it('they choose a password, then sign out and sign in with it', async () => {
    const client = await sessionFrom(back);
    expect(await whoSignedIn(client)).toEqual({ staffId: id('new') });
    expect(await choosePassword(client, 'chosen-41', 'chosen-42')).toBe(
      'The two passwords don’t match.',
    );
    expect(await choosePassword(client, 'abc', 'abc')).toMatch(/at least 6 characters/);
    expect(await choosePassword(client, 'chosen-by-them-41', 'chosen-by-them-41')).toBeNull();
    await client.auth.signOut({ scope: 'local' });

    const again = browser();
    expect(await signInWithEmail(again, address('new'), 'chosen-by-them-41')).toMatchObject({
      ok: true,
      staffId: id('new'),
    });
    const { rows } = await db.query('select accepted_at from public.logins where staff_id = $1', [
      id('new'),
    ]);
    expect(rows[0].accepted_at).not.toBeNull();
  });

  it('the same link a second time is a link that failed', async () => {
    const reused = await follow(await emailTo(address('new'), "You're invited"));
    expect(arrivalFrom(reused.hash, reused.search)).toEqual({ kind: 'link-failed' });
  });
});

describe('forgot your password', () => {
  it('sends the reset email, whose link lets them choose a new password', async () => {
    expect(await sendPasswordReset(browser(), address('teacher'), PORTAL)).toBeNull();
    const html = await emailTo(address('teacher'), 'Choose a new password');
    expect(html).toMatch(/Choose a new password/);
    const back = await follow(html);
    expect(arrivalFrom(back.hash, back.search)).toEqual({ kind: 'recovery' });

    const client = await sessionFrom(back);
    expect(await choosePassword(client, 'brand-new-55', 'brand-new-55')).toBeNull();
    expect(await signInWithEmail(browser(), address('teacher'), PASSWORD)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(await signInWithEmail(browser(), address('teacher'), 'brand-new-55')).toMatchObject({
      ok: true,
    });
  });

  it('answers the same for an address with no account', async () => {
    expect(await sendPasswordReset(browser(), address('nobody'), PORTAL)).toBeNull();
  });
});
