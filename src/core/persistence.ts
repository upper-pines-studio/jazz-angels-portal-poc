import type { RowDiff, StaleWrite } from './diff';
import type { AnyAction, ModuleSlice } from './module';

/**
 * What `apply` rejects with when the change was made on rows someone else has
 * changed since they were read (decision 0008, #124; the rule is `checkStale`
 * in `diff.ts`). Nothing of the change was written. The live store rolls the
 * slice back as for any failure, says someone else changed it first, and
 * loads the slice again so the screen shows their change before Try again.
 */
export class StaleWriteError extends Error {
  readonly table: string;
  readonly key: StaleWrite['key'];
  readonly reason: StaleWrite['reason'];
  constructor({ table, key, reason }: StaleWrite) {
    super(`The ${table} row ${JSON.stringify(key)} changed since it was read (${reason}).`);
    this.name = 'StaleWriteError';
    this.table = table;
    this.key = key;
    this.reason = reason;
  }
}

/** One change to one slice, as the store hands it to `Repository.apply`. */
export interface SliceChange {
  /** The slice it changed: `grants`. */
  sliceId: string;
  /**
   * The change as the slice dispatched it (`{ type: 'grants/batch', … }`): a
   * label for logs and for "Couldn't save …", not what to write. Write
   * `rows`: it covers every table the change touched, and core's own reducer
   * and the few allow-listed slice cases (`grants/sync`, the reminder plans)
   * still work out their rows from the state, so the action alone does not
   * say what changed.
   */
  action: AnyAction;
  /**
   * The rows the change inserted, updated and deleted, table by table, parents
   * first, a cleared field as `null` (`src/core/diff.ts`). Worked out the first
   * time it is read, so a repository that never reads it pays nothing.
   */
  readonly rows: RowDiff;
  /** The whole slice after the change. */
  next: unknown;
}

/**
 * Where the portal's data lives, seen from the store. One `load` per module
 * slice when the store starts, one `apply` per change after it. Both return
 * promises, because a backend answers later and can say no.
 *
 * `repository.ts` is the first implementation, on localStorage. A backend
 * replaces that file with one that implements this interface; the store and
 * everything above it stay as they are. See `src/core/README.md`.
 */
export interface Repository {
  /**
   * One slice as saved, run through the slice's `normalise`. When nothing is
   * saved yet it is a fresh slice: the demo data in a demo build, empty
   * otherwise (decision 0004).
   */
  load(slice: ModuleSlice<unknown, unknown>, today: string, demo: boolean): Promise<unknown>;
  /**
   * Save one change to one slice. `change.rows` is what the change did to the
   * slice's tables, worked out in core from the slice before and after it
   * (decision 0008, 1A): a backend writes it, all in one transaction.
   * `change.next` is the whole slice after it, for one that writes documents,
   * as `localRepository` does. `change.action` is only a label, for logs.
   * Rejects with an Error when the change was not saved; the store then puts
   * the slice back as it was (decision 0003). A backend checks the diff with
   * `checkStale` against the rows as stored and rejects with a
   * `StaleWriteError` when an update or delete no longer matches what it
   * names, or an insert's key holds a different row (#124).
   */
  apply(change: SliceChange): Promise<void>;
  /**
   * Whether every slice may be replaced at once (`portal/replace`: Import JSON,
   * Reset demo data). `localRepository` says yes. A backend says no: a
   * whole-portal replace would delete rows, which decision 0002 forbids, so
   * Settings leaves Import out and the store refuses both (decision 0008, 3C).
   */
  readonly acceptsReplace: boolean;
}
