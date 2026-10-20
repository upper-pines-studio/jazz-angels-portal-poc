import { applyDiff, checkStale } from '../diff';
import type { RowDiff } from '../diff';
import type { ModuleSlice } from '../module';
import { StaleWriteError } from '../persistence';
import type { Repository } from '../persistence';
import type { Tables } from '../rows';

type AnySlice = Pick<ModuleSlice<unknown, unknown>, 'id' | 'seed' | 'tables' | 'normalise'>;

/**
 * A `Repository` that holds rows by table, as a backend does, for the stale
 * write tests (#124). `apply` checks the change's row diff against the rows
 * it holds with `checkStale`, the rule a real backend applies, and either
 * rejects with a `StaleWriteError` and writes nothing, or writes the whole
 * diff with `applyDiff`. `load` reads the slice back from its rows.
 *
 * Several live stores can share one, as several people share a server.
 */
export function refusingRepository(slices: readonly AnySlice[], today: string) {
  const bySlice = new Map(slices.map(s => [s.id, s]));
  const rows = new Map<string, Tables>(slices.map(s => [s.id, s.tables.toRows(s.seed(today))]));
  /** Every diff it was sent, accepted or not, in order, with the answer. */
  const sent: Array<{ sliceId: string; rows: RowDiff; refused: boolean }> = [];
  let loads = 0;

  const sliceOf = (id: string) => {
    const slice = bySlice.get(id);
    if (!slice) throw new Error(`No ${id} slice.`);
    return slice;
  };

  const repo: Repository = {
    acceptsReplace: false,
    load(slice, _today, demo) {
      loads += 1;
      const state = sliceOf(slice.id).tables.fromRows(rows.get(slice.id)!);
      // Through JSON, as a server answers: no shared objects with what it holds.
      const raw: unknown = JSON.parse(JSON.stringify(state));
      return Promise.resolve(slice.normalise ? slice.normalise(raw, demo) : raw);
    },
    apply({ sliceId, rows: diff }) {
      const { keys } = sliceOf(sliceId).tables;
      const held = rows.get(sliceId)!;
      const stale = checkStale(keys, held, diff);
      sent.push({ sliceId, rows: diff, refused: Boolean(stale) });
      if (stale) return Promise.reject(new StaleWriteError(stale));
      rows.set(sliceId, applyDiff(keys, held, diff));
      return Promise.resolve();
    },
  };

  return {
    repo,
    sent,
    /** The rows it holds for one slice now. */
    rows: (sliceId: string) => rows.get(sliceId)!,
    /** How many times a slice was loaded. */
    loads: () => loads,
  };
}
