import { addDays } from 'date-fns';
import { toDate, toISO } from '../../../core';
import type { PortalState, ProgramId } from '../../../core';
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceWindow,
  ClassMeeting,
  Ensemble,
  Mark,
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

/** "Fall 2026 session" in week 1 reads "Fall session week 1". Undefined outside a term. */
export function sessionWeekLabel(state: PortalState, today: string): string | undefined {
  const term = termForDate(state, today);
  const week = termWeek(term, today);
  if (!term || !week) return undefined;
  return `${term.name.replace(/ \d{4}/, '')} week ${week}`;
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

/**
 * The marks an open roll call shows. Everyone starts present; the teacher only
 * marks who is late or absent. Submitting writes the present marks down.
 */
export function rollMarks(roster: Student[], records: AttendanceRecord[]): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  for (const s of roster) marks.set(s.id, records.find((r) => r.studentId === s.id)?.mark ?? 'present');
  return marks;
}

export function rollCounts(marks: Map<string, Mark>): MarkCounts {
  const counts = { present: 0, late: 0, absent: 0, marked: marks.size };
  for (const mark of marks.values()) counts[mark] += 1;
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

/** Four weeks back, counting today. */
const RECENT_DAYS = 27;

/** Fewer submitted rolls than this and one class would be speaking for the lot. */
const RECENT_MINIMUM = 4;

/** An attendance figure worth showing, and the words that say what it covers. */
export interface AttendanceHeadline {
  /** 0–1. */
  rate: number;
  /** "Last 4 weeks · 12 classes", or the name of the term it came from. */
  footnote: string;
}

/** The term that finished most recently before `dateISO`. */
function lastFinishedTerm(state: PortalState, dateISO: string): Term | undefined {
  return [...state.teaching.terms]
    .filter((t) => t.end < dateISO)
    .sort((a, b) => a.end.localeCompare(b.end))
    .pop();
}

/**
 * The attendance rate the dashboard quotes. The last four weeks once they hold
 * enough submitted rolls to mean anything; on the first Sunday of a session
 * they do not, so the previous term answers instead and says so.
 */
export function recentAttendance(state: PortalState, today: string): AttendanceHeadline | undefined {
  const recent = attendanceSummary(state, {
    from: toISO(addDays(toDate(today), -RECENT_DAYS)),
    to: today,
  });
  if (recent.meetings >= RECENT_MINIMUM) {
    return {
      rate: recent.attendanceRate,
      footnote: `Last 4 weeks · ${recent.meetings} ${recent.meetings === 1 ? 'class' : 'classes'}`,
    };
  }

  const previous = lastFinishedTerm(state, today);
  if (!previous) return undefined;
  const term = attendanceSummary(state, { from: previous.start, to: previous.end });
  if (term.meetings === 0) return undefined;
  return { rate: term.attendanceRate, footnote: previous.name };
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

/**
 * The ensembles a picker can offer: id and name, nothing else. This is what
 * other modules read through `src/modules/teaching/index.ts`, so nobody has to
 * reach into `state.teaching`. `programId` narrows it to one program's groups.
 */
export function ensembleOptions(
  state: PortalState,
  programId?: ProgramId,
): Array<{ id: string; name: string }> {
  return state.teaching.ensembles
    .filter((e) => !programId || e.programId === programId)
    .map((e) => ({ id: e.id, name: e.name }));
}

/** One ensemble as a venue page lists it: what meets here, when, led by whom. */
export interface VenueClass {
  ensembleId: string;
  name: string;
  programId: ProgramId;
  room: string;
  leadStaffId: string;
  enrolled: number;
  /** "Thursday · 3:00pm – 4:00pm", from the next meeting on or after today, else the last one. */
  when?: string;
}

/**
 * The ensembles that meet at one venue, for the Partners screens in `app/`.
 * Read through `src/modules/teaching/index.ts`; core itself never asks.
 */
export function classesAtVenue(state: PortalState, venueId: string, today: string): VenueClass[] {
  return state.teaching.ensembles
    .filter((e) => e.venueId === venueId)
    .map((e) => {
      const meetings = state.teaching.meetings
        .filter((m) => m.ensembleId === e.id && m.venueId === venueId)
        .sort((x, y) => x.date.localeCompare(y.date));
      const next = meetings.find((m) => m.date >= today) ?? meetings.at(-1);
      return {
        ensembleId: e.id,
        name: e.name,
        programId: e.programId,
        room: e.room,
        leadStaffId: e.leadStaffId,
        enrolled: ensembleCount(state, e.id),
        when: next ? `${WEEKDAYS[toDate(next.date).getDay()]} · ${timeRange(next)}` : undefined,
      };
    });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
