import { describe, expect, it } from 'vitest';
import { applyDiff, checkStale, diffRows } from '../diff';
import type { RowDiff } from '../diff';
import { createLiveStore } from '../live';
import type { AnyAction, ModuleSlice } from '../module';
import { StaleWriteError } from '../persistence';
import type { Repository } from '../persistence';
import type { PortalSlice } from '../repository';
import type { Tables } from '../rows';
import { makeReducer } from '../store';
import type { PortalState } from '../types';
import { refusingRepository } from './refusing';

/**
 * Decision 0008, #124: an update or delete names what it expects to find, an
 * insert's key must be free or hold the same row, and a mismatch is refused.
 * `checkStale` is the rule; `refusingRepository` holds rows and applies it,
 * so the store's rollback, its message and Try again are shown end to end.
 */

const KEYS = { tasks: ['id'] };

const STORED: Tables = {
  tasks: [
    { id: 't-1', title: 'Book the hall', owner: 's-ana', done: false },
    { id: 't-2', title: 'Order programs', owner: null, done: false },
  ],
};

const tasksRows = (rows: object[]): Tables => ({ tasks: rows as Tables['tasks'] });
const row = (id: string) => STORED.tasks.find(r => r.id === id)!;
/** The diff a person makes who read `read` and changed it to `next`. */
const change = (read: object[], next: object[]): RowDiff =>
  diffRows(KEYS, tasksRows(read), tasksRows(next));

describe('checkStale', () => {
  it('lets an update through when the columns it changes are as it read them', () => {
    const diff = change([row('t-1')], [{ ...row('t-1'), title: 'Book the church' }]);
    expect(checkStale(KEYS, STORED, diff)).toBeUndefined();
  });

  it('refuses an update when a column it changes holds someone else’s value', () => {
    // Read when the title was "Book the studio"; the hall is someone else's since.
    const read = { ...row('t-1'), title: 'Book the studio' };
    const diff = change([read], [{ ...read, title: 'Book the church' }]);
    expect(checkStale(KEYS, STORED, diff)).toEqual({
      table: 'tasks',
      key: { id: 't-1' },
      reason: 'changed',
    });
  });

  it('keeps a colleague’s change to another column of the same row', () => {
    // Read before the owner was set; the update changes the title only.
    const read = { ...row('t-1'), owner: null };
    const diff = change([read], [{ ...read, title: 'Book the church' }]);
    expect(checkStale(KEYS, STORED, diff)).toBeUndefined();
    expect(applyDiff(KEYS, STORED, diff).tasks[0]).toEqual({
      ...row('t-1'),
      title: 'Book the church',
    });
  });

  it('lets an update through again when it was already written: a resend', () => {
    const diff = change([row('t-1')], [{ ...row('t-1'), done: true }]);
    const once = applyDiff(KEYS, STORED, diff);
    expect(checkStale(KEYS, once, diff)).toBeUndefined();
    expect(applyDiff(KEYS, once, diff)).toEqual(once);
  });

  it('refuses an update to a row that is gone', () => {
    const read = { id: 't-9', title: 'Gone', owner: null, done: false };
    const diff = change([read], [{ ...read, done: true }]);
    expect(checkStale(KEYS, STORED, diff)?.reason).toBe('gone');
  });

  it('treats a missing column and null alike', () => {
    const { owner: _owner, ...noOwner } = row('t-2');
    const diff = change([noOwner], [{ ...noOwner, owner: 's-ben' }]);
    expect(diff[0].updates[0].was).toEqual({ owner: null });
    expect(checkStale(KEYS, STORED, diff)).toBeUndefined();
  });

  it('lets a delete through when the row is as it was read, or already gone', () => {
    const diff = change([row('t-2')], []);
    expect(checkStale(KEYS, STORED, diff)).toBeUndefined();
    expect(checkStale(KEYS, applyDiff(KEYS, STORED, diff), diff)).toBeUndefined();
  });

  it('refuses a delete when the row changed since it was read', () => {
    const diff = change([{ ...row('t-2'), title: 'Order flyers' }], []);
    expect(checkStale(KEYS, STORED, diff)).toEqual({
      table: 'tasks',
      key: { id: 't-2' },
      reason: 'changed',
    });
  });

  it('lets an insert through under a free key, and again when sent twice', () => {
    const diff = change([], [{ id: 't-3', title: 'Print tickets', owner: null, done: false }]);
    expect(checkStale(KEYS, STORED, diff)).toBeUndefined();
    expect(checkStale(KEYS, applyDiff(KEYS, STORED, diff), diff)).toBeUndefined();
  });

  it('refuses an insert whose key already holds a different row, rather than write over it', () => {
    const diff = change([], [{ id: 't-2', title: 'Print tickets', owner: null, done: false }]);
    expect(checkStale(KEYS, STORED, diff)).toEqual({
      table: 'tasks',
      key: { id: 't-2' },
      reason: 'taken',
    });
  });

  it('compares arrays and objects by content', () => {
    const stored = tasksRows([{ id: 't-1', tags: ['a', 'b'], meta: { n: 1 } }]);
    const read = { id: 't-1', tags: ['a', 'b'], meta: { n: 1 } };
    const diff = change([read], [{ ...read, tags: ['a'], meta: { n: 2 } }]);
    expect(checkStale(KEYS, stored, diff)).toBeUndefined();
    expect(checkStale(KEYS, tasksRows([{ ...read, tags: ['c'] }]), diff)?.reason).toBe('changed');
  });
});

describe('StaleWriteError', () => {
  it('names the row, for the logs', () => {
    const error = new StaleWriteError({ table: 'tasks', key: { id: 't-1' }, reason: 'changed' });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('The tasks row {"id":"t-1"} changed since it was read (changed).');
    expect(error.table).toBe('tasks');
  });
});

// --- End to end: two people, one repository that refuses a stale write -----

interface Task {
  id: string;
  title: string;
  owner?: string;
}
interface TasksState {
  tasks: Task[];
}

const tasks: ModuleSlice<TasksState, Record<string, never>> = {
  id: 'tasks',
  seed: () => ({
    tasks: [
      { id: 't-1', title: 'Book the hall' },
      { id: 't-2', title: 'Order programs' },
    ],
  }),
  empty: () => ({ tasks: [] }),
  reducer(state, action) {
    const { id } = action as { id?: string };
    switch (action.type) {
      case 'tasks/rename':
        return {
          tasks: state.tasks.map(t => (t.id === id ? { ...t, title: String(action.title) } : t)),
        };
      case 'tasks/assign':
        return {
          tasks: state.tasks.map(t => (t.id === id ? { ...t, owner: String(action.owner) } : t)),
        };
      case 'tasks/remove':
        return { tasks: state.tasks.filter(t => t.id !== id) };
      default:
        return state;
    }
  },
  createActions: () => ({}),
  rules: {},
  describe: () => 'the task',
  tables: {
    keys: KEYS,
    toRows: s => ({
      tasks: s.tasks.map(t => ({ id: t.id, title: t.title, owner: t.owner ?? null })),
    }),
    fromRows: t => ({
      tasks: (t.tasks ?? []).map(r => ({
        id: String(r.id),
        title: String(r.title),
        ...(r.owner ? { owner: String(r.owner) } : {}),
      })),
    }),
  },
};

const SLICES = [tasks] as unknown as PortalSlice[];
const TODAY = '2026-10-19';
const flush = () => new Promise(r => setTimeout(r, 0));

/** One person's live store on the shared repository, loaded from it. */
async function person(repo: Repository, withReload = true) {
  const failures: string[] = [];
  const initial = { tasks: await repo.load(tasks as never, TODAY, false) };
  const store = createLiveStore({
    initial: initial as unknown as PortalState,
    reducer: makeReducer(SLICES),
    slices: SLICES,
    repository: repo,
    describe: (sliceId, action) => (sliceId === 'tasks' ? tasks.describe?.(action) : undefined),
    onSaveFailed: message => failures.push(message),
    reload: withReload
      ? sliceId =>
          repo.load(
            SLICES.find(s => s.id === sliceId)!,
            TODAY,
            false,
          )
      : undefined,
  });
  const titles = () =>
    (store.getState() as unknown as { tasks: TasksState }).tasks.tasks.map(t => t.title);
  const task = (id: string) =>
    (store.getState() as unknown as { tasks: TasksState }).tasks.tasks.find(t => t.id === id);
  const dispatch = async (action: AnyAction) => {
    store.dispatch(action);
    await store.whenSaved();
    await flush();
  };
  return { store, failures, titles, task, dispatch };
}

describe('a stale write, end to end', () => {
  it('is rolled back, says someone else changed it, and Try again sends against what is stored now', async () => {
    const server = refusingRepository(SLICES, TODAY);
    const ana = await person(server.repo);
    const ben = await person(server.repo);

    await ana.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the church' });
    expect(ana.store.getSaving().status).toBe('idle');

    // Ben still sees "Book the hall" and renames it: refused, nothing written.
    ben.store.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the studio' });
    expect(ben.titles()[0]).toBe('Book the studio');
    expect(await ben.store.whenSaved()).toBe(false);
    expect(server.sent.at(-1)).toMatchObject({ refused: true });
    expect(server.rows('tasks').tasks[0].title).toBe('Book the church');

    // Rolled back, with the reason, and Try again offered.
    expect(ben.failures).toEqual(["Couldn't save the task: someone else changed it first"]);
    const saving = ben.store.getSaving();
    expect(saving.status).toBe('error');
    expect(saving.error).toBe("Couldn't save the task: someone else changed it first");
    expect(saving.retry).toBeTypeOf('function');

    // The slice is loaded again: Ben sees Ana's title before he tries again.
    await flush();
    expect(ben.titles()[0]).toBe('Book the church');

    // Try again: the same rename, against what is stored now, so it goes through.
    saving.retry!();
    expect(await ben.store.whenSaved()).toBe(true);
    const resent = server.sent.at(-1)!;
    expect(resent.refused).toBe(false);
    expect(resent.rows[0].updates).toEqual([
      { key: { id: 't-1' }, set: { title: 'Book the studio' }, was: { title: 'Book the church' } },
    ]);
    expect(server.rows('tasks').tasks[0].title).toBe('Book the studio');
    expect(ben.titles()[0]).toBe('Book the studio');
    expect(ben.store.getSaving().status).toBe('idle');
  });

  it('keeps a colleague’s change to another column: only what was changed is compared', async () => {
    const server = refusingRepository(SLICES, TODAY);
    const ana = await person(server.repo);
    const ben = await person(server.repo);

    await ana.dispatch({ type: 'tasks/assign', id: 't-1', owner: 's-ana' });
    await ben.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the church' });

    expect(ben.failures).toEqual([]);
    expect(server.rows('tasks').tasks[0]).toEqual({
      id: 't-1',
      title: 'Book the church',
      owner: 's-ana',
    });
  });

  it('refuses a delete of a row someone changed since, and keeps their row', async () => {
    const server = refusingRepository(SLICES, TODAY);
    const ana = await person(server.repo);
    const ben = await person(server.repo);

    await ana.dispatch({ type: 'tasks/rename', id: 't-2', title: 'Order flyers' });
    await ben.dispatch({ type: 'tasks/remove', id: 't-2' });

    expect(ben.failures).toEqual(["Couldn't save the task: someone else changed it first"]);
    expect(ben.task('t-2')?.title).toBe('Order flyers');
    expect(server.rows('tasks').tasks.map(r => r.title)).toEqual(['Book the hall', 'Order flyers']);
  });

  it('only rolls back when the store has no way to reload', async () => {
    const server = refusingRepository(SLICES, TODAY);
    const ana = await person(server.repo);
    const ben = await person(server.repo, false);

    await ana.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the church' });
    await ben.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the studio' });

    expect(ben.failures).toEqual(["Couldn't save the task: someone else changed it first"]);
    expect(ben.titles()[0]).toBe('Book the hall');
  });

  it('leaves a change made while the reload was out, rather than load over it', async () => {
    const server = refusingRepository(SLICES, TODAY);
    // Ben's first load answers at once; his reload waits until the test lets it.
    let loads = 0;
    let answer: (() => void) | undefined;
    const held: Repository = {
      ...server.repo,
      load: (...args) =>
        loads++ === 0
          ? server.repo.load(...args)
          : new Promise(resolve => (answer = () => resolve(server.repo.load(...args)))),
    };
    const ana = await person(server.repo);
    const ben = await person(held);

    await ana.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the church' });
    ben.store.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the studio' });
    await ben.store.whenSaved();
    expect(answer).toBeTypeOf('function');
    // Before the reload lands, Ben assigns the other task; it saves, and stands.
    await ben.dispatch({ type: 'tasks/assign', id: 't-2', owner: 's-ben' });
    answer!();
    await flush();

    expect(ben.task('t-2')?.owner).toBe('s-ben');
    expect(ben.titles()[0]).toBe('Book the hall');
    expect(server.rows('tasks').tasks[1].owner).toBe('s-ben');
  });

  it('says only "Couldn\'t save" for a failure that is not a stale write, and does not reload', async () => {
    const server = refusingRepository(SLICES, TODAY);
    const failing: Repository = {
      ...server.repo,
      apply: () => Promise.reject(new Error('The server is down.')),
    };
    const ben = await person(failing);
    const loadsBefore = server.loads();

    await ben.dispatch({ type: 'tasks/rename', id: 't-1', title: 'Book the studio' });

    expect(ben.failures).toEqual(["Couldn't save the task"]);
    expect(ben.titles()[0]).toBe('Book the hall');
    expect(server.loads()).toBe(loadsBefore);
  });
});
