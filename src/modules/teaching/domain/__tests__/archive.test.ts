import { describe, expect, it } from 'vitest';
import { isArchived } from '../../../../core/archive';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import {
  attendanceRateForStudent,
  attendanceSummary,
  classesAtVenue,
  enrolledCount,
  ensembleCount,
  ensembleOptions,
  ensemblesList,
  meetingsForWeek,
  nextMeeting,
  rollCallStudents,
  rosterFor,
  rosterForEnsemble,
  todaysMeetings,
  unsubmittedRollCalls,
  waitlistCount,
  weekStart,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { TeachingState } from '../types';

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const BIG_BAND = 'e-big-band';
const SPRING = { from: '2026-03-01', to: '2026-04-26' };

/** The teaching slice behind its real rules, today being the seed's Sunday. */
function harness(user: SignedInUser = KEISHA, today = SEED_TODAY) {
  let teaching: TeachingState = makeSeed();
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const portal = () => ({ core: makeCoreSeed(), teaching }) as unknown as PortalState;
  const actions = guardActions(
    teachingSlice.createActions(
      action => {
        sent.push(action);
        teaching = teachingSlice.reducer(teaching, action);
      },
      portal,
      { today, newId: p => `${p}-a${(n += 1)}`, user },
    ),
    teachingSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  return { actions, portal, refused, sent };
}

const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

describe('archiving and restoring a student', () => {
  const pick = (state: PortalState) =>
    state.teaching.students.find(s => s.ensembleId === BIG_BAND && s.status === 'enrolled')!;

  it('archives with the date and the person, and restores by clearing both', () => {
    const h = harness();
    const student = pick(h.portal());
    h.actions.archiveStudent(student.id);
    const archived = h.portal().teaching.students.find(s => s.id === student.id)!;
    expect(archived).toMatchObject({ archivedAt: SEED_TODAY, archivedById: 's-keisha' });
    // Status and placement are untouched: archived is not alumni.
    expect(archived.status).toBe('enrolled');
    expect(archived.ensembleId).toBe(BIG_BAND);
    expect(teachingSlice.describe!(h.sent[0])).toBe('the archive change');

    h.actions.restoreStudent(student.id);
    const back = h.portal().teaching.students.find(s => s.id === student.id)!;
    expect(isArchived(back)).toBe(false);
    expect(JSON.parse(JSON.stringify(back))).not.toHaveProperty('archivedAt');
  });

  it('leaves the roster, the roll call and the counts, and keeps past attendance', () => {
    const h = harness();
    const before = h.portal();
    const student = pick(before);
    h.actions.archiveStudent(student.id);
    const state = h.portal();

    expect(rosterForEnsemble(state, BIG_BAND).map(s => s.id)).not.toContain(student.id);
    expect(ensembleCount(state, BIG_BAND)).toBe(ensembleCount(before, BIG_BAND) - 1);
    expect(enrolledCount(state)).toBe(enrolledCount(before) - 1);
    expect(rosterFor(state, KEISHA).some(s => s.id === student.id)).toBe(false);
    expect(rosterFor(state, KEISHA, true).at(-1)?.id).toBe(student.id);

    // Their spring attendance is still evidence for a grant report.
    expect(attendanceSummary(state, SPRING)).toEqual(attendanceSummary(before, SPRING));
    expect(attendanceRateForStudent(state, student.id, SPRING)).toBeDefined();
    // A submitted roll call from before still lists them with their mark.
    const spring = state.teaching.meetings.find(
      m => m.ensembleId === BIG_BAND && m.rollSubmittedAt && m.date < SEED_TODAY,
    )!;
    expect(rollCallStudents(state, spring).map(s => s.id)).toContain(student.id);
  });

  it('is not marked present when today’s roll is submitted', () => {
    const h = harness();
    const student = pick(h.portal());
    h.actions.archiveStudent(student.id);
    const meeting = h
      .portal()
      .teaching.meetings.find(m => m.ensembleId === BIG_BAND && m.date === SEED_TODAY)!;
    expect(rollCallStudents(h.portal(), meeting).map(s => s.id)).not.toContain(student.id);
    h.actions.submitRollCall(meeting.id);
    const marks = h.portal().teaching.attendance.filter(a => a.meetingId === meeting.id);
    expect(marks.some(a => a.studentId === student.id)).toBe(false);
    expect(marks).toHaveLength(rosterForEnsemble(h.portal(), BIG_BAND).length);
  });

  it('keeps a waitlisted student archived off the waitlist count', () => {
    const h = harness();
    const before = waitlistCount(h.portal());
    const waiting = h.portal().teaching.students.find(s => s.status === 'waitlist')!;
    h.actions.archiveStudent(waiting.id);
    expect(waitlistCount(h.portal())).toBe(before - 1);
  });

  it('follows the students row: a teacher sees but does not archive', () => {
    const h = harness(as('teacher', 's-devon'));
    const student = pick(h.portal());
    h.actions.archiveStudent(student.id);
    h.actions.archiveEnsemble(BIG_BAND);
    expect(h.refused).toHaveLength(2);
    expect(isArchived(h.portal().teaching.students.find(s => s.id === student.id))).toBe(false);
  });
});

describe('archiving and restoring an ensemble', () => {
  // Archived on the Sunday a week into the term: last week stays, this week and on go.
  const ARCHIVE_DAY = '2026-09-20';

  it('takes its meetings on and after the archive date off the schedule, and keeps the ones before', () => {
    const h = harness(KEISHA, ARCHIVE_DAY);
    const before = h.portal();
    h.actions.archiveEnsemble(BIG_BAND);
    const state = h.portal();
    expect(state.teaching.ensembles.find(e => e.id === BIG_BAND)).toMatchObject({
      archivedAt: ARCHIVE_DAY,
      archivedById: 's-keisha',
    });

    const has = (s: PortalState, week: string) =>
      meetingsForWeek(s, weekStart(week)).some(m => m.ensembleId === BIG_BAND);
    // The week of the 13th is before the archive date: still on the grid.
    expect(has(state, SEED_TODAY)).toBe(true);
    expect(todaysMeetings(state, SEED_TODAY).some(m => m.ensembleId === BIG_BAND)).toBe(true);
    // From the 20th on, gone.
    expect(has(before, ARCHIVE_DAY)).toBe(true);
    expect(has(state, ARCHIVE_DAY)).toBe(false);
    expect(todaysMeetings(state, ARCHIVE_DAY).some(m => m.ensembleId === BIG_BAND)).toBe(false);
    expect(nextMeeting(state, ARCHIVE_DAY)?.ensembleId).not.toBe(BIG_BAND);
    expect(
      unsubmittedRollCalls(state, '2026-10-31').some(
        m => m.ensembleId === BIG_BAND && m.date >= ARCHIVE_DAY,
      ),
    ).toBe(false);
    // Its past attendance stays: last spring's summary is the same.
    expect(attendanceSummary(state, SPRING)).toEqual(attendanceSummary(before, SPRING));
  });

  it('leaves the pickers and the venue page, and lists last with archived ones', () => {
    const h = harness();
    h.actions.archiveEnsemble(BIG_BAND);
    const state = h.portal();
    expect(ensembleOptions(state).map(e => e.id)).not.toContain(BIG_BAND);
    expect(classesAtVenue(state, 'v-studio', SEED_TODAY).map(c => c.ensembleId)).not.toContain(
      BIG_BAND,
    );
    expect(ensemblesList(state).map(e => e.id)).not.toContain(BIG_BAND);
    expect(ensemblesList(state, true).at(-1)?.id).toBe(BIG_BAND);
    // Nothing cascades: its students are still enrolled in it.
    expect(rosterForEnsemble(state, BIG_BAND).length).toBeGreaterThan(0);
  });

  it('comes back on restore', () => {
    const h = harness(KEISHA, '2026-09-20');
    h.actions.archiveEnsemble(BIG_BAND);
    h.actions.restoreEnsemble(BIG_BAND);
    expect(
      meetingsForWeek(h.portal(), weekStart('2026-09-20')).some(m => m.ensembleId === BIG_BAND),
    ).toBe(true);
    expect(ensembleOptions(h.portal()).map(e => e.id)).toContain(BIG_BAND);
  });
});

describe('loading a saved teaching slice', () => {
  it('keeps archive fields that are strings and drops any that are not', () => {
    const saved = makeSeed();
    saved.ensembles[0] = { ...saved.ensembles[0], archivedAt: SEED_TODAY, archivedById: 's-gwen' };
    (saved.students[0] as unknown as Record<string, unknown>).archivedAt = null;
    const loaded = teachingSlice.normalise!(JSON.parse(JSON.stringify(saved)))!;
    expect(loaded.ensembles[0]).toMatchObject({ archivedAt: SEED_TODAY, archivedById: 's-gwen' });
    expect(loaded.students[0]).not.toHaveProperty('archivedAt');
  });
});
