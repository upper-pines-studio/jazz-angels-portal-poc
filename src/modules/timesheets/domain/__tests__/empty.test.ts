import { describe, expect, it } from 'vitest';
import { timesheetsSlice } from '../slice';

describe('a new office (demo off)', () => {
  it('starts with no hours, and reads back as itself', () => {
    const empty = timesheetsSlice.empty();
    expect(empty).toEqual({ entries: [] });
    expect(timesheetsSlice.normalise?.(empty)).toEqual(empty);
  });
});
