// Sign-in through Supabase (#160), in the running app against the local Supabase. Skipped unless
// E2E_SUPABASE=1: `npm run test:e2e` runs the demo, which keeps its fixed logins. To run it, start
// the local Supabase (`supabase start`, then `supabase db reset` so the tables are empty), start
// the dev server on it with the demo off, and point Playwright at that server:
//
//   VITE_DEMO=0 VITE_SUPABASE_URL=<API_URL> VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY> npm run dev
//   E2E_SUPABASE=1 npx playwright test e2e/supabase-sign-in.spec.ts
//
// (both on the same PORT; Playwright reuses the server it finds there). The spec writes a new
// office's starting rows and Gwen's sign-in, then: Gwen (Admin) invites Keisha (Office manager);
// Keisha opens the emailed link, chooses a password, signs out and in again, adds a venue that
// saves through apply(), forgets her password and chooses a new one from the reset email; a
// session the database no longer takes returns to sign-in. Afterwards every table it wrote, and
// the accounts, are emptied again.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import pg from 'pg';
import { diffRows } from '../src/core/diff';
import { makeCoreEmpty } from '../src/core/seed';
import { coreTables } from '../src/core/tables';
import { dialog, field } from './support';

const on = process.env.E2E_SUPABASE === '1';
test.skip(!on, 'E2E_SUPABASE is not set: the sign-in through Supabase needs the local Supabase');
test.describe.configure({ mode: 'serial' });

function localStack(): Record<string, string> {
  const env = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const vars: Record<string, string> = {};
  for (const m of env.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)) vars[m[1]] = m[2];
  return vars;
}

const stack = on ? localStack() : {};
const GWEN = { email: 'gwen.kimura@example.org', password: 'gwen-e2e-160' };
const KEISHA = 'keisha.monroe@example.org';
let db: pg.Client;
let tables: string[] = [];
/** The starting rows found before the test, by table. */
const starting = new Map<string, unknown[]>();

/** The newest email Mailpit caught for an address with this subject. */
async function linkIn(to: string, subject: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
    const res = await fetch(`${stack.MAILPIT_URL}/api/v1/search?query=${query}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${stack.MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      return /href="([^"]+)"/.exec(HTML)![1].replaceAll('&amp;', '&');
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No "${subject}" email reached ${to}.`);
}

async function signIn(page: Page, email: string, password: string) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test.beforeAll(async () => {
  db = new pg.Client({ connectionString: stack.DB_URL });
  await db.connect();
  // As `supabase db reset` leaves it: nobody on the staff yet, only a new office's starting rows
  // (#177), which are kept to write back afterwards.
  const { rows: found } = await db.query<{ name: string }>(
    `select format('public.%I', tablename) as name from pg_tables where schemaname = 'public'`,
  );
  tables = found.map(t => t.name);
  for (const name of tables) {
    const { rows } = await db.query(`select coalesce(jsonb_agg(t), '[]') as rows from ${name} t`);
    if (rows[0].rows.length > 0) starting.set(name, rows[0].rows);
  }
  for (const name of ['public.staff', 'public.logins']) {
    if (starting.has(name)) throw new Error(`${name} is not empty: run \`supabase db reset\`.`);
  }
  // The browser's empty office (decision 0004) on top of the starting rows, which are its rows but
  // for the staff: its sign-in people, Gwen and Keisha among them, and Gwen's accepted sign-in.
  await db.query('begin');
  await db.query('set local role service_role');
  const rows = coreTables.toRows(makeCoreEmpty());
  await db.query('select public.apply($1, $2::jsonb)', [
    'core',
    JSON.stringify(diffRows(coreTables.keys, { ...rows, staff: [] }, rows)),
  ]);
  await db.query('commit');
  const res = await fetch(`${stack.API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: stack.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...GWEN, email_confirm: true }),
  });
  const user = (await res.json()) as { id: string };
  await db.query(
    `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
     values ($1, 's-gwen', 's-gwen', now(), now())`,
    [user.id],
  );
});

test.afterAll(async () => {
  if (!db) return;
  if (tables.length) {
    // Every table emptied, then the starting rows written back as they were found, with the
    // triggers and links off so the order does not matter.
    await db.query('begin');
    await db.query(`truncate ${tables.join(', ')}`);
    await db.query('set local session_replication_role = replica');
    for (const [name, rows] of starting) {
      await db.query(
        `insert into ${name} select * from jsonb_populate_recordset(null::${name}, $1)`,
        [JSON.stringify(rows)],
      );
    }
    await db.query('commit');
  }
  await db.query('delete from auth.users where email in ($1, $2)', [GWEN.email, KEISHA]);
  await db.end();
});

test('an Admin invites someone, who chooses a password, signs in again and saves', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, GWEN.email, 'not-it');
  await expect(page.getByText('That email and password don’t match.')).toBeVisible();
  await signIn(page, GWEN.email, GWEN.password);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/settings');
  // DataTable's rows are grids of divs: the innermost one holding Keisha's name and her link.
  const keishaRow = page
    .locator('main div')
    .filter({ has: page.getByText('Keisha Monroe', { exact: true }) })
    .filter({ has: page.getByText('Office manager', { exact: true }) })
    .last();
  await keishaRow.getByRole('link', { name: 'Send invitation' }).click();
  await dialog(page, 'Invite Keisha Monroe?')
    .getByRole('button', { name: 'Send invitation' })
    .click();
  await expect(keishaRow.getByText('Invited')).toBeVisible();
  await signOut(page);

  // Keisha opens the invitation.
  await page.goto(await linkIn(KEISHA, "You're invited"));
  await expect(page.getByRole('heading', { name: 'Choose a password' })).toBeVisible();
  await expect(page.getByText(KEISHA)).toBeVisible();
  // A reload asks again: nobody gets in without choosing one.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a password' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('keisha-chosen-1');
  await page.getByLabel('Password again').fill('keisha-chosen-1');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('nav, aside').getByText('Keisha Monroe').first()).toBeVisible();
  await signOut(page);

  await signIn(page, KEISHA, 'keisha-chosen-1');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // A change saves through apply(), as Keisha.
  await page.goto('/partners');
  await page.getByRole('button', { name: 'Add venue' }).first().click();
  const venue = dialog(page, 'Add venue');
  await field(venue, 'Name').fill('Jazz Angels Studio');
  await field(venue, 'Kind', 'select').selectOption('studio');
  await venue.getByRole('button', { name: 'Add venue' }).click();
  await expect(page.locator('main').getByText('Jazz Angels Studio').first()).toBeVisible();
  await expect
    .poll(async () => (await db.query('select name from public.venues')).rows)
    .toEqual([{ name: 'Jazz Angels Studio' }]);
  await page.reload();
  await expect(page.locator('main').getByText('Jazz Angels Studio').first()).toBeVisible();
  await signOut(page);
});

test('forgot your password: the reset email lets them choose a new one', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(KEISHA);
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await dialog(page, 'Reset your password').getByRole('button', { name: 'Send link' }).click();
  await expect(dialog(page, 'Check your email')).toContainText(`If ${KEISHA} has a sign-in`);

  await page.goto(await linkIn(KEISHA, 'Choose a new password'));
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('keisha-chosen-2');
  await page.getByLabel('Password again').fill('keisha-chosen-2');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await signOut(page);

  await signIn(page, KEISHA, 'keisha-chosen-1');
  await expect(page.getByText('That email and password don’t match.')).toBeVisible();
  await signIn(page, KEISHA, 'keisha-chosen-2');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('an archived person is refused, and a session the database refuses returns to sign-in', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, KEISHA, 'keisha-chosen-2');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // The stored session's token is no longer one the database takes.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k))!;
    const saved = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...saved, access_token: 'not-a-token' }));
  });
  await page.reload();
  await expect(
    page.getByText('You were signed out because your session ended. Sign in again to carry on.'),
  ).toBeVisible();

  await db.query(
    `update public.staff set archived_at = '2026-10-01', archived_by = 's-gwen' where id = 's-keisha'`,
  );
  await signIn(page, KEISHA, 'keisha-chosen-2');
  await expect(
    page.getByText('This sign-in belongs to someone who is no longer on the staff.'),
  ).toBeVisible();
  await db.query(
    `update public.staff set archived_at = null, archived_by = null where id = 's-keisha'`,
  );
});
