import { describe, expect, it } from 'vitest';
import { withoutNulls } from '../rows';
import { defaultSettings, makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice } from '../store';
import { coreTables } from '../tables';

describe('core tables (#121)', () => {
  it.each([
    ['demo seed', makeCoreSeed()],
    ['empty', makeCoreEmpty()],
  ])('round-trips the %s', (_, state) => {
    const rows = coreTables.toRows(state);
    expect(Object.keys(rows)).toEqual(Object.keys(coreTables.keys));
    expect(coreTables.fromRows(rows)).toEqual(state);
  });

  it('is the mapping on the core slice', () => {
    expect(coreSlice.tables).toBe(coreTables);
  });

  it('gives a venue its address as four columns, and none as four nulls', () => {
    const state = makeCoreSeed();
    const rows = coreTables.toRows(state).venues;
    const withAddress = state.venues.find(v => v.address)!;
    expect(rows.find(r => r.id === withAddress.id)).toMatchObject({
      street: withAddress.address!.street,
      zip: withAddress.address!.zip,
    });
    const bare = coreTables.toRows({
      ...state,
      venues: [{ id: 'v-x', name: 'Hall', kind: 'other' }],
    }).venues[0];
    expect(bare).toMatchObject({ street: null, city: null, state: null, zip: null });
    expect(coreTables.fromRows(coreTables.toRows({ ...state, venues: [] })).venues).toEqual([]);
  });

  it('puts each office document version in its own row, under its document', () => {
    const state = makeCoreSeed();
    const rows = coreTables.toRows(state);
    const count = state.officeDocuments.reduce((n, d) => n + d.versions.length, 0);
    expect(rows.office_document_versions).toHaveLength(count);
    const doc = state.officeDocuments.find(d => d.versions.length > 1)!;
    expect(
      rows.office_document_versions.filter(v => v.office_document_id === doc.id).map(v => v.id),
    ).toEqual(doc.versions.map(v => v.id));
  });

  it('writes each version its number, and reads the versions back by it in any row order (#131)', () => {
    const state = makeCoreSeed();
    const rows = coreTables.toRows(state);
    const doc = state.officeDocuments.find(d => d.versions.length > 1)!;
    expect(
      rows.office_document_versions
        .filter(v => v.office_document_id === doc.id)
        .map(v => [v.id, v.number]),
    ).toEqual(doc.versions.map(v => [v.id, v.number]));
    const shuffled = {
      ...rows,
      office_document_versions: [...rows.office_document_versions].reverse(),
    };
    expect(coreTables.fromRows(shuffled)).toEqual(state);
  });

  it('writes a cleared field as null and reads a null back as a missing field', () => {
    const state = makeCoreSeed();
    const archived = { ...state.staff[0], archivedAt: '2026-09-01', archivedById: 's-gwen' };
    const restored = { ...archived, archivedAt: undefined, archivedById: undefined };
    const row = coreTables.toRows({ ...state, staff: [restored] }).staff[0];
    expect(row).toMatchObject({ archived_at: null, archived_by: null });
    const back = coreTables.fromRows(coreTables.toRows({ ...state, staff: [restored] })).staff[0];
    expect('archivedAt' in back).toBe(false);
    expect(back).toEqual(withoutNulls(state.staff[0]));
  });

  it('keeps the settings as one row, and starts from the defaults without it', () => {
    const rows = coreTables.toRows(makeCoreSeed());
    expect(rows.settings).toEqual([
      { id: 1, fiscal_year_start_month: 7, enabled_modules: ['grants', 'teaching', 'timesheets'] },
    ]);
    expect(coreTables.fromRows({ ...rows, settings: [] }).settings).toEqual(defaultSettings());
  });
});
