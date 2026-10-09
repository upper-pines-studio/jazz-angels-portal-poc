import { describe, expect, it } from 'vitest';
import { grantsSlice } from '../slice';
import { DEFAULT_TEMPLATES } from '../templates';
import type { GrantsState } from '../types';

describe('a new office (demo off)', () => {
  const empty = grantsSlice.empty();

  it('starts with no grants, funders or money', () => {
    for (const [key, value] of Object.entries(empty)) {
      if (Array.isArray(value) && key !== 'templates') expect(value, key).toEqual([]);
    }
    expect(empty.quickbooks.connected).toBe(false);
  });

  it('starts with the default playbook, the same templates the demo has', () => {
    expect(empty.templates.map(t => t.name)).toEqual([
      'Foundation grant — standard',
      'Government grant',
      'Corporate sponsorship',
      'Renewal (returning funder)',
    ]);
    expect(empty.templates).toEqual(grantsSlice.seed('').templates);
    expect(empty.templates).toEqual(DEFAULT_TEMPLATES);
  });

  it('gives each start its own copy of the playbook', () => {
    const a = grantsSlice.empty();
    a.templates[0].items.pop();
    a.templates.pop();
    expect(grantsSlice.empty().templates).toEqual(DEFAULT_TEMPLATES);
  });

  it("keeps a saved slice's templates as they are, even none", () => {
    const saved = { ...grantsSlice.empty(), templates: [] };
    expect(grantsSlice.normalise?.(JSON.parse(JSON.stringify(saved)))?.templates).toEqual([]);
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
