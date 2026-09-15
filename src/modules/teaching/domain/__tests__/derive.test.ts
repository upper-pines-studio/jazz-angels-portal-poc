import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import {
  attendanceSummary,
  enrolledCount,
  ensembleTrend,
  meetingsForWeek,
  rosterForEnsemble,
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
