import { describe, expect, it } from 'vitest';
import { expectNullsLoadMissing, stored } from '../../../../core/__tests__/nulls';
import { makeSeed } from '../seed';
import { timesheetsSlice } from '../slice';

describe('timesheets: a null optional field loads as a missing field (decision 0008, 2A)', () => {
  const seed = stored(makeSeed());
  const normalise = (raw: unknown) => timesheetsSlice.normalise!(raw);

  it('entries', () => {
    expectNullsLoadMissing(normalise, seed, 'entries', [
      'ensembleId',
      'approvedBy',
      'approvedAt',
      'sentBackBy',
      'sentBackAt',
      'sentBackReason',
    ]);
  });

  it("an entry's history steps", () => {
    const entry = seed.entries[0];
    const step = { ...entry.history[0], at: null, reason: null, changes: null, rebuilt: null };
    const history = [step, ...entry.history.slice(1)];
    const raw = { entries: [{ ...entry, history }, ...seed.entries.slice(1)] };
    const loaded = normalise(stored(raw))!.entries[0].history[0];
    const { at: _a, reason: _r, changes: _c, rebuilt: _b, ...kept } = entry.history[0];
    expect(loaded).toEqual(kept);
    for (const field of ['at', 'reason', 'changes', 'rebuilt']) expect(field in loaded).toBe(false);
  });

  it('rejects the slice when a required field is null', () => {
    const entry = seed.entries[0];
    const first = (patch: object) => ({
      entries: [{ ...entry, ...patch }, ...seed.entries.slice(1)],
    });
    const rejected = [
      { entries: null },
      first({ staffId: null }),
      first({ hours: null }),
      first({ status: null }),
      first({ history: null }),
      first({ history: [{ ...entry.history[0], whoId: null }] }),
    ];
    for (const raw of rejected) expect(normalise(stored(raw))).toBeUndefined();
  });
});
