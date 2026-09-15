import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import {
  attendanceSummary,
  classesAtVenue,
  enrolledCount,
  ensembleOptions,
  ensembleTrend,
  meetingsForWeek,
  recentAttendance,
  rosterForEnsemble,
  sessionWeekLabel,
  todaysMeetings,
  unsubmittedRollCalls,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';

const state = { core: makeCoreSeed(), teaching: makeSeed() } as unknown as PortalState;
const today = SEED_TODAY; // Sunday 2026-09-13

const SPRING = { from: '2026-03-01', to: '2026-04-26' };

describe('attendanceSummary', () => {
  it('counts only submitted meetings inside the period', () => {
    const summary = attendanceSummary(state, SPRING);
    // Eight ensembles × eight meetings, every roll submitted last spring.
    expect(summary.meetings).toBe(64);

    const narrow = attendanceSummary(state, { from: '2026-03-01', to: '2026-03-07' });
    expect(narrow.meetings).toBe(8);
  });

  it('narrows to one program', () => {
    const inSchool = attendanceSummary(state, { ...SPRING, programId: 'in-school' });
    expect(inSchool.meetings).toBe(8);
    expect(inSchool.studentsServed).toBe(rosterForEnsemble(state, 'e-paramount-ms').length);

    const studio = attendanceSummary(state, { ...SPRING, programId: 'studio-sessions' });
    expect(studio.meetings).toBe(24);
    expect(studio.meetings + inSchool.meetings).toBeLessThan(attendanceSummary(state, SPRING).meetings);
  });

  it('reports a rate between 85% and 96% and contact hours that follow the clock', () => {
    const summary = attendanceSummary(state, { ...SPRING, programId: 'in-school' });
    expect(summary.attendanceRate).toBeGreaterThanOrEqual(0.85);
    expect(summary.attendanceRate).toBeLessThanOrEqual(0.96);

    // Paramount MS runs 3:00–4:00pm, so contact hours equal students in the room.
    const attended = Math.round(summary.attendanceRate * 8 * rosterForEnsemble(state, 'e-paramount-ms').length);
    expect(summary.contactHours).toBeCloseTo(attended, 1);
  });

  it('is empty for a period with no meetings', () => {
    expect(attendanceSummary(state, { from: '2026-07-01', to: '2026-08-31' })).toEqual({
      meetings: 0,
      studentsServed: 0,
      attendanceRate: 0,
      contactHours: 0,
    });
  });
});

describe('enrolledCount', () => {
  it('counts enrolled students and ignores the waitlist', () => {
    const enrolled = state.teaching.students.filter((s) => s.status === 'enrolled');
    expect(enrolledCount(state)).toBe(enrolled.length);
    expect(enrolledCount(state)).toBeLessThan(state.teaching.students.length);
  });

  it('narrows to one program', () => {
    const byProgram = state.core.programs.map((p) => enrolledCount(state, p.id));
    expect(byProgram.reduce((a, b) => a + b, 0)).toBe(enrolledCount(state));
    expect(enrolledCount(state, 'in-school')).toBe(6);
  });
});

describe('recentAttendance', () => {
  it('falls back to the previous term when four weeks hold too few roll calls', () => {
    // Week 1 of the Fall session: one submitted roll call, so the figure would
    // read 100% off a single class. Last spring answers instead, and says so.
    const headline = recentAttendance(state, today);
    expect(headline).toBeDefined();
    expect(headline!.footnote).toBe('Spring 2026 session');
    expect(headline!.rate).toBeCloseTo(attendanceSummary(state, SPRING).attendanceRate, 5);
    expect(headline!.rate).toBeLessThan(1);
  });

  it('uses the last four weeks once they hold enough classes', () => {
    // Four weeks after the spring term ended, its last four weeks are the window.
    const headline = recentAttendance(state, '2026-04-26');
    expect(headline).toBeDefined();
    expect(headline!.footnote).toMatch(/^Last 4 weeks · \d+ classes$/);
    expect(headline!.rate).toBeGreaterThan(0.8);
  });

  it('has nothing to say before any roll call is taken', () => {
    const empty = { ...state, teaching: { ...state.teaching, attendance: [], meetings: [] } };
    expect(recentAttendance(empty as PortalState, today)).toBeUndefined();
  });
});

describe('sessionWeekLabel', () => {
  it('drops the year and counts the week', () => {
    expect(sessionWeekLabel(state, today)).toBe('Fall session week 1');
    expect(sessionWeekLabel(state, '2026-09-20')).toBe('Fall session week 2');
  });

  it('is undefined between sessions', () => {
    expect(sessionWeekLabel(state, '2026-08-01')).toBeUndefined();
  });
});

describe('ensembleOptions', () => {
  it('gives id and name only, and narrows to one program', () => {
    expect(ensembleOptions(state)).toHaveLength(state.teaching.ensembles.length);
    expect(ensembleOptions(state)[0]).toEqual({ id: 'e-combo-a', name: 'Combo A' });
    expect(ensembleOptions(state, 'homeschool').map((e) => e.name)).toEqual([
      'Homeschool I',
      'Homeschool II',
    ]);
  });
});

describe('unsubmittedRollCalls', () => {
  it('only counts meetings that have already happened', () => {
    const open = unsubmittedRollCalls(state, today);
    expect(open.map((m) => m.ensembleId)).toEqual(['e-combo-b', 'e-big-band']);
    expect(open.every((m) => m.date <= today)).toBe(true);
  });

  it('leaves next week alone', () => {
    const open = unsubmittedRollCalls(state, today);
    const laterSundays = state.teaching.meetings.filter((m) => m.date > today && !m.rollSubmittedAt);
    expect(laterSundays.length).toBeGreaterThan(0);
    expect(open.some((m) => m.date > today)).toBe(false);
  });

  it('grows once the week has passed', () => {
    expect(unsubmittedRollCalls(state, '2026-09-20').length).toBeGreaterThan(
      unsubmittedRollCalls(state, today).length,
    );
  });
});

describe('the schedule', () => {
  it('gives the eight classes of the first fall week', () => {
    expect(meetingsForWeek(state, '2026-09-13')).toHaveLength(8);
  });

  it('puts three classes on today, earliest first', () => {
    const rows = todaysMeetings(state, today);
    expect(rows.map((m) => m.start)).toEqual(['15:00', '16:00', '17:15']);
  });

  it('keeps the last five submitted meetings in the trend', () => {
    const trend = ensembleTrend(state, 'e-combo-a', today);
    expect(trend).toHaveLength(5);
    expect(trend[trend.length - 1].date).toBe(today);
    expect(trend.every((p) => p.rate > 0 && p.rate <= 1)).toBe(true);
  });
});

describe('classesAtVenue', () => {
  it('lists the ensembles that meet at a venue with their next meeting', () => {
    const atSchool = classesAtVenue(state, 'v-paramount-ms', today);
    expect(atSchool.map((c) => c.name)).toEqual(['Paramount MS']);
    expect(atSchool[0]).toMatchObject({ room: 'Band room B-12', leadStaffId: 's-devon', enrolled: 6 });
    // Week 1 of the Fall term: the first Thursday class is Sep 17.
    expect(atSchool[0].when).toBe('Thursday · 3:00pm – 4:00pm');

    expect(classesAtVenue(state, 'v-studio', today)).toHaveLength(7);
    expect(classesAtVenue(state, 'v-alondra-ms', today)).toEqual([]);
  });
});
