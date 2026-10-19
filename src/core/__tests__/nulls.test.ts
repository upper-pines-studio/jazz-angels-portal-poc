import { describe, expect, it } from 'vitest';
import { ARCHIVE_FIELDS } from '../archive';
import { isOperations } from '../derive';
import { nullsAsMissing, sliceNullsAsMissing } from '../rows';
import { coreSlice } from '../store';
import { makeCoreSeed } from '../seed';
import type { CoreState } from '../types';
import { expectNullsLoadMissing, stored } from './nulls';

describe('nullsAsMissing', () => {
  it('drops a null optional field and keeps everything else', () => {
    const row = { id: 'a', name: 'Ana', notes: null as string | null, n: 0, on: false };
    expect(nullsAsMissing(row, ['notes'])).toEqual({ id: 'a', name: 'Ana', n: 0, on: false });
    expect('notes' in nullsAsMissing(row, ['notes'])!).toBe(false);
  });

  it('returns the same row when nothing is null', () => {
    const row = { id: 'a', notes: 'kept' };
    expect(nullsAsMissing(row, ['notes'])).toBe(row);
  });

  it('rejects a null required field, and a row that is not an object', () => {
    expect(nullsAsMissing({ id: null, notes: null }, ['notes'])).toBeUndefined();
    expect(nullsAsMissing(null as unknown as object, [])).toBeUndefined();
    expect(nullsAsMissing([] as object, [])).toBeUndefined();
  });
});

describe('sliceNullsAsMissing', () => {
  type S = { rows: Array<{ id: string; note?: string }>; one: { on: boolean; at?: string } };

  it('loads each row and each object with its own optional fields', () => {
    const raw = { rows: [{ id: 'a', note: null }], one: { on: true, at: null } };
    expect(sliceNullsAsMissing(raw as unknown as S, { rows: ['note'], one: ['at'] })).toEqual({
      rows: [{ id: 'a' }],
      one: { on: true },
    });
  });

  it('rejects a null in a field not named optional, at any level', () => {
    const raw = { rows: [{ id: 'a' }], one: { on: true } };
    const load = (patch: object) => sliceNullsAsMissing({ ...raw, ...patch } as S, {});
    expect(load({ rows: null })).toBeUndefined();
    expect(load({ rows: [{ id: null }] })).toBeUndefined();
    expect(load({ one: { on: null } })).toBeUndefined();
  });

  it('leaves a missing collection missing, for the slice to default', () => {
    expect(sliceNullsAsMissing({ one: { on: true } } as S, {})).toEqual({ one: { on: true } });
  });
});

describe('core: a null optional field loads as a missing field (decision 0008, 2A)', () => {
  const seed = stored(makeCoreSeed());
  const normalise = (raw: unknown) => coreSlice.normalise!(raw, true);
  const contact = ['contactName', 'contactEmail', 'contactPhone'];
  const cases: Array<[keyof CoreState, string[], ((row: { id: string }) => boolean)?]> = [
    ['staff', [...ARCHIVE_FIELDS]],
    ['programs', [...ARCHIVE_FIELDS], row => !isOperations(row.id)],
    ['organizations', [...contact, 'website', 'notes', ...ARCHIVE_FIELDS]],
    ['venues', ['organizationId', 'address', ...contact, 'notes', ...ARCHIVE_FIELDS]],
    ['projects', [...ARCHIVE_FIELDS]],
    ['officeDocuments', [...ARCHIVE_FIELDS]],
  ];

  it.each(cases)('%s', (key, fields, pick) => {
    expectNullsLoadMissing(normalise, seed, key, fields, pick);
  });

  it('drops a null demoToday from older settings', () => {
    const raw = { ...seed, settings: { ...seed.settings, demoToday: null } };
    expect(normalise(stored(raw))!.settings).toEqual(normalise(seed)!.settings);
  });

  it('rejects the slice when a required field is null', () => {
    const staff = (patch: object) => [{ ...seed.staff[0], ...patch }, ...seed.staff.slice(1)];
    const rejected = [
      { ...seed, staff: null },
      { ...seed, organizations: null },
      { ...seed, settings: null },
      { ...seed, settings: { ...seed.settings, fiscalYearStartMonth: null } },
      { ...seed, staff: staff({ name: null }) },
      { ...seed, staff: staff({ role: null }) },
      { ...seed, venues: [{ ...seed.venues[0], name: null }] },
      { ...seed, programBudgets: [{ programId: 'in-school', fiscalYear: 'FY27', amount: null }] },
      { ...seed, officeDocuments: [{ id: 'd1', kind: 'w9', name: null, versions: [] }] },
    ];
    for (const raw of rejected) expect(normalise(stored(raw))).toBeUndefined();
  });
});
