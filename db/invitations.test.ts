import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Invitations (#157; decision 0001, "Sign-ins are by invitation"): the `invite-staff` Edge
 * Function, the trigger that accepts an invitation on the first sign-in, the email a login
 * keeps, and who reads the activity lines. Run by `npm run test:db` against the local Supabase,
 * which serves the function and catches its email in Mailpit.
 *
 * Every id and address carries this run's suffix, so the file can run again without a reset, and
 * everything it made is removed afterwards, so the other database tests see only their own rows.
 */

/** What `supabase status` says about the local stack. */
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
const SERVICE = stack.SERVICE_ROLE_KEY;
const ANON = stack.ANON_KEY;
const MAILPIT = stack.MAILPIT_URL ?? stack.INBUCKET_URL;
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? stack.DB_URL });

const run = Date.now().toString(36);
const id = (name: string) => `inv-${name}-${run}`;
const address = (name: string) => `${name}-${run}@example.org`;
const PASSWORD = 'invitation-test-29';

async function makeUser(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const body = (await res.json()) as { id: string };
  if (!res.ok) throw new Error(`Could not make ${email}: ${JSON.stringify(body)}`);
  return body.id as string;
}

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token: string };
  if (!res.ok) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

async function invite(
  token: string | null,
  staffId: string,
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const res = await fetch(`${API}/functions/v1/invite-staff`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ staffId, redirectTo: 'http://localhost:5181/' }),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string },
  };
}

/** The REST API as someone signed in. */
function rest(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

/** The invitation Mailpit caught for an address, waiting a few seconds for it. */
async function invitationTo(email: string): Promise<{ Subject: string; HTML: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
      return (await message.json()) as { Subject: string; HTML: string };
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No email reached ${email}.`);
}

const loginOf = async (staffId: string) =>
  (
    await db.query<{
      auth_user_id: string;
      invited_by: string;
      invited_at: Date;
      accepted_at: Date | null;
    }>('select * from public.logins where staff_id = $1', [staffId])
  ).rows[0];

const linesAbout = async (staffId: string) =>
  (
    await db.query<{ who_id: string; text: string; detail: { event: string } }>(
      `select * from public.activity where subject_kind = 'staff' and subject_id = $1 order by at`,
      [staffId],
    )
  ).rows;

/** Signed-in tokens by who is asking. */
const as: Record<string, string> = {};

beforeAll(async () => {
  await db.connect();
  // People who ask, each with a login; and the records they ask about.
  const staff: [string, string, string | null, boolean][] = [
    ['admin', 'admin', address('admin'), false],
    ['director', 'director', address('director'), false],
    ['office', 'office-manager', address('office'), false],
    ['teacher', 'teacher', address('teacher'), false],
    ['gone-director', 'director', address('gone-director'), true],
    ['new', 'teacher', address('new'), false],
    ['new-admin', 'admin', address('new-admin'), false],
    ['no-email', 'bookkeeper', null, false],
    ['archived', 'bookkeeper', address('archived'), true],
  ];
  for (const [name, role, email, archived] of staff) {
    await db.query(
      `insert into public.staff (id, name, title, role, teaches, email, archived_at)
       values ($1, $2, 'Staff', $3, false, $4, $5)`,
      [id(name), `Person ${name}`, role, email, archived ? '2026-10-01' : null],
    );
  }
  for (const name of ['admin', 'director', 'office', 'teacher', 'gone-director']) {
    const user = await makeUser(address(name));
    await db.query(
      `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
       values ($1, $2, $2, now(), now())`,
      [user, id(name)],
    );
    as[name] = await signIn(address(name));
  }
  await makeUser(address('stranger'));
  as.stranger = await signIn(address('stranger'));
});

afterAll(async () => {
  const ids = `inv-%-${run}`;
  await db.query(
    `delete from public.activity
      where subject_kind = 'staff' and (subject_id like $1 or who_id like $1)`,
    [ids],
  );
  await db.query('delete from public.logins where staff_id like $1', [ids]);
  await db.query('delete from auth.users where email like $1', [`%-${run}@example.org`]);
  await db.query('delete from public.staff where id like $1', [ids]);
  await db.end();
});

describe('invite-staff refuses (decision 0001)', () => {
  it('anyone not signed in', async () => {
    expect((await invite(null, id('new'))).status).toBe(401);
  });

  it('a signed-in user with no staff record', async () => {
    const { status, body } = await invite(as.stranger, id('new'));
    expect(status).toBe(403);
    expect(body.error).toMatch(/isn't tied to a current staff record/);
  });

  it('someone whose staff record is archived', async () => {
    const { status, body } = await invite(as['gone-director'], id('new'));
    expect(status).toBe(403);
    expect(body.error).toMatch(/isn't tied to a current staff record/);
  });

  it.each(['office', 'teacher'])('someone without "Staff and roles": %s', async who => {
    const { status, body } = await invite(as[who], id('new'));
    expect(status).toBe(403);
    expect(body.error).toBe(
      'Only an Admin or a Director sends invitations. Ask one of them to send it.',
    );
  });

  it('a record that is not there', async () => {
    expect((await invite(as.admin, id('nobody'))).status).toBe(404);
  });

  it('an archived record', async () => {
    const { status, body } = await invite(as.admin, id('archived'));
    expect(status).toBe(409);
    expect(body.error).toBe(
      'Person archived is archived. Restore them before sending an invitation.',
    );
  });

  it('a record with no email', async () => {
    const { status, body } = await invite(as.admin, id('no-email'));
    expect(status).toBe(409);
    expect(body.error).toMatch(/has no email yet/);
  });

  it('a record that already has a login', async () => {
    const { status, body } = await invite(as.admin, id('teacher'));
    expect(status).toBe(409);
    expect(body.error).toBe('Person teacher already has a sign-in.');
  });

  it("a Director inviting for an Admin's record", async () => {
    const { status, body } = await invite(as.director, id('new-admin'));
    expect(status).toBe(403);
    expect(body.error).toMatch(/^Only an Admin sends the invitation for an Admin's record/);
  });

  it('and leaves no login, account or activity line behind', async () => {
    expect(await loginOf(id('new-admin'))).toBeUndefined();
    expect(await linesAbout(id('new-admin'))).toEqual([]);
    const { rows } = await db.query('select 1 from auth.users where email = $1', [
      address('new-admin'),
    ]);
    expect(rows).toEqual([]);
  });
});

describe('an invitation that goes', () => {
  it('a Director invites a Teacher: the login, the activity line and the email', async () => {
    const { status, body } = await invite(as.director, id('new'));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const login = await loginOf(id('new'));
    expect(login.invited_by).toBe(id('director'));
    expect(login.accepted_at).toBeNull();
    expect(Date.now() - login.invited_at.getTime()).toBeLessThan(60_000);

    const lines = await linesAbout(id('new'));
    expect(lines).toHaveLength(1);
    expect(lines[0].who_id).toBe(id('director'));
    expect(lines[0].text).toBe(`Sent Person new an invitation to sign in, to ${address('new')}`);
    expect(lines[0].detail.event).toBe('invited');

    const email = await invitationTo(address('new'));
    expect(email.Subject).toBe("You're invited to the Jazz Angels portal");
    expect(email.HTML).toMatch(/Accept the invitation/);
  });

  it('a second invitation for the same record is refused', async () => {
    expect((await invite(as.admin, id('new'))).status).toBe(409);
  });

  it("an Admin invites for an Admin's record", async () => {
    expect((await invite(as.admin, id('new-admin'))).status).toBe(200);
    expect((await loginOf(id('new-admin'))).invited_by).toBe(id('admin'));
  });
});

describe('accepting an invitation', () => {
  let token = '';

  it('following the link signs the person in and sets accepted_at, with its activity line', async () => {
    const email = await invitationTo(address('new'));
    const link = /href="([^"]+)"/.exec(email.HTML)![1].replaceAll('&amp;', '&');
    const res = await fetch(link, { redirect: 'manual' });
    expect(res.status).toBe(303);
    const back = res.headers.get('location')!;
    expect(back.startsWith('http://localhost:5181/')).toBe(true);
    token = new URLSearchParams(back.split('#')[1]).get('access_token')!;
    expect(token).toBeTruthy();

    const login = await loginOf(id('new'));
    expect(login.accepted_at).not.toBeNull();
    const lines = await linesAbout(id('new'));
    expect(lines.map(l => l.detail.event)).toEqual(['invited', 'accepted']);
    expect(lines[1].who_id).toBe(id('new'));
    expect(lines[1].text).toBe(
      'Accepted the invitation from Person director and signed in for the first time',
    );
  });

  it('they choose their own password and sign in with it; nothing more is written', async () => {
    const accepted = (await loginOf(id('new'))).accepted_at;
    const res = await fetch(`${API}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: 'chosen-by-them-41' }),
    });
    expect(res.status).toBe(200);
    await signIn(address('new'), 'chosen-by-them-41');
    expect((await loginOf(id('new'))).accepted_at).toEqual(accepted);
    expect(await linesAbout(id('new'))).toHaveLength(2);
  });
});

describe('the email a login keeps', () => {
  it('cannot change while the login exists', async () => {
    await expect(
      db.query('update public.staff set email = $1 where id = $2', [address('other'), id('new')]),
    ).rejects.toThrow(
      "Person new's email can't change while they have a sign-in: it is the address they sign in with.",
    );
    await expect(
      db.query('update public.staff set email = null where id = $1', [id('new')]),
    ).rejects.toThrow(/can't change while they have a sign-in/);
  });

  it('can still change on a record with no login', async () => {
    await db.query('update public.staff set email = $1 where id = $2', [
      address('archived-2'),
      id('archived'),
    ]);
  });

  it('is required for a login', async () => {
    const user = await makeUser(address('no-email-user'));
    await expect(
      db.query(
        `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at)
         values ($1, $2, $3, now())`,
        [user, id('no-email'), id('admin')],
      ),
    ).rejects.toThrow('This person needs an email before they can have a sign-in.');
  });
});

describe('who sees the sign-in lines', () => {
  const staffLines = async (who: string) => {
    const res = await rest(as[who], `activity?subject_kind=eq.staff&subject_id=eq.${id('new')}`);
    return (await res.json()) as unknown[];
  };

  it('every Admin', async () => {
    expect(await staffLines('admin')).toHaveLength(2);
  });

  it('nobody else, not even a Director, who still invites and reads the logins', async () => {
    expect(await staffLines('director')).toEqual([]);
    expect(await staffLines('office')).toEqual([]);
    expect(await staffLines('teacher')).toEqual([]);
  });

  it('nobody signed in writes one, not even an Admin', async () => {
    const res = await rest(as.admin, 'activity', {
      method: 'POST',
      body: JSON.stringify({
        id: `act-${run}`,
        subject_kind: 'staff',
        subject_id: id('new'),
        at: new Date().toISOString(),
        text: 'Made up',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('nobody signed in calls record_invitation; only the secret key does', async () => {
    const res = await rest(as.admin, 'rpc/record_invitation', {
      method: 'POST',
      body: JSON.stringify({
        auth_user_id: crypto.randomUUID(),
        staff_id: id('x'),
        invited_by: id('admin'),
      }),
    });
    expect(res.ok).toBe(false);
    expect(await loginOf(id('x'))).toBeUndefined();
  });
});
