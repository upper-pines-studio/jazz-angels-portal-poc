import { addDays } from 'date-fns';
import {
  activeOnly,
  archivedBy,
  can,
  isArchived,
  pickable,
  toDate,
  toISO,
  withArchived,
} from '../../../core';
import type { PortalState, ProgramId, SignedInUser, StaffMember } from '../../../core';
import { ENSEMBLE_TONES } from './types';
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceWindow,
  ClassMeeting,
  Ensemble,
  EnsembleInput,
  EnsembleTone,
  Mark,
  Student,
  Term,
  TermInput,
} from './types';

/**
 * Derived data for the teaching module. Every function here is pure and takes
 * the whole portal state, so other modules can call the exported ones through
 * `src/modules/teaching/index.ts`.
 */

// --- Lookups ----------------------------------------------------------------

export function ensembleById(state: PortalState, id: string | undefined): Ensemble | undefined {
  return id ? state.teaching.ensembles.find(e => e.id === id) : undefined;
}

export function studentById(state: PortalState, id: string | undefined): Student | undefined {
  return id ? state.teaching.students.find(s => s.id === id) : undefined;
}

export function meetingById(state: PortalState, id: string | undefined): ClassMeeting | undefined {
  return id ? state.teaching.meetings.find(m => m.id === id) : undefined;
}

/** The term `dateISO` falls inside, or the next one to start. An archived term is neither. */
export function termForDate(state: PortalState, dateISO: string): Term | undefined {
  const terms = activeOnly(state.teaching.terms).sort((a, b) => a.start.localeCompare(b.start));
  return (
    terms.find(t => dateISO >= t.start && dateISO <= t.end) ?? terms.find(t => t.start > dateISO)
  );
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

// --- Setting up sessions and ensembles ---------------------------------------

/**
 * The sessions as the Schedule lists them, earliest first: the current ones,
 * then, with `includeArchived`, the archived ones after them.
 */
export function termsList(state: PortalState, includeArchived = false): Term[] {
  const byStart = (a: Term, b: Term) => a.start.localeCompare(b.start);
  return withArchived([...state.teaching.terms].sort(byStart), includeArchived);
}

/**
 * The weeks between two dates, at least one: what a new session plans until
 * the office says otherwise. Sep 13 to Nov 8 is eight weeks.
 */
export function weeksBetween(start: string, end: string): number {
  if (!start || !end || end < start) return 1;
  const days = Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86400000);
  return Math.max(1, Math.round(days / 7));
}

/** What is wrong with a session, field by field. Empty when it can be saved. */
export type TermProblems = Partial<Record<keyof TermInput, string>>;

export function termProblems(input: Partial<TermInput>): TermProblems {
  const problems: TermProblems = {};
  if (!input.name?.trim()) problems.name = 'Give the session a name.';
  if (!input.start) problems.start = 'Pick the day the session starts.';
  if (!input.end) problems.end = 'Pick the day the session ends.';
  else if (input.start && input.end <= input.start)
    problems.end = 'The session has to end after it starts.';
  const planned = input.meetingsPlanned;
  if (planned === undefined || !Number.isInteger(planned) || planned < 1)
    problems.meetingsPlanned = 'Plan at least one class for each ensemble.';
  return problems;
}

/** The first thing wrong with a session, for the store to refuse it with. */
export function termRefusal(input: Partial<TermInput>): string | undefined {
  return Object.values(termProblems(input))[0];
}

/** What is wrong with an ensemble, field by field. Empty when it can be saved. */
export type EnsembleProblems = Partial<Record<keyof EnsembleInput, string>>;

/**
 * An ensemble needs a name no current ensemble already has, a program, a
 * lead, a venue and a tone that exist. `id` is the ensemble being edited, so
 * its own name and its own (possibly since archived) choices still pass.
 */
export function ensembleProblems(
  state: PortalState,
  input: Partial<EnsembleInput>,
  id?: string,
): EnsembleProblems {
  const problems: EnsembleProblems = {};
  const name = input.name?.trim() ?? '';
  if (!name) problems.name = 'Give the ensemble a name.';
  else {
    const taken = activeOnly(state.teaching.ensembles).find(
      e => e.id !== id && e.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken) problems.name = `There is already an ensemble called ${taken.name}.`;
  }
  if (!input.programId || !state.core.programs.some(p => p.id === input.programId))
    problems.programId = 'Pick the program it belongs to.';
  if (!input.leadStaffId || !state.core.staff.some(s => s.id === input.leadStaffId))
    problems.leadStaffId = 'Pick who leads it.';
  if (!input.venueId || !state.core.venues.some(v => v.id === input.venueId))
    problems.venueId = 'Pick where it meets.';
  if (!input.tone || !ENSEMBLE_TONES.includes(input.tone)) problems.tone = 'Pick a colour.';
  return problems;
}

/** The first thing wrong with an ensemble, for the store to refuse it with. */
export function ensembleRefusal(
  state: PortalState,
  input: Partial<EnsembleInput>,
  id?: string,
): string | undefined {
  return Object.values(ensembleProblems(state, input, id))[0];
}

/**
 * Who can lead an ensemble: the current staff who teach, by name, plus
 * `keepId` when the ensemble being edited is led by someone who has since
 * stopped teaching or been archived.
 */
export function leadOptions(state: PortalState, keepId?: string): StaffMember[] {
  return pickable(
    state.core.staff.filter(s => s.teaches || s.id === keepId),
    keepId,
  ).sort((a, b) => a.name.localeCompare(b.name));
}

/** The tone a new ensemble starts with: the first one no current ensemble uses, else blue. */
export function nextTone(state: PortalState): EnsembleTone {
  const used = new Set(activeOnly(state.teaching.ensembles).map(e => e.tone));
  return ENSEMBLE_TONES.find(t => !used.has(t)) ?? 'blue';
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

/**
 * Whether a meeting is on the schedule: every meeting is, except one of an
 * archived ensemble on or after the day it was archived (decision 0002). The
 * ones before stay, with their roll calls.
 */
export function isScheduled(state: PortalState, meeting: ClassMeeting): boolean {
  return !archivedBy(ensembleById(state, meeting.ensembleId), meeting.date);
}

/** The meetings still on the schedule. */
function scheduled(state: PortalState): ClassMeeting[] {
  return state.teaching.meetings.filter(m => isScheduled(state, m));
}

/** Every meeting in the Sunday-to-Saturday week beginning `weekStartISO`. */
export function meetingsForWeek(state: PortalState, weekStartISO: string): ClassMeeting[] {
  const end = toISO(addDays(toDate(weekStartISO), 6));
  return scheduled(state)
    .filter(m => m.date >= weekStartISO && m.date <= end)
    .sort(byClock);
}

/** Today's classes, earliest first. */
export function todaysMeetings(state: PortalState, today: string): ClassMeeting[] {
  return scheduled(state)
    .filter(m => m.date === today)
    .sort(byClock);
}

/** The next class after `today`, for the empty state on a day with none. */
export function nextMeeting(state: PortalState, today: string): ClassMeeting | undefined {
  return scheduled(state)
    .filter(m => m.date > today)
    .sort(byClock)[0];
}

/** The enrolled students of one ensemble, by name. An archived student is not on it. */
export function rosterForEnsemble(state: PortalState, ensembleId: string): Student[] {
  return state.teaching.students
    .filter(s => s.status === 'enrolled' && !isArchived(s) && s.ensembleId === ensembleId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who a roll call lists. An open one is the ensemble's roster today. A
 * submitted one is the record: the roster, plus anyone with a mark at it who
 * has since left the roster or been archived, so past attendance still shows.
 */
export function rollCallStudents(state: PortalState, meeting: ClassMeeting): Student[] {
  const roster = rosterForEnsemble(state, meeting.ensembleId);
  if (!meeting.rollSubmittedAt) return roster;
  const listed = new Set(roster.map(s => s.id));
  const marked = attendanceForMeeting(state, meeting.id)
    .filter(a => !listed.has(a.studentId))
    .map(a => studentById(state, a.studentId))
    .filter((s): s is Student => !!s);
  return [...roster, ...marked].sort((a, b) => a.name.localeCompare(b.name));
}

export function attendanceForMeeting(state: PortalState, meetingId: string): AttendanceRecord[] {
  return state.teaching.attendance.filter(a => a.meetingId === meetingId);
}

/** Meetings on the schedule that have happened with no roll submitted, oldest first. */
export function unsubmittedRollCalls(state: PortalState, today: string): ClassMeeting[] {
  return scheduled(state)
    .filter(m => !m.rollSubmittedAt && m.date <= today)
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
  for (const s of roster)
    marks.set(s.id, records.find(r => r.studentId === s.id)?.mark ?? 'present');
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
      .filter(m => !window || (m.date >= window.from && m.date <= window.to))
      .map(m => m.id),
  );
  return rateOf(
    state.teaching.attendance.filter(a => a.studentId === studentId && inWindow.has(a.meetingId)),
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
    .filter(m => m.ensembleId === ensembleId && m.rollSubmittedAt && (!upTo || m.date <= upTo))
    .sort(byClock)
    .slice(-5)
    .map(m => ({ meetingId: m.id, date: m.date, rate: meetingRate(state, m.id) ?? 0 }));
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
    m => m.rollSubmittedAt && m.date >= window.from && m.date <= window.to && inProgram(m),
  );

  const served = new Set<string>();
  let marked = 0;
  let attended = 0;
  let contactHours = 0;

  for (const meeting of meetings) {
    const records = attendanceForMeeting(state, meeting.id);
    const here = records.filter(r => r.mark !== 'absent');
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

/** The current term that finished most recently before `dateISO`. */
function lastFinishedTerm(state: PortalState, dateISO: string): Term | undefined {
  return activeOnly(state.teaching.terms)
    .filter(t => t.end < dateISO)
    .sort((a, b) => a.end.localeCompare(b.end))
    .pop();
}

/**
 * The attendance rate the dashboard quotes. The last four weeks once they hold
 * enough submitted rolls to mean anything; on the first Sunday of a session
 * they do not, so the previous term answers instead and says so.
 */
export function recentAttendance(
  state: PortalState,
  today: string,
): AttendanceHeadline | undefined {
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

/** How many students are on the roster, for the whole studio or one program. Archived ones are not. */
export function enrolledCount(state: PortalState, programId?: ProgramId): number {
  return activeOnly(state.teaching.students).filter(
    s => s.status === 'enrolled' && (!programId || s.programId === programId),
  ).length;
}

/** How many current students sit in one ensemble. */
export function ensembleCount(state: PortalState, ensembleId: string): number {
  return rosterForEnsemble(state, ensembleId).length;
}

/** How many current students are waiting for a place. */
export function waitlistCount(state: PortalState): number {
  return activeOnly(state.teaching.students).filter(s => s.status === 'waitlist').length;
}

/**
 * The ensembles a list or a picker shows: the current ones, then, with
 * `includeArchived`, the archived ones after them.
 */
export function ensemblesList(state: PortalState, includeArchived = false): Ensemble[] {
  return withArchived(state.teaching.ensembles, includeArchived);
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
  return activeOnly(state.teaching.ensembles)
    .filter(e => !programId || e.programId === programId)
    .map(e => ({ id: e.id, name: e.name }));
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
 * The current ensembles that meet at one venue, for the Partners screens in
 * `app/`. Read through `src/modules/teaching/index.ts`; core itself never asks.
 */
export function classesAtVenue(state: PortalState, venueId: string, today: string): VenueClass[] {
  return activeOnly(state.teaching.ensembles)
    .filter(e => e.venueId === venueId)
    .map(e => {
      const meetings = state.teaching.meetings
        .filter(m => m.ensembleId === e.id && m.venueId === venueId)
        .sort((x, y) => x.date.localeCompare(y.date));
      const next = meetings.find(m => m.date >= today) ?? meetings.at(-1);
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

// ---------------------------------------------------------------------------
// Own classes (decision 0001)
// ---------------------------------------------------------------------------

/**
 * "Own classes" are the ensembles a person leads: `Ensemble.leadStaffId`. The
 * roll call screen, the roster and the slice's rules all ask these, so a
 * hidden button and a refused write agree.
 */
export function leadsEnsemble(
  state: PortalState,
  user: Pick<SignedInUser, 'id'>,
  ensembleId: string | undefined,
): boolean {
  if (!ensembleId) return false;
  return state.teaching.ensembles.find(e => e.id === ensembleId)?.leadStaffId === user.id;
}

/** True when the meeting is a class of an ensemble the person leads. */
export function leadsMeeting(
  state: PortalState,
  user: Pick<SignedInUser, 'id'>,
  meetingId: string | undefined,
): boolean {
  const meeting = state.teaching.meetings.find(m => m.id === meetingId);
  return !!meeting && leadsEnsemble(state, user, meeting.ensembleId);
}

/** May this person take, submit or reopen the roll for this class? */
export function mayTakeRoll(
  state: PortalState,
  user: SignedInUser,
  meetingId: string | undefined,
): boolean {
  return can(user.role, 'roll-call', 'edit', leadsMeeting(state, user, meetingId));
}

/** May this person read this student's name, marks and record? */
export function maySeeStudent(state: PortalState, user: SignedInUser, student: Student): boolean {
  return can(user.role, 'students', 'view', leadsEnsemble(state, user, student.ensembleId));
}

/** May this person read this student's guardian name and phone? */
export function maySeeGuardian(state: PortalState, user: SignedInUser, student: Student): boolean {
  return can(
    user.role,
    'guardian-contacts',
    'view',
    leadsEnsemble(state, user, student.ensembleId),
  );
}

/** A student as the roster shows them: the guardian fields only for those who may see them. */
export type RosterStudent = Omit<Student, 'guardianName' | 'guardianPhone'> & {
  guardianName?: string;
  guardianPhone?: string;
};

/**
 * The students this person may see, by name, archived ones only with
 * `includeArchived` (after the current ones): everyone for the office, a
 * teacher's own classes for a teacher, nobody for a role that sees counts or
 * nothing. Guardian name and phone are left off the record, not just hidden,
 * for anyone who may not see them, so they never reach the screen.
 */
export function rosterFor(
  state: PortalState,
  user: SignedInUser,
  includeArchived = false,
): RosterStudent[] {
  return withArchived(state.teaching.students, includeArchived)
    .filter(s => maySeeStudent(state, user, s))
    .map(s => {
      if (maySeeGuardian(state, user, s)) return s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { guardianName, guardianPhone, ...rest } = s;
      return rest;
    });
}
