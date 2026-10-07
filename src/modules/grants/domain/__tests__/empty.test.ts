import { describe, expect, it } from 'vitest';
import { grantsSlice } from '../slice';
import type { GrantsState } from '../types';

describe('a new office (demo off)', () => {
  const empty = grantsSlice.empty();

  it('starts with no grants, funders, money or checklists', () => {
    for (const [key, value] of Object.entries(empty)) {
      if (Array.isArray(value)) expect(value, key).toEqual([]);
    }
    expect(empty.quickbooks.connected).toBe(false);
  });

  it('keeps the default reminder schedule, with nobody extra to notify', () => {
    expect(empty.reminderDefaults.offsets).toEqual(grantsSlice.seed('').reminderDefaults.offsets);
    expect(empty.reminderDefaults.alsoNotifyIds).toEqual([]);
  });

  it('carries every collection the seed does, so it reads back as itself', () => {
    const seedKeys = Object.keys(grantsSlice.seed('')).sort();
    expect(Object.keys(empty).sort()).toEqual(seedKeys);
    expect(grantsSlice.normalise?.(empty)).toEqual(empty);
  });

  it('is a fresh copy each time', () => {
    const a: GrantsState = grantsSlice.empty();
    a.grants.push({} as GrantsState['grants'][number]);
    expect(grantsSlice.empty().grants).toEqual([]);
  });
});
