import { describe, expect, it } from 'vitest';
import { teachingSlice } from '../slice';

describe('a new office (demo off)', () => {
  it('starts with no sessions, ensembles, classes, students or roll calls', () => {
    expect(teachingSlice.empty()).toEqual({
      terms: [],
      ensembles: [],
      meetings: [],
      students: [],
      attendance: [],
    });
  });

  it('reads back as itself', () => {
    const empty = teachingSlice.empty();
    expect(teachingSlice.normalise?.(empty)).toEqual(empty);
  });
});
