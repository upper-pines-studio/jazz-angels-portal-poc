import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import type { PortalState } from '../../../../core/types';
import {
  attendanceForMeeting,
  markCounts,
  rollCounts,
  rollMarks,
  rosterForEnsemble,
  unsubmittedRollCalls,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { TeachingState } from '../types';

const COMBO_B = 'e-combo-b-f1'; // today, 4:00pm, roll not taken

/** A store the size of a test: one slice, real reducer, real actions. */
function harness() {
  let teaching: TeachingState = makeSeed();
  let n = 0;
  const dispatch = (action: AnyAction) => {
    teaching = teachingSlice.reducer(teaching, action);
  };
  const actions = teachingSlice.createActions(
    dispatch,
    () => ({ teaching }) as unknown as PortalState,
    { today: SEED_TODAY, newId: (prefix: string) => `${prefix}-${(n += 1)}` },
  );
  return {
    actions,
    state: () => ({ teaching }) as unknown as PortalState,
    meeting: (id: string) => teaching.meetings.find(m => m.id === id)!,
  };
}

describe('submitRollCall', () => {
  it('stamps rollSubmittedAt and keeps the rehearsal notes', () => {
    const h = harness();
    expect(h.meeting(COMBO_B).rollSubmittedAt).toBeUndefined();

    h.actions.submitRollCall(COMBO_B, 'Ran the blues in F, traded fours.');

    const after = h.meeting(COMBO_B);
    expect(after.rollSubmittedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(after.rollSubmittedAt as string))).toBe(false);
    expect(after.notes).toBe('Ran the blues in F, traded fours.');
  });

  it('writes everyone not marked late or absent down as present', () => {
    const h = harness();
    const roster = rosterForEnsemble(h.state(), 'e-combo-b');
    const [late, absent] = roster;

    h.actions.setMark(COMBO_B, late.id, 'late');
    h.actions.setMark(COMBO_B, absent.id, 'absent');
    h.actions.submitRollCall(COMBO_B);

    const records = attendanceForMeeting(h.state(), COMBO_B);
    expect(records).toHaveLength(roster.length);
    expect(markCounts(records)).toEqual({
      present: roster.length - 2,
      late: 1,
      absent: 1,
      marked: roster.length,
    });
  });

  it('takes the meeting off the unsubmitted list', () => {
    const h = harness();
    const before = unsubmittedRollCalls(h.state(), SEED_TODAY).length;
    h.actions.submitRollCall(COMBO_B);
    expect(unsubmittedRollCalls(h.state(), SEED_TODAY)).toHaveLength(before - 1);
  });

  it('closes the marks until the roll call is reopened', () => {
    const h = harness();
    const student = h.state().teaching.students.find(s => s.ensembleId === 'e-combo-b')!;

    h.actions.setMark(COMBO_B, student.id, 'present');
    h.actions.submitRollCall(COMBO_B);
    h.actions.setMark(COMBO_B, student.id, 'absent');
    expect(attendanceForMeeting(h.state(), COMBO_B)[0].mark).toBe('present');

    h.actions.reopenRollCall(COMBO_B);
    expect(h.meeting(COMBO_B).rollSubmittedAt).toBeUndefined();
    h.actions.setMark(COMBO_B, student.id, 'absent');
    expect(attendanceForMeeting(h.state(), COMBO_B)[0].mark).toBe('absent');
  });
});

describe('setMark', () => {
  it('writes one record per student and changes it in place', () => {
    const h = harness();
    const [a, b] = h.state().teaching.students.filter(s => s.ensembleId === 'e-combo-b');

    h.actions.setMark(COMBO_B, a.id, 'present');
    h.actions.setMark(COMBO_B, b.id, 'late');
    h.actions.setMark(COMBO_B, a.id, 'absent');

    expect(markCounts(attendanceForMeeting(h.state(), COMBO_B))).toEqual({
      present: 0,
      late: 1,
      absent: 1,
      marked: 2,
    });
  });
});

describe('the roster', () => {
  it('enrolls a student and then moves them', () => {
    const h = harness();
    const id = h.actions.enrollStudent({
      name: 'Nina Okoye',
      instrument: 'Trumpet',
      yearsIn: 1,
      guardianName: 'Ada Okoye',
      programId: 'studio-sessions',
      status: 'waitlist',
    });

    expect(h.state().teaching.students.find(s => s.id === id)?.status).toBe('waitlist');

    h.actions.updateStudent(id, { status: 'enrolled', ensembleId: 'e-combo-b' });
    const moved = h.state().teaching.students.find(s => s.id === id);
    expect(moved?.status).toBe('enrolled');
    expect(moved?.ensembleId).toBe('e-combo-b');
  });
});

describe('addMeeting', () => {
  it('adds a class that shows up as unsubmitted once it has happened', () => {
    const h = harness();
    const id = h.actions.addMeeting({
      ensembleId: 'e-combo-a',
      date: '2026-09-12',
      start: '15:00',
      end: '16:00',
      venueId: 'v-studio',
      room: 'Studio 1',
    });
    expect(unsubmittedRollCalls(h.state(), SEED_TODAY).map(m => m.id)).toContain(id);
  });
});

describe('normalise', () => {
  it('rejects a payload that is missing a collection', () => {
    expect(teachingSlice.normalise?.({ terms: [], ensembles: [] })).toBeUndefined();
    expect(teachingSlice.normalise?.(null)).toBeUndefined();
  });

  it('fills a student that predates the status field', () => {
    const raw = {
      terms: [],
      ensembles: [],
      meetings: [],
      attendance: [],
      students: [
        {
          id: 'st-99',
          name: 'Old Row',
          instrument: 'Piano',
          guardianName: 'A. Row',
          programId: 'homeschool',
        },
      ],
    };
    const filled = teachingSlice.normalise?.(raw) as TeachingState;
    expect(filled.students[0].status).toBe('enrolled');
    expect(filled.students[0].yearsIn).toBe(1);
  });
});

describe('normalise', () => {
  it('gives a payload saved before venues existed a venue per ensemble and meeting', () => {
    const seed = makeSeed();
    const stripped = {
      ...seed,
      ensembles: seed.ensembles.map(({ venueId: _v, ...e }) => ({
        ...e,
        room: e.id === 'e-paramount-ms' ? 'Off-site' : e.room,
      })),
      meetings: seed.meetings.map(({ venueId: _v, ...m }) => ({
        ...m,
        room: m.ensembleId === 'e-paramount-ms' ? 'Off-site' : m.room,
      })),
    };
    const filled = teachingSlice.normalise?.(stripped);
    expect(filled?.ensembles.find(e => e.id === 'e-combo-a')).toMatchObject({
      venueId: 'v-studio',
      room: 'Studio 1',
    });
    expect(filled?.ensembles.find(e => e.id === 'e-paramount-ms')).toMatchObject({
      venueId: 'v-paramount-ms',
      room: 'Band room B-12',
    });
    expect(filled?.meetings.every(m => Boolean(m.venueId))).toBe(true);
    expect(filled?.meetings.some(m => m.room === 'Off-site')).toBe(false);
  });
});

describe('rollMarks', () => {
  it('starts everyone on the roster present until marked otherwise', () => {
    const h = harness();
    const roster = rosterForEnsemble(h.state(), 'e-combo-b');
    expect(rollCounts(rollMarks(roster, []))).toEqual({
      present: roster.length,
      late: 0,
      absent: 0,
      marked: roster.length,
    });

    h.actions.setMark(COMBO_B, roster[0].id, 'absent');
    const marks = rollMarks(roster, attendanceForMeeting(h.state(), COMBO_B));
    expect(marks.get(roster[0].id)).toBe('absent');
    expect(rollCounts(marks).present).toBe(roster.length - 1);
  });
});
