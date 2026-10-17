import { describe, expect, it } from 'vitest';
import { makeEmpty, makeSeed } from '../seed';
import { teachingTables } from '../tables';

describe('teaching tables (#121)', () => {
  it.each([
    ['demo seed', makeSeed()],
    ['empty', makeEmpty()],
  ])('round-trips the %s', (_, state) => {
    const rows = teachingTables.toRows(state);
    expect(Object.keys(rows)).toEqual(Object.keys(teachingTables.keys));
    expect(teachingTables.fromRows(rows)).toEqual(state);
  });

  it("keeps the guardian's details and the photo release in student_private, never on students", () => {
    const state = makeSeed();
    const student = state.students.find(s => s.guardianAddress && s.guardianEmail)!;
    const rows = teachingTables.toRows(state);
    const row = rows.students.find(r => r.id === student.id)!;
    expect(Object.keys(row).filter(c => c.startsWith('guardian') || c.startsWith('photo'))).toEqual(
      [],
    );
    expect(rows.student_private.find(p => p.student_id === student.id)).toEqual({
      student_id: student.id,
      guardian_name: student.guardianName,
      guardian_phone: student.guardianPhone ?? null,
      guardian_email: student.guardianEmail,
      guardian_street: student.guardianAddress!.street,
      guardian_city: student.guardianAddress!.city,
      guardian_state: student.guardianAddress!.state,
      guardian_zip: student.guardianAddress!.zip,
      photo_release: student.photoRelease.status,
      photo_release_date: student.photoRelease.date ?? null,
      photo_release_recorded_by: student.photoRelease.recordedById ?? null,
    });
  });

  it('reads a student without their private row as having nothing on file', () => {
    const state = makeSeed();
    const rows = teachingTables.toRows(state);
    const back = teachingTables.fromRows({ ...rows, student_private: [] }).students[0];
    expect(back.guardianName).toBe('');
    expect(back.guardianPhone).toBeUndefined();
    expect(back.guardianAddress).toBeUndefined();
    expect(back.photoRelease).toEqual({ status: 'not-asked' });
  });

  it('writes a session for all programs, and an open roll, as nulls', () => {
    const state = makeSeed();
    const rows = teachingTables.toRows({
      ...state,
      terms: [{ ...state.terms[0], programId: undefined }],
      meetings: [{ ...state.meetings[0], rollSubmittedAt: undefined, notes: undefined }],
    });
    expect(rows.terms[0].program_id).toBeNull();
    expect(rows.class_meetings[0]).toMatchObject({ roll_submitted_at: null, notes: null });
  });
});
