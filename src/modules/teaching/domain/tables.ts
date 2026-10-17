import type { SliceTables } from '../../../core/rows';
import { orNull, withoutNulls } from '../../../core/rows';
import { addressFrom, archivedColumns, archivedFields } from '../../../core/tables';
import type { ArchivedColumns } from '../../../core/tables';
import type { EnsembleTone, Mark, PhotoReleaseStatus, StudentStatus, TeachingState } from './types';

/**
 * Teaching's state as the rows of its tables in `docs/SCHEMA.md` ("Teaching
 * and timesheets"), and back (#121). A student is two rows: `students`, and
 * `student_private` with the guardian's details and the photo release, so a
 * row rule can keep those from whoever may only see the roster (decision 0001).
 */

export type TermRow = ArchivedColumns & {
  id: string;
  name: string;
  program_id: string | null;
  start_date: string;
  end_date: string;
  meetings_planned: number;
};

export type EnsembleRow = ArchivedColumns & {
  id: string;
  name: string;
  program_id: string;
  venue_id: string;
  room: string;
  lead_staff_id: string;
  tone: EnsembleTone;
};

export type ClassMeetingRow = {
  id: string;
  ensemble_id: string;
  date: string;
  start_time: string;
  end_time: string;
  venue_id: string;
  room: string;
  roll_submitted_at: string | null;
  notes: string | null;
};

export type StudentRow = ArchivedColumns & {
  id: string;
  name: string;
  instrument: string;
  years_in: number;
  program_id: string;
  ensemble_id: string | null;
  status: StudentStatus;
};

export type StudentPrivateRow = {
  student_id: string;
  guardian_name: string;
  guardian_phone: string | null;
  guardian_email: string | null;
  guardian_street: string | null;
  guardian_city: string | null;
  guardian_state: string | null;
  guardian_zip: string | null;
  photo_release: PhotoReleaseStatus;
  photo_release_date: string | null;
  photo_release_recorded_by: string | null;
};

export type AttendanceRow = { id: string; meeting_id: string; student_id: string; mark: Mark };

export type TeachingTables = {
  terms: TermRow[];
  ensembles: EnsembleRow[];
  class_meetings: ClassMeetingRow[];
  students: StudentRow[];
  student_private: StudentPrivateRow[];
  attendance: AttendanceRow[];
};

export const teachingTables: SliceTables<TeachingState, TeachingTables> = {
  keys: {
    terms: ['id'],
    ensembles: ['id'],
    class_meetings: ['id'],
    students: ['id'],
    student_private: ['student_id'],
    attendance: ['id'],
  },

  toRows(state) {
    return {
      terms: state.terms.map(t => ({
        id: t.id,
        name: t.name,
        program_id: orNull(t.programId),
        start_date: t.start,
        end_date: t.end,
        meetings_planned: t.meetingsPlanned,
        ...archivedColumns(t),
      })),
      ensembles: state.ensembles.map(e => ({
        id: e.id,
        name: e.name,
        program_id: e.programId,
        venue_id: e.venueId,
        room: e.room,
        lead_staff_id: e.leadStaffId,
        tone: e.tone,
        ...archivedColumns(e),
      })),
      class_meetings: state.meetings.map(m => ({
        id: m.id,
        ensemble_id: m.ensembleId,
        date: m.date,
        start_time: m.start,
        end_time: m.end,
        venue_id: m.venueId,
        room: m.room,
        roll_submitted_at: orNull(m.rollSubmittedAt),
        notes: orNull(m.notes),
      })),
      students: state.students.map(s => ({
        id: s.id,
        name: s.name,
        instrument: s.instrument,
        years_in: s.yearsIn,
        program_id: s.programId,
        ensemble_id: orNull(s.ensembleId),
        status: s.status,
        ...archivedColumns(s),
      })),
      student_private: state.students.map(s => ({
        student_id: s.id,
        guardian_name: s.guardianName,
        guardian_phone: orNull(s.guardianPhone),
        guardian_email: orNull(s.guardianEmail),
        guardian_street: orNull(s.guardianAddress?.street),
        guardian_city: orNull(s.guardianAddress?.city),
        guardian_state: orNull(s.guardianAddress?.state),
        guardian_zip: orNull(s.guardianAddress?.zip),
        photo_release: s.photoRelease.status,
        photo_release_date: orNull(s.photoRelease.date),
        photo_release_recorded_by: orNull(s.photoRelease.recordedById),
      })),
      attendance: state.attendance.map(a => ({
        id: a.id,
        meeting_id: a.meetingId,
        student_id: a.studentId,
        mark: a.mark,
      })),
    };
  },

  fromRows(tables) {
    const guardians = new Map(tables.student_private.map(p => [p.student_id, p]));
    return {
      terms: tables.terms.map(r => ({
        id: r.id,
        name: r.name,
        start: r.start_date,
        end: r.end_date,
        meetingsPlanned: r.meetings_planned,
        ...withoutNulls({ programId: r.program_id }),
        ...archivedFields(r),
      })),
      ensembles: tables.ensembles.map(r => ({
        id: r.id,
        name: r.name,
        programId: r.program_id,
        venueId: r.venue_id,
        room: r.room,
        leadStaffId: r.lead_staff_id,
        tone: r.tone,
        ...archivedFields(r),
      })),
      meetings: tables.class_meetings.map(r => ({
        id: r.id,
        ensembleId: r.ensemble_id,
        date: r.date,
        start: r.start_time,
        end: r.end_time,
        venueId: r.venue_id,
        room: r.room,
        ...withoutNulls({ rollSubmittedAt: r.roll_submitted_at, notes: r.notes }),
      })),
      students: tables.students.map(r => {
        // A student read without their private row (someone the rule keeps it
        // from) has no guardian on file and no release asked.
        const p = guardians.get(r.id);
        return {
          id: r.id,
          name: r.name,
          instrument: r.instrument,
          yearsIn: r.years_in,
          guardianName: p?.guardian_name ?? '',
          ...withoutNulls({
            guardianPhone: p?.guardian_phone,
            guardianEmail: p?.guardian_email,
            guardianAddress: p
              ? addressFrom(p.guardian_street, p.guardian_city, p.guardian_state, p.guardian_zip)
              : undefined,
            ensembleId: r.ensemble_id,
          }),
          programId: r.program_id,
          status: r.status,
          photoRelease: {
            status: p?.photo_release ?? 'not-asked',
            ...withoutNulls({
              date: p?.photo_release_date,
              recordedById: p?.photo_release_recorded_by,
            }),
          },
          ...archivedFields(r),
        };
      }),
      attendance: tables.attendance.map(r => ({
        id: r.id,
        meetingId: r.meeting_id,
        studentId: r.student_id,
        mark: r.mark,
      })),
    };
  },
};
