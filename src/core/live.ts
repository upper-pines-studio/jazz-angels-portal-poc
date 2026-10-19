import type { AnyAction } from './module';
import type { Repository } from './persistence';
import type { PortalState } from './types';

/**
 * The portal's state between the screens and the repository, with no React in
 * it so the tests can drive it with a repository that fails on demand.
 *
 * A change shows at once: `dispatch` runs the reducer and every subscriber
 * sees the new state before anything is saved. Then each slice the change
 * touched is handed to `repository.apply`. Applies run one at a time per
 * slice, in the order they were made, so a slice's saves never overtake each
 * other. When one fails, that slice goes back to how it stood before the
 * failed change, and the changes queued behind it on the same slice are
 * dropped with it: each was made on top of the one that failed. Other slices
 * keep going. `onSaveFailed` gets one sentence saying what was not saved.
 *
 * Each slice keeps its own failure until it next saves, so a success on one
 * slice never hides another's: the top bar reports an error while any slice
 * has one, in the words of the most recent, and Try again sends every slice's
 * dropped changes again.
 */

export type SaveStatus = 'idle' | 'saving' | 'error';

/** What the shell shows in the top bar. */
export interface Saving {
  /** `saving` while any apply is in flight; `error` while any slice has a failure its next success has not cleared. */
  status: SaveStatus;
  /** The sentence for the most recent failure: "Couldn't save the roll call mark". */
  error?: string;
  /** Sends the changes that were not saved again, on every slice that has a failure. */
  retry?: () => void;
}

/** What `replace` dispatches: every slice at once (import, reset). */
export const REPLACE = 'portal/replace';

/**
 * What `dispatch` throws when a `REPLACE` reaches a repository that does not
 * accept one (decision 0008, 3C). The store refuses import and reset before
 * this, so reaching it is a bug, not something to save slice by slice.
 */
export const REPLACE_REFUSED = 'portal/replace was dispatched to a repository that refuses it.';

interface Change {
  /** Which dispatch made it: one number for every slice the action touched. */
  seq: number;
  action: AnyAction;
  before: unknown;
  after: unknown;
}

/** A slice whose last apply failed: what to say, and what it dropped, in order. */
interface Failure {
  error: string;
  unsaved: Array<{ seq: number; action: AnyAction }>;
}

interface Waiter {
  failed: boolean;
  resolve: (saved: boolean) => void;
}

export interface LiveStoreOptions {
  initial: PortalState;
  reducer: (state: PortalState, action: AnyAction) => PortalState;
  repository: Repository;
  /** Plain words for a change: "the roll call mark". The store adds "Couldn't save". */
  describe?: (sliceId: string, action: AnyAction) => string | undefined;
  /** Called once per failed apply, with the sentence the toast shows. */
  onSaveFailed?: (message: string) => void;
}

export interface LiveStore {
  getState(): PortalState;
  getSaving(): Saving;
  dispatch(action: AnyAction): void;
  subscribe(listener: () => void): () => void;
  /**
   * Resolves once everything dispatched so far has been applied: true when it
   * all saved, false when any of it failed (and was rolled back).
   */
  whenSaved(): Promise<boolean>;
}

const IDLE: Saving = { status: 'idle' };

export function createLiveStore({
  initial,
  reducer,
  repository,
  describe,
  onSaveFailed,
}: LiveStoreOptions): LiveStore {
  let state = initial;
  let saving: Saving = IDLE;
  /** Per slice, oldest failure first: re-set on each failure, so the last is the most recent. */
  const failures = new Map<string, Failure>();
  let seq = 0;
  const queues = new Map<string, Change[]>();
  const listeners = new Set<() => void>();
  let waiters: Waiter[] = [];

  const busy = () => [...queues.values()].some(q => q.length > 0);
  const emit = () => listeners.forEach(l => l());

  function refresh() {
    const latest = [...failures.values()].pop();
    const error = latest?.error;
    const status: SaveStatus = error ? 'error' : busy() ? 'saving' : 'idle';
    const retry = latest ? resend : undefined;
    if (status === saving.status && error === saving.error && retry === saving.retry) return;
    saving = status === 'idle' ? IDLE : { status, error, retry };
  }

  function settle() {
    if (busy()) return;
    const done = waiters;
    waiters = [];
    done.forEach(w => w.resolve(!w.failed));
  }

  function dispatch(action: AnyAction) {
    if (action.type === REPLACE && !repository.acceptsReplace) throw new Error(REPLACE_REFUSED);
    const prev = state;
    const next = reducer(prev, action);
    if (next === prev) return;
    state = next;
    seq += 1;
    const before = prev as unknown as Record<string, unknown>;
    const after = next as unknown as Record<string, unknown>;
    for (const sliceId of Object.keys(after)) {
      if (before[sliceId] === after[sliceId]) continue;
      enqueue(sliceId, { seq, action, before: before[sliceId], after: after[sliceId] });
    }
    refresh();
    emit();
  }

  function enqueue(sliceId: string, change: Change) {
    const queue = queues.get(sliceId) ?? [];
    queues.set(sliceId, queue);
    queue.push(change);
    if (queue.length === 1) run(sliceId, queue);
  }

  function run(sliceId: string, queue: Change[]) {
    const change = queue[0];
    let pending: Promise<void>;
    try {
      pending = repository.apply(sliceId, change.action, change.after);
    } catch (e) {
      pending = Promise.reject(e);
    }
    pending.then(
      () => saved(sliceId, queue),
      () => failed(sliceId, queue, change),
    );
  }

  function saved(sliceId: string, queue: Change[]) {
    queue.shift();
    // The slice's next success clears its failure, and with it the offer to
    // resend what it dropped. Other slices keep theirs.
    failures.delete(sliceId);
    if (queue.length) run(sliceId, queue);
    refresh();
    settle();
    emit();
  }

  function failed(sliceId: string, queue: Change[], change: Change) {
    const dropped = queue.splice(0);
    state = {
      ...(state as unknown as Record<string, unknown>),
      [sliceId]: change.before,
    } as unknown as PortalState;
    const what = describe?.(sliceId, change.action) || 'that change';
    const error = `Couldn't save ${what}`;
    const earlier = failures.get(sliceId)?.unsaved ?? [];
    failures.delete(sliceId);
    failures.set(sliceId, {
      error,
      unsaved: [...earlier, ...dropped.map(d => ({ seq: d.seq, action: d.action }))],
    });
    waiters.forEach(w => (w.failed = true));
    refresh();
    onSaveFailed?.(error);
    settle();
    emit();
  }

  /**
   * Dispatch every slice's dropped changes again, on the state as it stands
   * now, in the order they were first made. A change that failed on two
   * slices is sent once.
   */
  function resend() {
    const again = new Map<number, { action: AnyAction; sliceIds: string[] }>();
    for (const [sliceId, { unsaved }] of failures) {
      for (const { seq: made, action } of unsaved) {
        const entry = again.get(made) ?? { action, sliceIds: [] };
        entry.sliceIds.push(sliceId);
        again.set(made, entry);
      }
    }
    failures.clear();
    refresh();
    emit();
    for (const [, { action, sliceIds }] of [...again].sort(([a], [b]) => a - b)) {
      if (action.type === REPLACE) {
        // Only the slices that failed: the others saved the first time.
        const whole = action.state as Record<string, unknown>;
        const failed = Object.fromEntries(sliceIds.map(id => [id, whole[id]]));
        dispatch({
          type: REPLACE,
          state: { ...(state as unknown as Record<string, unknown>), ...failed },
        });
      } else dispatch(action);
    }
  }

  return {
    getState: () => state,
    getSaving: () => saving,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    whenSaved() {
      if (!busy()) return Promise.resolve(true);
      return new Promise(resolve => waiters.push({ failed: false, resolve }));
    },
  };
}
