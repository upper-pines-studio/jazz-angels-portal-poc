import { describe, expect, it } from 'vitest';
import { ARCHIVE_FIELDS } from '../../../../core/archive';
import { expectNullsLoadMissing, stored } from '../../../../core/__tests__/nulls';
import { makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { TeachingState } from '../types';

describe('teaching: a null optional field loads as a missing field (decision 0008, 2A)', () => {
  const seed = stored(makeSeed());
  const normalise = (raw: unknown) => teachingSlice.normalise!(raw);
  const cases: Array<[keyof TeachingState, string[]]> = [
    ['terms', ['programId', ...ARCHIVE_FIELDS]],
    ['ensembles', [...ARCHIVE_FIELDS]],
    ['meetings', ['rollSubmittedAt', 'notes']],
    [
      'students',
      ['guardianPhone', 'guardianEmail', 'guardianAddress', 'ensembleId', ...ARCHIVE_FIELDS],
    ],
  ];

  it.each(cases)('%s', (key, fields) => {
    expectNullsLoadMissing(normalise, seed, key, fields);
  });

  it("drops a photo release's null date and recorder", () => {
    const student = seed.students[0];
    const photoRelease = { status: 'given', date: null, recordedById: null };
    const raw = { ...seed, students: [{ ...student, photoRelease }, ...seed.students.slice(1)] };
    const loaded = normalise(stored(raw))!.students.find(s => s.id === student.id)!;
    expect(loaded.photoRelease).toEqual({ status: 'given' });
  });

  it('rejects the slice when a required field is null', () => {
    const first = <K extends keyof TeachingState>(key: K, patch: object) => {
      const rows = seed[key] as unknown as object[];
      return { ...seed, [key]: [{ ...rows[0], ...patch }, ...rows.slice(1)] };
    };
    const rejected = [
      { ...seed, students: null },
      first('students', { name: null }),
      first('students', { status: null }),
      first('ensembles', { venueId: null }),
      first('terms', { meetingsPlanned: null }),
      first('meetings', { date: null }),
      first('attendance', { mark: null }),
    ];
    for (const raw of rejected) expect(normalise(stored(raw))).toBeUndefined();
  });
});
