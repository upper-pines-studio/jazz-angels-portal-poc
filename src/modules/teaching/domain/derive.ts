import { addDays } from 'date-fns';
import { toDate, toISO } from '../../../core';
import type { PortalState, ProgramId } from '../../../core';
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceWindow,
  ClassMeeting,
  Ensemble,
  Student,
  Term,
} from './types';

/**
 * Derived data for the teaching module. Every function here is pure and takes
 * the whole portal state, so other modules can call the exported ones through
 * `src/modules/teaching/index.ts`.
 */

// --- Lookups ----------------------------------------------------------------

export function ensembleById(state: PortalState, id: string | undefined): Ensemble | undefined {
  return id ? state.teaching.ensembles.find((e) => e.id === id) : undefined;
}

export function studentById(state: PortalState, id: string | undefined): Student | undefined {
  return id ? state.teaching.students.find((s) => s.id === id) : undefined;
}

export function meetingById(state: PortalState, id: string | undefined): ClassMeeting | undefined {
  return id ? state.teaching.meetings.find((m) => m.id === id) : undefined;
}

/** The term `dateISO` falls inside, or the next one to start. */
export function termForDate(state: PortalState, dateISO: string): Term | undefined {
  const terms = [...state.teaching.terms].sort((a, b) => a.start.localeCompare(b.start));
  return terms.find((t) => dateISO >= t.start && dateISO <= t.end) ?? terms.find((t) => t.start > dateISO);
}

/** Which week of the term `dateISO` is, counting from 1. Undefined outside a term. */
export function termWeek(term: Term | undefined, dateISO: string): number | undefined {
  if (!term || dateISO < term.start || dateISO > term.end) return undefined;
  const days = Math.floor((toDate(dateISO).getTime() - toDate(term.start).getTime()) / 86400000);
  return Math.floor(days / 7) + 1;
}

// --- The schedule -----------------------------------------------------------

/** The Sunday on or before `dateISO`. Weeks on the schedule run Sunday to Saturday. */
export function weekStart(dateISO: string): string {
  const d = toDate(dateISO);
  return toISO(addDays(d, -d.getDay()));
}

function byClock(a: ClassMeeting, b: ClassMeeting): number {
  return a.date.localeCompare(b.date) || a.start.localeCompare(b.start);
}

/** Every meeting in the Sunday-to-Saturday week beginning `weekStartISO`. */
export function meetingsForWeek(state: PortalState, weekStartISO: string): ClassMeeting[] {
  const end = toISO(addDays(toDate(weekStartISO), 6));
  return state.teaching.meetings
    .filter((m) => m.date >= weekStartISO && m.date <= end)
    .sort(byClock);
}

/** Today's classes, earliest first. */
export function todaysMeetings(state: PortalState, today: string): ClassMeeting[] {
  return state.teaching.meetings.filter((m) => m.date === today).sort(byClock);
}

/** The next class after `today`, for the empty state on a day with none. */
export function nextMeeting(state: PortalState, today: string): ClassMeeting | undefined {
  return state.teaching.meetings.filter((m) => m.date > today).sort(byClock)[0];
}

/** The enrolled students of one ensemble, by name. */
export function rosterForEnsemble(state: PortalState, ensembleId: string): Student[] {
  return state.teaching.students
    .filter((s) => s.status === 'enrolled' && s.ensembleId === ensembleId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function attendanceForMeeting(state: PortalState, meetingId: string): AttendanceRecord[] {
  return state.teaching.attendance.filter((a) => a.meetingId === meetingId);
}

/** Meetings that have happened with no roll submitted, oldest first. */
export function unsubmittedRollCalls(state: PortalState, today: string): ClassMeeting[] {
  return state.teaching.meetings
    .filter((m) => !m.rollSubmittedAt && m.date <= today)
    .sort(byClock);
}

// --- Attendance -------------------------------------------------------------

export interface MarkCounts {
  present: number;
  late: number;
  absent: number;
  /** Students with any mark at all. */
  marked: number;
}

export function markCounts(records: AttendanceRecord[]): MarkCounts {
  const counts = { present: 0, late: 0, absent: 0, marked: records.length };
  for (const r of records) counts[r.mark] += 1;
  return counts;
}

/** Present and late both count as turning up. Undefined when nobody is marked. */
export function rateOf(records: AttendanceRecord[]): number | undefined {
  if (records.length === 0) return undefined;
  const { present, late } = markCounts(records);
  return (present + late) / records.length;
}

/** How much of the room one meeting was, 0–1. Undefined until roll is taken. */
export function meetingRate(state: PortalState, meetingId: string): number | undefined {
  return rateOf(attendanceForMeeting(state, meetingId));
}

/** One student's rate across a window, or across everything they have attended. */
export function attendanceRateForStudent(
  state: PortalState,
  studentId: string,
  window?: { from: string; to: string },
): number | undefined {
  const inWindow = new Set(
    state.teaching.meetings
      .filter((m) => !window || (m.date >= window.from && m.date <= window.to))
      .map((m) => m.id),
  );
  return rateOf(
    state.teaching.attendance.filter((a) => a.studentId === studentId && inWindow.has(a.meetingId)),
  );
}

export interface TrendPoint {
  meetingId: string;
  date: string;
  /** 0–1. */
  rate: number;
}

/** The last five submitted meetings of one ensemble, oldest first. */
export function ensembleTrend(state: PortalState, ensembleId: string, upTo?: string): TrendPoint[] {
  return state.teaching.meetings
    .filter((m) => m.ensembleId === ensembleId && m.rollSubmittedAt && (!upTo || m.date <= upTo))
    .sort(byClock)
    .slice(-5)
    .map((m) => ({ meetingId: m.id, date: m.date, rate: meetingRate(state, m.id) ?? 0 }));
}

/** How long a meeting runs, in hours. */
export function durationHours(meeting: ClassMeeting): number {
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  return Math.max(0, minutes(meeting.end) - minutes(meeting.start)) / 60;
}

/**
 * What a grant report quotes: meetings held, students served, average
 * attendance and contact hours over a period, optionally for one program.
 * Only submitted roll calls count, because only those are evidence.
 */
export function attendanceSummary(state: PortalState, window: AttendanceWindow): AttendanceSummary {
  const inProgram = (m: ClassMeeting) =>
    !window.programId || ensembleById(state, m.ensembleId)?.programId === window.programId;

  const meetings = state.teaching.meetings.filter(
    (m) => m.rollSubmittedAt && m.date >= window.from && m.date <= window.to && inProgram(m),
  );

  const served = new Set<string>();
  let marked = 0;
  let attended = 0;
  let contactHours = 0;

  for (const meeting of meetings) {
    const records = attendanceForMeeting(state, meeting.id);
    const here = records.filter((r) => r.mark !== 'absent');
    for (const r of here) served.add(r.studentId);
    marked += records.length;
    attended += here.length;
    contactHours += here.length * durationHours(meeting);
  }

  return {
    meetings: meetings.length,
    studentsServed: served.size,
    attendanceRate: marked === 0 ? 0 : attended / marked,
    contactHours: Math.round(contactHours * 10) / 10,
  };
}

/** How many students are on the roster, for the whole studio or one program. */
export function enrolledCount(state: PortalState, programId?: ProgramId): number {
  return state.teaching.students.filter(
    (s) => s.status === 'enrolled' && (!programId || s.programId === programId),
  ).length;
}

/** How many students sit in one ensemble. */
export function ensembleCount(state: PortalState, ensembleId: string): number {
  return state.teaching.students.filter(
    (s) => s.status === 'enrolled' && s.ensembleId === ensembleId,
  ).length;
}

// --- Display helpers --------------------------------------------------------

/** '16:00' → '4:00pm'. Times are stored 24-hour and read 12-hour. */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

/** '16:00'–'17:00' → '4:00pm – 5:00pm'. */
export function timeRange(meeting: ClassMeeting): string {
  return `${timeLabel(meeting.start)} – ${timeLabel(meeting.end)}`;
}

/** 0.94 → '94%'. An unknown rate reads as a dash. */
export function percent(rate: number | undefined): string {
  return rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}
