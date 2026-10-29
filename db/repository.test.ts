import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diffRows, diffSlice } from '../src/core/diff';
import { createLiveStore } from '../src/core/live';
import type { AnyAction, ModuleSlice } from '../src/core/module';
import { StaleWriteError } from '../src/core/persistence';
import type { Repository } from '../src/core/persistence';
import { makeCoreSeed } from '../src/core/seed';
import { coreSlice, makeReducer } from '../src/core/store';
import { supabaseRepository } from '../src/core/supabaseRepository';
import type { PortalState, Role } from '../src/core/types';
import { grantsSlice, makeSeed as grantsSeed } from '../src/modules/grants/domain';
import { teachingSlice, makeSeed as teachingSeed } from '../src/modules/teaching/domain';
import { timesheetsSlice, makeSeed as timesheetsSeed } from '../src/modules/timesheets/domain';
import { freshTables, restoreStartingRows, startingRowsOf } from './startingRows';

/**
 * The Supabase repository (#159) against the local Supabase, through its REST
 * API, signed in as seeded staff: each slice loads back equal to what was
 * saved, one change per slice saves through `apply` (#156) and loads back
 * equal, a stale write rejects with a `StaleWriteError` that the live store
 * turns into "someone else changed it first" and a Try again that works, and
 * a policy or trigger refusal rejects with the database's sentence.
 *
 * Unlike the other database tests, the REST API answers on its own
 * connections, so the rows are committed: the demo goes in as `service_role`
 * on top of the starting rows (#177) before the tests, and afterwards every
 * table holds only the starting rows again, as it did before (the test checks
 * it did).
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

const PASSWORD = 'repository-test-31';
/** The demo staff the tests sign in as. */
const PEOPLE = {
  's-keisha': 'office-manager',
  's-albert': 'teacher',
  's-margaret': 'read-only',
} as const satisfies Record<string, Role>;
type Who = keyof typeof PEOPLE;
const emailOf = (who: Who) => `${who}@repository-test.example.org`;

type SliceId = 'core' | 'grants' | 'teaching' | 'timesheets';
const SLICES = {
  core: coreSlice,
  grants: grantsSlice,
  teaching: teachingSlice,
  timesheets: timesheetsSlice,
} as unknown as Record<SliceId, ModuleSlice<unknown, unknown>>;
const ALL = Object.values(SLICES);

/** Every table in `public`, read in `beforeAll`: as a reset leaves it before the test, and after. */
let tables: string[] = [];

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
let ids = 0;

/** Signed in to the REST API as `who`, through the publishable key, as the browser is. */
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

/** Every slice, loaded through `repo`. */
async function loadAll(repo: Repository): Promise<PortalState> {
  const state: Record<string, unknown> = {};
  for (const slice of ALL) state[slice.id] = await repo.load(slice, TODAY, false);
  return state as unknown as PortalState;
}

/** Run one of a slice's actions on `state` as `who`: the slice after it, and the action. */
function act(
  state: PortalState,
  sliceId: SliceId,
  who: Who,
  run: (actions: Record<string, (...args: never[]) => unknown>) => void,
) {
  const slice = SLICES[sliceId];
  const before = (state as unknown as Record<string, unknown>)[sliceId];
  let next = before;
  let action: AnyAction = { type: `${sliceId}/none` };
  const actions = slice.createActions(
    a => {
      action = a;
      next = slice.reducer(next, a);
    },
    () => ({ ...state, [sliceId]: next }) as PortalState,
    {
      today: TODAY,
      newId: p => `${p}-repo${++ids}`,
      user: { id: who, name: who, role: PEOPLE[who] },
    },
  );
  run(actions as Record<string, (...args: never[]) => unknown>);
  return {
    before,
    next,
    action,
    rows: diffSlice(slice.tables as never, before as never, next as never),
  };
}

/** What separates two states of a slice, row by row; no list order counts (SCHEMA.md). */
const apart = (sliceId: SliceId, a: unknown, b: unknown) =>
  diffSlice(SLICES[sliceId].tables as never, a as never, b as never);

beforeAll(async () => {
  await db.connect();
  const found = await freshTables(text => db.query(text));
  tables = found;
  // The demo, as the switch-over loads it: nobody signed in.
  await db.query('begin');
  await db.query('set local role service_role');
  const start = demo() as unknown as Record<string, unknown>;
  for (const slice of ALL) {
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
  // Only once the tables were found fresh, so a database someone else filled is left alone.
  if (tables.length) {
    await db.query(`truncate ${tables.join(', ')}`);
    await restoreStartingRows((text, values) => db.query(text, values));
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  await db.end();
});

describe('the Supabase repository against the local Supabase (#159)', () => {
  it('loads every slice back equal to the demo that was saved', async () => {
    const loaded = await loadAll(supabaseRepository(clients['s-keisha']));
    const saved = demo() as unknown as Record<SliceId, unknown>;
    for (const sliceId of Object.keys(SLICES) as SliceId[]) {
      const back = (loaded as unknown as Record<SliceId, unknown>)[sliceId];
      expect(apart(sliceId, saved[sliceId], back), sliceId).toEqual([]);
    }
  });

  it('saves one change per slice through apply, and loads it back equal', async () => {
    const keisha = supabaseRepository(clients['s-keisha']);
    const albert = supabaseRepository(clients['s-albert']);
    const state = await loadAll(keisha);
    // The Teacher sees only their own classes' students (#154), so their change is made on
    // the teaching slice as they load it.
    const theirs = {
      ...state,
      teaching: await albert.load(SLICES.teaching, TODAY, false),
    } as PortalState;

    const program = state.core.programs.find(p => p.id !== 'general-operating')!;
    const grant = state.grants.grants.find(g => !g.archivedAt)!;
    const mine = new Set(
      state.teaching.ensembles.filter(e => e.leadStaffId === 's-albert').map(e => e.id),
    );
    const meeting = state.teaching.meetings.find(
      m => mine.has(m.ensembleId) && !m.rollSubmittedAt,
    )!;
    const student = state.teaching.students.find(
      s => s.ensembleId === meeting.ensembleId && s.status === 'enrolled',
    )!;

    const changes: Array<[SliceId, Who, Parameters<typeof act>[3]]> = [
      [
        'core',
        's-keisha',
        a => a.updateProgram(program.id as never, { name: 'Jazz in the Schools' } as never),
      ],
      [
        'grants',
        's-keisha',
        a =>
          a.addTask({
            grantId: grant.id,
            title: 'Send the thank-you letter',
            phase: grant.phase,
            dueDate: '2026-10-01',
            order: 99,
            done: false,
          } as never),
      ],
      [
        'teaching',
        's-albert',
        a => a.setMark(meeting.id as never, student.id as never, 'late' as never),
      ],
      [
        'timesheets',
        's-keisha',
        a =>
          a.logHours({
            staffId: 's-keisha',
            date: '2026-09-18',
            programId: program.id,
            activity: 'Office',
            hours: 1.5,
          } as never),
      ],
    ];
    for (const [sliceId, who, run] of changes) {
      const repo = who === 's-albert' ? albert : keisha;
      const { next, action, rows } = act(who === 's-albert' ? theirs : state, sliceId, who, run);
      expect(rows.length, sliceId).toBeGreaterThan(0);
      await repo.apply({ sliceId, action, rows, next });
      const back = await repo.load(SLICES[sliceId], TODAY, false);
      expect(apart(sliceId, next, back), sliceId).toEqual([]);
    }
  });

  it('rejects a stale write with a StaleWriteError, says so, reloads, and Try again saves', async () => {
    const repo = supabaseRepository(clients['s-keisha']);
    const initial = await loadAll(repo);
    const venue = initial.core.venues.find(v => !v.archivedAt)!;

    // A colleague renames the venue after this person loaded it.
    const theirs = act(initial, 'core', 's-keisha', a =>
      a.updateVenue(venue.id as never, { name: 'The Blue Room' } as never),
    );
    await repo.apply({ sliceId: 'core', ...theirs });

    // This person, on what they loaded, renames it too: refused as stale.
    const mine = act(initial, 'core', 's-keisha', a =>
      a.updateVenue(venue.id as never, { name: 'The Green Room' } as never),
    );
    const error = await repo.apply({ sliceId: 'core', ...mine }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleWriteError);
    expect(error).toMatchObject({ table: 'venues', key: { id: venue.id }, reason: 'changed' });

    // The same through the live store, as the portal runs it.
    const failures: string[] = [];
    const live = createLiveStore({
      initial,
      reducer: makeReducer(ALL),
      slices: ALL,
      repository: repo,
      describe: () => 'the venue',
      onSaveFailed: message => failures.push(message),
      reload: sliceId => repo.load(SLICES[sliceId as SliceId], TODAY, false),
    });
    const ctx = {
      today: TODAY,
      newId: (p: string) => `${p}-live${++ids}`,
      user: { id: 's-keisha', name: 'Keisha', role: 'office-manager' as const },
    };
    const actions = coreSlice.createActions(live.dispatch, live.getState, ctx);
    actions.updateVenue(venue.id, { name: 'The Green Room' });
    expect(await live.whenSaved()).toBe(false);
    expect(failures).toEqual(["Couldn't save the venue: someone else changed it first"]);
    // The slice is loaded again, so the screen shows the colleague's name.
    await expect
      .poll(() => live.getState().core.venues.find(v => v.id === venue.id)?.name)
      .toBe('The Blue Room');

    // Try again: the change is made again on top of theirs, and saves.
    live.getSaving().retry!();
    expect(await live.whenSaved()).toBe(true);
    const back = (await repo.load(coreSlice as never, TODAY, false)) as PortalState['core'];
    expect(back.venues.find(v => v.id === venue.id)?.name).toBe('The Green Room');
  });

  it('rejects a policy refusal with the database’s sentence', async () => {
    const repo = supabaseRepository(clients['s-margaret']);
    const state = await loadAll(repo);
    const organization = state.core.organizations[0];
    const change = act(state, 'core', 's-margaret', a =>
      a.updateOrganization(
        organization.id as never,
        { notes: 'Read-only cannot write this' } as never,
      ),
    );
    const error = await repo.apply({ sliceId: 'core', ...change }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(StaleWriteError);
    expect((error as Error).message).toMatch(/^You may not change the organizations row/);
  });

  it('rejects a trigger refusal with the store’s sentence', async () => {
    const repo = supabaseRepository(clients['s-albert']);
    const state = await loadAll(repo);
    const own = state.timesheets.entries.find(
      e => e.staffId === 's-albert' && e.status === 'draft',
    )!;
    const submit = act(state, 'timesheets', 's-albert', a => a.submitEntry(own.id as never));
    await repo.apply({ sliceId: 'timesheets', ...submit });
    const submitted = { ...state, timesheets: submit.next } as PortalState;
    const approve = act(submitted, 'timesheets', 's-albert', a => a.approveEntry(own.id as never));
    const error = await repo.apply({ sliceId: 'timesheets', ...approve }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(StaleWriteError);
    expect((error as Error).message).toBe('Nobody approves their own hours.');
  });
});
