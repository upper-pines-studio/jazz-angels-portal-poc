import type { AnyAction, ModuleSlice } from './module';

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
   * Save one change to one slice. `action` is the change as the slice
   * dispatched it (`{ type: 'teaching/update', key, id, patch }`), for a
   * backend that writes rows; `next` is the whole slice after it, for one that
   * writes documents. Rejects with an Error when the change was not saved; the
   * store then puts the slice back as it was (decision 0003).
   */
  apply(sliceId: string, action: AnyAction, next: unknown): Promise<void>;
}
