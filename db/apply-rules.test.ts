import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { diffRows, diffSlice } from '../src/core/diff';
import type { RowDiff } from '../src/core/diff';
import type { AnyAction, ModuleSlice } from '../src/core/module';
import { makeCoreSeed } from '../src/core/seed';
import { coreTables } from '../src/core/tables';
import type { PortalState, Role } from '../src/core/types';
import { grantsSlice, makeSeed as grantsSeed } from '../src/modules/grants/domain';
import { teachingSlice, makeSeed as teachingSeed } from '../src/modules/teaching/domain';
import { timesheetsSlice, makeSeed as timesheetsSeed } from '../src/modules/timesheets/domain';

/**
 * The triggers (#155) under `apply` (#156): real changes, made by the slices'
 * own actions on the demo data, turned into the diff the browser sends
 * (`diffSlice`) and sent through `public.apply` as a signed-in person, under
 * the row policies (#154). `apply` writes parents first (`writeOrder`), so a
 * change that closes or moves a parent and writes its children in the same
 * apply must still go through: Submit roll call above all, and submitting,
 * approving and sending back hours with their activity lines, adding a grant
 * with its first budget, assigning a transaction, and taking away an open
 * report or a payment not yet received.
 *
 * Each test runs in a transaction that is rolled back. The demo rows go in as
 * `service_role`, nobody signed in, as the switch-over would load them.
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

/** The demo staff the tests sign in as, each given a Supabase user and a login. */
const USERS = {
  's-albert': '00000000-0000-4000-8000-0000000000a1',
  's-keisha': '00000000-0000-4000-8000-0000000000a2',
} as const;
type Who = keyof typeof USERS;
const ROLE: Record<Who, Role> = { 's-albert': 'teacher', 's-keisha': 'office-manager' };

type SliceId = 'grants' | 'teaching' | 'timesheets';
const SLICES = { grants: grantsSlice, teaching: teachingSlice, timesheets: timesheetsSlice };

/** The portal as the demo starts it: every slice's seed. */
const demo = (): PortalState =>
  ({
    core: makeCoreSeed(),
    grants: grantsSeed(),
    teaching: teachingSeed(),
    timesheets: timesheetsSeed(),
  }) as unknown as PortalState;

let state: PortalState;
let ids = 0;

/**
 * Run one of a slice's actions as `who`, as the store would, and return the
 * diff the browser sends for it.
 */
function change<K extends SliceId>(
  sliceId: K,
  who: Who,
  act: (actions: Record<string, (...args: never[]) => unknown>) => void,
): RowDiff {
  const slice = SLICES[sliceId] as unknown as ModuleSlice<unknown, object>;
  const before = (state as unknown as Record<string, unknown>)[sliceId];
  let next = before;
  const actions = slice.createActions(
    (action: AnyAction) => {
      next = slice.reducer(next as never, action);
    },
    () => ({ ...state, [sliceId]: next }) as PortalState,
    {
      today: '2026-09-20',
      newId: prefix => `${prefix}-t${++ids}`,
      user: { id: who, name: who, role: ROLE[who] },
    },
  );
  act(actions as Record<string, (...args: never[]) => unknown>);
  state = { ...state, [sliceId]: next } as PortalState;
  return diffSlice(slice.tables as never, before as never, next as never);
}

/** One apply, as its own step: its error, or undefined when it went through. */
async function apply(sliceId: string, diff: RowDiff): Promise<pg.DatabaseError | undefined> {
  await sql('savepoint apply');
  try {
    await sql('select public.apply($1, $2::jsonb)', [sliceId, JSON.stringify(diff)]);
    await sql('release savepoint apply');
    return undefined;
  } catch (error) {
    await sql('rollback to savepoint apply');
    return error as pg.DatabaseError;
  }
}

async function applied(sliceId: string, diff: RowDiff) {
  expect(diff.length).toBeGreaterThan(0);
  const error = await apply(sliceId, diff);
  expect(error?.message).toBeUndefined();
}

/** The request as PostgREST makes it: the `authenticated` role and the user's claims. */
async function signIn(who: Who) {
  await sql('reset role');
  await sql(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: USERS[who], role: 'authenticated' }),
  ]);
  await sql('set local role authenticated');
}

/** A query past the policies, as postgres. */
async function asOwner<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  await sql('reset role');
  const { rows } = await client.query<T>(text, values);
  await sql('set local role authenticated');
  return rows;
}

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(async () => {
  await sql('begin');
  ids = 0;
  state = demo();
  // The demo rows, as the switch-over loads them: nobody signed in, every column as sent. A
  // budget version's `added_by` is the database's to set for a signed-in change; a load with
  // nobody signed in says who, as the switch-over will.
  await sql('set local role service_role');
  const core = coreTables.toRows((state as unknown as { core: never }).core);
  expect(await apply('core', diffRows(coreTables.keys, {}, core))).toBeUndefined();
  for (const sliceId of ['grants', 'teaching', 'timesheets'] as const) {
    const tables = SLICES[sliceId].tables;
    const all = tables.toRows((state as unknown as Record<string, never>)[sliceId]);
    const rows = all.budget_versions
      ? { ...all, budget_versions: all.budget_versions.map(v => ({ ...v, added_by: 's-barry' })) }
      : all;
    const error = await apply(sliceId, diffRows(tables.keys, {}, rows));
    expect(error?.message, sliceId).toBeUndefined();
  }
  await sql('reset role');
  await sql(
    `insert into auth.users (id, email) select id::uuid, id || '@example.org' from unnest($1::text[]) id`,
    [Object.values(USERS)],
  );
  for (const [staff, auth] of Object.entries(USERS)) {
    await sql(
      `insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
       values ($1, $2, 's-gwen', now(), now())`,
      [auth, staff],
    );
  }
}, 30_000);
afterEach(() => sql('rollback'));

describe('the triggers under apply (#155, #156)', () => {
  it('saves Submit roll call: the closed roll and its marks, in one apply, as the Teacher', async () => {
    const teaching = state.teaching;
    const mine = new Set(
      teaching.ensembles.filter(e => e.leadStaffId === 's-albert').map(e => e.id),
    );
    const open = teaching.meetings.find(m => mine.has(m.ensembleId) && !m.rollSubmittedAt);
    expect(open).toBeDefined();
    const meeting = open!;
    const roster = teaching.students.filter(
      s => s.ensembleId === meeting.ensembleId && s.status === 'enrolled',
    );
    expect(roster.length).toBeGreaterThan(1);

    await signIn('s-albert');
    // A mark set beforehand, then Submit roll call with notes: the rest go in as present.
    await applied(
      'teaching',
      change('teaching', 's-albert', a =>
        a.setMark(meeting.id as never, roster[0].id as never, 'late' as never),
      ),
    );
    const submit = change('teaching', 's-albert', a =>
      a.submitRollCall(meeting.id as never, 'Worked on the bridge' as never),
    );
    expect(submit.map(t => t.table)).toEqual(['class_meetings', 'attendance']);
    await applied('teaching', submit);

    const [stored] = await asOwner<{ closed: boolean; notes: string }>(
      `select roll_submitted_at is not null as closed, notes from public.class_meetings where id = $1`,
      [meeting.id],
    );
    expect(stored).toEqual({ closed: true, notes: 'Worked on the bridge' });
    const marks = await asOwner<{ mark: string }>(
      `select mark from public.attendance where meeting_id = $1`,
      [meeting.id],
    );
    expect(marks).toHaveLength(roster.length);

    // What a later transaction sees: no roll closed in it yet.
    await sql(`select set_config('ja.rolls_closed_now', '', true)`);
    // Sent again then (Try again after a lost answer), it changes nothing and is not refused:
    // `apply` leaves alone a row that already holds what the diff writes.
    await applied('teaching', submit);

    // But a later change to a mark is refused.
    const [mark] = await asOwner<Record<string, unknown>>(
      `select to_jsonb(a) as row from public.attendance a where meeting_id = $1 limit 1`,
      [meeting.id],
    );
    const before = mark.row as Record<string, string>;
    const error = await apply(
      'teaching',
      diffRows(
        { attendance: ['id'] },
        { attendance: [before] },
        { attendance: [{ ...before, mark: before.mark === 'absent' ? 'late' : 'absent' }] },
      ),
    );
    expect(error?.message).toBe(
      'This roll call has been submitted. Reopen it before changing a mark.',
    );
  });

  it('saves logging, submitting, approving, sending back and resubmitting hours with their activity lines', async () => {
    const program = state.core.programs.find(p => !p.archivedAt && p.id !== 'general-operating')!;
    await signIn('s-albert');
    let id = '';
    await applied(
      'timesheets',
      change('timesheets', 's-albert', a => {
        id = a.logHours({
          staffId: 's-albert',
          date: '2026-09-18',
          programId: program.id,
          activity: 'Teaching',
          hours: 2,
        } as never) as string;
      }),
    );
    await applied(
      'timesheets',
      change('timesheets', 's-albert', a => a.submitEntry(id as never)),
    );

    await signIn('s-keisha');
    await applied(
      'timesheets',
      change('timesheets', 's-keisha', a => a.approveEntry(id as never)),
    );
    let [row] = await asOwner(`select status, approved_by from public.time_entries where id = $1`, [
      id,
    ]);
    expect(row).toEqual({ status: 'approved', approved_by: 's-keisha' });

    await applied(
      'timesheets',
      change('timesheets', 's-keisha', a => a.sendBackEntry(id as never, 'Wrong day' as never)),
    );
    await signIn('s-albert');
    await applied(
      'timesheets',
      change('timesheets', 's-albert', a => a.submitEntry(id as never)),
    );
    [row] = await asOwner(
      `select status, sent_back_by, sent_back_reason from public.time_entries where id = $1`,
      [id],
    );
    expect(row).toEqual({ status: 'submitted', sent_back_by: 's-keisha', sent_back_reason: null });
    const steps = await asOwner<{ kind: string; who_id: string }>(
      `select kind, who_id from public.activity where subject_id = $1 order by at, id`,
      [id],
    );
    expect(steps.map(s => s.kind).sort()).toEqual(
      ['approved', 'logged', 'sent-back', 'submitted', 'submitted'].sort(),
    );
  });

  it('refuses the Teacher approving their own hours through apply, with the store’s words', async () => {
    const own = state.timesheets.entries.find(
      e => e.staffId === 's-albert' && e.status === 'draft',
    );
    expect(own).toBeDefined();
    await signIn('s-albert');
    await applied(
      'timesheets',
      change('timesheets', 's-albert', a => a.submitEntry(own!.id as never)),
    );
    // The store would refuse; the database refuses the diff all the same.
    const approve = change('timesheets', 's-albert', a => a.approveEntry(own!.id as never));
    const error = await apply('timesheets', approve);
    expect(error?.message).toBe('Nobody approves their own hours.');
  });

  it('saves a new grant with its first budget version, the database setting who added it', async () => {
    await signIn('s-keisha');
    let id = '';
    const program = state.core.programs.find(p => !p.archivedAt && p.id !== 'general-operating')!;
    const add = change('grants', 's-keisha', a => {
      id = a.addGrant({
        funderId: state.grants.funders[0].id,
        title: 'Trigger test grant',
        programs: [program.id],
        restriction: 'restricted',
        ownerId: 's-keisha',
        loiRequired: false,
        templateId: null,
      } as never) as string;
    });
    await applied('grants', add);
    const versions = await asOwner(
      `select added_by, added_at = current_date as today from public.budget_versions where grant_id = $1`,
      [id],
    );
    expect(versions).toEqual([{ added_by: 's-keisha', today: true }]);
  });

  it('saves archiving a grant, assigning a transaction, and taking away an open report or a payment', async () => {
    await signIn('s-keisha');
    const grant = state.grants.grants.find(g => !g.archivedAt)!;
    await applied(
      'grants',
      change('grants', 's-keisha', a => a.archiveGrant(grant.id as never)),
    );
    const [archived] = await asOwner(`select archived_by from public.grants where id = $1`, [
      grant.id,
    ]);
    expect(archived).toEqual({ archived_by: 's-keisha' });

    const open = state.grants.reports.find(
      r => !r.submittedDate && r.status !== 'submitted' && r.status !== 'accepted',
    );
    if (open) {
      await applied(
        'grants',
        change('grants', 's-keisha', a => a.deleteReport(open.id as never)),
      );
    }
    const due = state.grants.payments.find(p => !p.receivedDate);
    if (due) {
      await applied(
        'grants',
        change('grants', 's-keisha', a => a.deletePayment(due.id as never)),
      );
    }
    expect(open ?? due).toBeDefined();

    const toAssign = state.grants.transactions.find(t => t.status === 'to-assign');
    if (toAssign) {
      await applied(
        'grants',
        change('grants', 's-keisha', a => a.markNotGrantFunded(toAssign.id as never)),
      );
      const [t] = await asOwner(
        `select status, assigned_by from public.transactions where id = $1`,
        [toAssign.id],
      );
      expect(t).toMatchObject({ status: 'not-grant-funded', assigned_by: 's-keisha' });
    }
  });
});
