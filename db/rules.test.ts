import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { OWN_ROLE_REFUSAL, refusalMessage } from '../src/core/permissions';
import {
  OPERATIONS_ARCHIVE_REFUSAL,
  OPERATIONS_IN_SCHOOL_REFUSAL,
  OPERATIONS_RENAME_REFUSAL,
} from '../src/core/derive';
import { PAYMENT_RECEIVED_REFUSAL, REPORT_SENT_REFUSAL } from '../src/modules/grants/domain/slice';
import {
  APPROVED_REFUSAL,
  CHANGE_DRAFT_ONLY_REFUSAL,
  DRAFT_ONLY_REFUSAL,
  OWN_HOURS_REFUSAL,
  OWN_SEND_BACK_REFUSAL,
  SEND_BACK_APPROVED_ONLY_REFUSAL,
  SEND_BACK_REASON_REFUSAL,
} from '../src/modules/timesheets/domain';

/**
 * The rules a row policy cannot express (#155, SCHEMA.md "Triggers for what a
 * row policy cannot express"): the "by" columns and `budget_versions.added_at`
 * set by the database, a time entry's transitions and never one's own
 * approval, reports and payments that stay once they have happened, the closed
 * roll, Operations, and what #154's policies leave to a trigger. Each refusal
 * is the store's own sentence, imported from where it refuses with it today, so
 * the two cannot drift apart.
 *
 * Each test runs in a transaction that is rolled back. It connects as
 * `postgres`, which owns the tables and so is not held by the row policies
 * (#154): what is tested here is the triggers alone, but for one test that
 * takes the `authenticated` role to see a sentence reach a real request. "Signed in" is the
 * request's JWT claims, as PostgREST sets them, so `auth.uid()` answers.
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

/** The sign-ins the tests act as: the office (approves) and a teacher, each with a login. */
const USERS = {
  office: {
    auth: '00000000-0000-4000-8000-000000000001',
    staff: 's-office',
    role: 'office-manager',
  },
  teacher: { auth: '00000000-0000-4000-8000-000000000002', staff: 's-teacher', role: 'teacher' },
  other: { auth: '00000000-0000-4000-8000-000000000003', staff: 's-other', role: 'director' },
  admin: { auth: '00000000-0000-4000-8000-000000000004', staff: 's-admin', role: 'admin' },
} as const;
type Who = keyof typeof USERS;

/** Act as this person for the rest of the transaction, or as nobody (the service role). */
async function signIn(who: Who | null) {
  const claims = who ? JSON.stringify({ sub: USERS[who].auth, role: 'authenticated' }) : '';
  await sql(`select set_config('request.jwt.claims', $1, true)`, [claims]);
}

/** The statement is refused with exactly this sentence; the transaction carries on after it. */
async function refused(text: string, values: unknown[], sentence: string) {
  await sql('savepoint attempt');
  await expect(sql(text, values)).rejects.toThrow(sentence);
  await sql('rollback to savepoint attempt');
}

/** Everything the tests stand on, written with nobody signed in. */
async function setUp() {
  for (const u of Object.values(USERS)) {
    await sql(
      `insert into public.staff (id, name, title, role, teaches) values ($1, $1, 'T', $2, false)`,
      [u.staff, u.role],
    );
    await sql(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
      [u.auth, `${u.staff}@example.org`],
    );
    await sql(
      `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at) values ($1, $2, 's-office', now())`,
      [u.auth, u.staff],
    );
  }
  await sql(
    `insert into public.programs (id, name, short, in_school) values
       ('general-operating', 'Operations', 'Operations', false), ('p', 'Program', 'P', false)`,
  );
}

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(async () => {
  await sql('begin');
  await setUp();
});
afterEach(() => sql('rollback'));

describe('the "by" columns and "When" (#155)', () => {
  it('stores a "by" column sent as someone else as the signed-in person', async () => {
    await signIn('teacher');
    await sql(
      `update public.programs set archived_at = current_date, archived_by = 's-other' where id = 'p'`,
    );
    const { rows } = await sql(`select archived_by from public.programs where id = 'p'`);
    expect(rows[0].archived_by).toBe('s-teacher');
  });

  it('keeps a stored "by" column when the change does not touch it, whatever was sent', async () => {
    await signIn('office');
    await sql(`update public.programs set archived_at = current_date where id = 'p'`);
    await signIn('teacher');
    await sql(
      `update public.programs set name = 'Renamed', archived_by = 's-teacher' where id = 'p'`,
    );
    const { rows } = await sql(`select archived_by from public.programs where id = 'p'`);
    expect(rows[0].archived_by).toBe('s-office');
  });

  it('clears a "by" column with its date (a restore)', async () => {
    await signIn('office');
    await sql(`update public.programs set archived_at = current_date where id = 'p'`);
    await sql(
      `update public.programs set archived_at = null, archived_by = 's-other' where id = 'p'`,
    );
    const { rows } = await sql(`select archived_by from public.programs where id = 'p'`);
    expect(rows[0].archived_by).toBeNull();
  });

  it('stamps an insert, and fills a not-null "by" column the insert left out', async () => {
    await signIn('teacher');
    await sql(
      `insert into public.activity (id, subject_kind, subject_id, at, who_id, text)
       values ('a1', 'time-entry', 'x', now(), 's-other', 'logged')`,
    );
    const { rows } = await sql(`select who_id from public.activity where id = 'a1'`);
    expect(rows[0].who_id).toBe('s-teacher');
  });

  it('sets budget_versions.added_by and added_at, whatever was sent', async () => {
    await insertGrant();
    await signIn('office');
    await sql(
      `insert into public.budget_versions (id, grant_id, number, added_at) values ('bv', 'g', 1, '2001-01-01')`,
    );
    const { rows } = await sql(
      `select added_by, added_at = current_date as today from public.budget_versions where id = 'bv'`,
    );
    expect(rows[0]).toEqual({ added_by: 's-office', today: true });
  });

  it('stamps every "by" column SCHEMA.md lists', async () => {
    const { rows } = await sql(
      `select c.relname || '.' || (regexp_match(pg_get_triggerdef(t.oid), 'stamp_by\\(''([a-z_]+)'''))[1] as col
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where t.tgname like 'a_stamp_%' and pg_get_triggerdef(t.oid) like '%stamp_by(%'`,
    );
    const stamped = rows.map(r => r.col as string);
    for (const col of [
      'staff.archived_by',
      'programs.archived_by',
      'projects.archived_by',
      'organizations.archived_by',
      'venues.archived_by',
      'office_documents.archived_by',
      'funders.archived_by',
      'grants.archived_by',
      'terms.archived_by',
      'ensembles.archived_by',
      'students.archived_by',
      'transactions.assigned_by',
      'time_entries.approved_by',
      'time_entries.sent_back_by',
      'budget_versions.added_by',
      'office_document_versions.added_by',
      'logins.invited_by',
      'grant_files.uploaded_by',
      'time_charges.charged_by',
      'student_private.photo_release_recorded_by',
      'activity.who_id',
    ]) {
      expect(stamped, col).toContain(col);
    }
    // Every archivable table: a table with archived_by and no stamp fails here.
    const { rows: archivable } = await sql(
      `select table_name || '.archived_by' as col from information_schema.columns
        where table_schema = 'public' and column_name = 'archived_by'`,
    );
    for (const r of archivable) expect(stamped).toContain(r.col);
  });

  it('writes the row as sent with nobody signed in (the switch-over, the sync)', async () => {
    await sql(
      `update public.programs set archived_at = current_date, archived_by = 's-other' where id = 'p'`,
    );
    const { rows } = await sql(`select archived_by from public.programs where id = 'p'`);
    expect(rows[0].archived_by).toBe('s-other');
  });
});

/** A grant to hang budgets, reports and payments on, written with nobody signed in. */
async function insertGrant() {
  await sql(`insert into public.funders (id, name, type) values ('f', 'Funder', 'foundation')`);
  await sql(
    `insert into public.grants (id, funder_id, title, restriction, owner_id, phase, loi_required, created_at)
     values ('g', 'f', 'Grant', 'restricted', 's-office', 'active', false, current_date)`,
  );
}

describe('time entries (#155)', () => {
  /** A time entry of the teacher's, as it would be after these steps. */
  async function entry(status: 'draft' | 'submitted' | 'approved' = 'draft') {
    await sql(
      `insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status)
       values ('te', 's-teacher', '2026-10-01', 'p', 'Teaching', 2, 'draft')`,
    );
    if (status === 'draft') return;
    await sql(`update public.time_entries set status = 'submitted' where id = 'te'`);
    if (status === 'submitted') return;
    await sql(
      `update public.time_entries set status = 'approved', approved_by = 's-office', approved_at = current_date where id = 'te'`,
    );
  }
  const row = async () => (await sql(`select * from public.time_entries where id = 'te'`)).rows[0];

  it('lets a draft change, be submitted, recalled, approved and sent back', async () => {
    await entry('draft');
    await signIn('teacher');
    await sql(`update public.time_entries set hours = 3 where id = 'te'`);
    await sql(`update public.time_entries set status = 'submitted' where id = 'te'`);
    await sql(`update public.time_entries set status = 'draft' where id = 'te'`);
    await sql(`update public.time_entries set status = 'submitted' where id = 'te'`);
    await signIn('office');
    await sql(
      `update public.time_entries set status = 'approved', approved_by = 's-teacher', approved_at = current_date where id = 'te'`,
    );
    expect((await row()).approved_by).toBe('s-office');
    await signIn('other');
    await sql(
      `update public.time_entries set status = 'draft', approved_by = null, approved_at = null,
         sent_back_by = 's-office', sent_back_at = current_date, sent_back_reason = 'Wrong day' where id = 'te'`,
    );
    expect(await row()).toMatchObject({
      status: 'draft',
      approved_by: null,
      sent_back_by: 's-other',
    });
    // Resubmitting clears the reason; who sent it back stays.
    await signIn('teacher');
    await sql(
      `update public.time_entries set status = 'submitted', sent_back_reason = null where id = 'te'`,
    );
    expect(await row()).toMatchObject({ status: 'submitted', sent_back_by: 's-other' });
  });

  it('refuses a change to submitted or approved hours', async () => {
    await entry('submitted');
    await signIn('teacher');
    await refused(
      `update public.time_entries set hours = 5 where id = 'te'`,
      [],
      CHANGE_DRAFT_ONLY_REFUSAL,
    );
    await signIn(null);
    await sql(
      `update public.time_entries set status = 'approved', approved_by = 's-office' where id = 'te'`,
    );
    await signIn('teacher');
    await refused(
      `update public.time_entries set activity = 'x' where id = 'te'`,
      [],
      CHANGE_DRAFT_ONLY_REFUSAL,
    );
    await signIn('office');
    await refused(
      `update public.time_entries set approved_at = '2020-01-01' where id = 'te'`,
      [],
      APPROVED_REFUSAL,
    );
  });

  it('refuses recalling approved hours', async () => {
    await entry('approved');
    await signIn('teacher');
    await refused(
      `update public.time_entries set status = 'submitted' where id = 'te'`,
      [],
      APPROVED_REFUSAL,
    );
    await refused(
      `update public.time_entries set status = 'draft' where id = 'te'`,
      [],
      APPROVED_REFUSAL,
    );
  });

  it('refuses approving a draft', async () => {
    await entry('draft');
    await signIn('office');
    await refused(
      `update public.time_entries set status = 'approved' where id = 'te'`,
      [],
      'Only submitted hours are approved.',
    );
  });

  it('refuses approving your own hours, whatever approved_by was sent', async () => {
    await entry('submitted');
    await signIn('teacher');
    await refused(
      `update public.time_entries set status = 'approved', approved_by = 's-office', approved_at = current_date where id = 'te'`,
      [],
      OWN_HOURS_REFUSAL,
    );
    await signIn(null);
    await refused(
      `update public.time_entries set status = 'approved', approved_by = 's-teacher' where id = 'te'`,
      [],
      OWN_HOURS_REFUSAL,
    );
  });

  it('refuses sending back your own hours', async () => {
    await entry('approved');
    await signIn('teacher');
    await refused(
      `update public.time_entries set status = 'draft', approved_by = null, approved_at = null,
         sent_back_by = 's-office', sent_back_at = current_date, sent_back_reason = 'x' where id = 'te'`,
      [],
      OWN_SEND_BACK_REFUSAL,
    );
  });

  it('refuses a send back with no reason', async () => {
    await entry('approved');
    await signIn('office');
    await refused(
      `update public.time_entries set status = 'draft', approved_by = null, approved_at = null,
         sent_back_by = 's-office', sent_back_at = current_date, sent_back_reason = '  ' where id = 'te'`,
      [],
      SEND_BACK_REASON_REFUSAL,
    );
  });

  it('refuses sending back hours that are only submitted', async () => {
    await entry('submitted');
    await signIn('office');
    await refused(
      `update public.time_entries set status = 'draft', sent_back_by = 's-office', sent_back_at = current_date,
         sent_back_reason = 'x' where id = 'te'`,
      [],
      SEND_BACK_APPROVED_ONLY_REFUSAL,
    );
  });

  it('deletes a draft, never submitted or approved hours', async () => {
    await entry('draft');
    await signIn('teacher');
    await sql(`delete from public.time_entries where id = 'te'`);
    await signIn(null);
    await entry('submitted');
    await signIn('teacher');
    await refused(`delete from public.time_entries where id = 'te'`, [], DRAFT_ONLY_REFUSAL);
    await signIn(null);
    await sql(
      `update public.time_entries set status = 'approved', approved_by = 's-office' where id = 'te'`,
    );
    await refused(`delete from public.time_entries where id = 'te'`, [], DRAFT_ONLY_REFUSAL);
  });

  it('says the sentence to a signed-in request, through the row policies (#154)', async () => {
    await entry('submitted');
    await signIn('teacher');
    await sql('set local role authenticated');
    await refused(
      `update public.time_entries set status = 'approved' where id = 'te'`,
      [],
      OWN_HOURS_REFUSAL,
    );
    await sql(`update public.time_entries set status = 'draft' where id = 'te'`);
    await sql('reset role');
  });

  it('refuses whoever approves changing what was worked', async () => {
    await entry('submitted');
    await signIn('office');
    await refused(
      `update public.time_entries set hours = 8 where id = 'te'`,
      [],
      refusalMessage('office-manager'),
    );
  });

  it('lets the same row be sent again (a retry)', async () => {
    await entry('approved');
    await signIn('office');
    await sql(`update public.time_entries set status = status where id = 'te'`);
  });
});

describe('reports and payments that have happened stay (#155)', () => {
  beforeEach(async () => {
    await insertGrant();
    await sql(
      `insert into public.reports (id, grant_id, kind, due_date, submitted_date, status) values
         ('r-open', 'g', 'interim', '2026-12-01', null, 'drafting'),
         ('r-sent', 'g', 'interim', '2026-12-01', '2026-11-20', 'submitted'),
         ('r-accepted', 'g', 'final', '2027-06-01', null, 'accepted')`,
    );
    await sql(
      `insert into public.payments (id, grant_id, label, expected_date, amount, received_date) values
         ('pay-open', 'g', 'First', '2026-11-01', 1000, null),
         ('pay-in', 'g', 'Second', '2026-11-01', 1000, '2026-11-03')`,
    );
    await signIn('office');
  });

  it('deletes a report before it is sent, never after', async () => {
    await sql(`delete from public.reports where id = 'r-open'`);
    await refused(`delete from public.reports where id = 'r-sent'`, [], REPORT_SENT_REFUSAL);
    await refused(`delete from public.reports where id = 'r-accepted'`, [], REPORT_SENT_REFUSAL);
  });

  it('deletes a payment before it is received, never after', async () => {
    await sql(`delete from public.payments where id = 'pay-open'`);
    await refused(`delete from public.payments where id = 'pay-in'`, [], PAYMENT_RECEIVED_REFUSAL);
  });
});

describe('the closed roll (#155)', () => {
  const CLOSED = 'This roll call has been submitted. Reopen it before changing a mark.';

  beforeEach(async () => {
    await sql(`insert into public.venues (id, name, kind) values ('v', 'Studio', 'studio')`);
    await sql(
      `insert into public.ensembles (id, name, program_id, venue_id, room, lead_staff_id, tone)
       values ('e', 'Band', 'p', 'v', 'A', 's-teacher', 'blue')`,
    );
    await sql(
      `insert into public.class_meetings (id, ensemble_id, date, start_time, end_time, venue_id, room) values
         ('m-open', 'e', '2026-10-01', '16:00', '17:00', 'v', 'A'),
         ('m-closed', 'e', '2026-09-24', '16:00', '17:00', 'v', 'A')`,
    );
    await sql(
      `insert into public.students (id, name, instrument, years_in, program_id, ensemble_id, status)
       values ('st', 'Sam', 'Trumpet', 1, 'p', 'e', 'enrolled'), ('st2', 'Ana', 'Bass', 1, 'p', 'e', 'enrolled')`,
    );
    await sql(
      `insert into public.attendance (id, meeting_id, student_id, mark) values
         ('att-open', 'm-open', 'st', 'present'), ('att-closed', 'm-closed', 'st', 'present')`,
    );
    await sql(`update public.class_meetings set roll_submitted_at = now() where id = 'm-closed'`);
    // The roll was closed by an earlier change: what a new transaction would see.
    await sql(`select set_config('ja.rolls_closed_now', '', true)`);
    await signIn('teacher');
  });

  it('writes marks while the roll is open', async () => {
    await sql(`update public.attendance set mark = 'late' where id = 'att-open'`);
    await sql(`insert into public.attendance values ('att-2', 'm-open', 'st2', 'absent')`);
    await sql(`delete from public.attendance where id = 'att-2'`);
  });

  it('refuses inserting, changing or deleting a mark once the roll is submitted', async () => {
    await refused(
      `insert into public.attendance values ('att-3', 'm-closed', 'st2', 'absent')`,
      [],
      CLOSED,
    );
    await refused(`update public.attendance set mark = 'late' where id = 'att-closed'`, [], CLOSED);
    await refused(`delete from public.attendance where id = 'att-closed'`, [], CLOSED);
    // Nor moved onto, or off, a closed roll.
    await refused(
      `update public.attendance set meeting_id = 'm-closed' where id = 'att-open'`,
      [],
      CLOSED,
    );
  });

  it('takes marks in the same change that closes the roll, as Submit roll call sends them', async () => {
    await sql(`update public.class_meetings set roll_submitted_at = now() where id = 'm-open'`);
    await sql(`insert into public.attendance values ('att-4', 'm-open', 'st2', 'late')`);
    await sql(`update public.attendance set mark = 'absent' where id = 'att-open'`);
    // A roll closed earlier stays closed in the same transaction.
    await refused(
      `insert into public.attendance values ('att-5', 'm-closed', 'st2', 'absent')`,
      [],
      CLOSED,
    );
  });

  it('writes marks again once the roll is reopened', async () => {
    await sql(`update public.class_meetings set roll_submitted_at = null where id = 'm-closed'`);
    await sql(`update public.attendance set mark = 'late' where id = 'att-closed'`);
  });
});

describe('Operations (#155)', () => {
  beforeEach(() => signIn('office'));

  it('changes other programs freely', async () => {
    await sql(
      `update public.programs set name = 'New', in_school = true, archived_at = current_date where id = 'p'`,
    );
  });

  it('refuses archiving, renaming or making Operations in-school', async () => {
    const op = `where id = 'general-operating'`;
    await refused(
      `update public.programs set archived_at = current_date ${op}`,
      [],
      OPERATIONS_ARCHIVE_REFUSAL,
    );
    await refused(
      `update public.programs set name = 'Overheads' ${op}`,
      [],
      OPERATIONS_RENAME_REFUSAL,
    );
    await refused(`update public.programs set short = 'Ops' ${op}`, [], OPERATIONS_RENAME_REFUSAL);
    await refused(
      `update public.programs set in_school = true ${op}`,
      [],
      OPERATIONS_IN_SCHOOL_REFUSAL,
    );
  });
});

describe('what the row policies (#154) leave to a trigger', () => {
  it('refuses changing your own role or archiving yourself; someone else may', async () => {
    await signIn('office');
    await refused(
      `update public.staff set role = 'admin' where id = 's-office'`,
      [],
      OWN_ROLE_REFUSAL,
    );
    await refused(
      `update public.staff set archived_at = current_date where id = 's-office'`,
      [],
      "You can't archive yourself. Ask someone else who manages staff.",
    );
    await sql(`update public.staff set title = 'Office' where id = 's-office'`);
    await signIn('other');
    await sql(`update public.staff set role = 'bookkeeper' where id = 's-office'`);
  });

  it('lets only an Admin connect QuickBooks; a sync is anyone who may sync', async () => {
    await sql(`insert into public.quickbooks_connection values (1, false, null, null)`);
    await signIn('office');
    await refused(
      `update public.quickbooks_connection set connected = true, company = 'JA'`,
      [],
      refusalMessage('office-manager'),
    );
    await sql(`update public.quickbooks_connection set last_synced_at = now()`);
    await signIn('admin');
    await sql(`update public.quickbooks_connection set connected = true, company = 'JA'`);
  });

  it("refuses changing a transaction's QuickBooks columns; its status and assignment change", async () => {
    await sql(`insert into public.qb_accounts values ('6000', 'Supplies')`);
    await sql(
      `insert into public.transactions (id, date, payee, memo, account_code, amount, ref, status)
       values ('qb1', '2026-09-10', 'Music store', 'Reeds', '6000', 120, 'Bill 1047', 'to-assign')`,
    );
    await signIn('office');
    await sql(
      `update public.transactions set status = 'assigned', assigned_by = 's-other', assigned_at = current_date where id = 'qb1'`,
    );
    const { rows } = await sql(`select assigned_by from public.transactions where id = 'qb1'`);
    expect(rows[0].assigned_by).toBe('s-office');
    await refused(
      `update public.transactions set amount = 1 where id = 'qb1'`,
      [],
      'This transaction comes from QuickBooks. Change its details there.',
    );
    // The sync, with nobody signed in, writes them.
    await signIn(null);
    await sql(`update public.transactions set memo = 'Reeds and oil' where id = 'qb1'`);
  });

  it('lets a Teacher take the roll on a meeting, and change nothing else of it', async () => {
    await sql(`insert into public.venues (id, name, kind) values ('v', 'Studio', 'studio')`);
    await sql(
      `insert into public.ensembles (id, name, program_id, venue_id, room, lead_staff_id, tone)
       values ('e', 'Band', 'p', 'v', 'A', 's-teacher', 'blue')`,
    );
    await sql(
      `insert into public.class_meetings (id, ensemble_id, date, start_time, end_time, venue_id, room)
       values ('m', 'e', '2026-10-01', '16:00', '17:00', 'v', 'A')`,
    );
    await signIn('teacher');
    await sql(
      `update public.class_meetings set roll_submitted_at = now(), notes = 'Good' where id = 'm'`,
    );
    await sql(`update public.class_meetings set roll_submitted_at = null where id = 'm'`);
    await refused(
      `update public.class_meetings set room = 'B' where id = 'm'`,
      [],
      refusalMessage('teacher'),
    );
    await signIn('office');
    await sql(`update public.class_meetings set room = 'B' where id = 'm'`);
  });
});
