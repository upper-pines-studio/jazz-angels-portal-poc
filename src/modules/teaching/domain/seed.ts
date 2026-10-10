import { addDays, addWeeks } from 'date-fns';
import { PARAMOUNT_MS_VENUE_ID, SEED_TODAY, STUDIO_VENUE_ID, toDate, toISO } from '../../../core';
import type { ProgramId } from '../../../core';
import type {
  AttendanceRecord,
  ClassMeeting,
  Ensemble,
  Mark,
  PhotoRelease,
  PhotoReleaseStatus,
  Student,
  TeachingState,
  Term,
} from './types';

/**
 * Demo data for the teaching module (PLATFORM §2.2). "Today" in the story is
 * Sunday 2026-09-13, the first Sunday of the Fall session.
 *
 * Student and guardian names are invented for the demo. They are meant to read
 * like a Long Beach roster; none of them is a real person, and the phone
 * numbers are all in the 555 reserved range.
 */

export { SEED_TODAY };

export const FALL_TERM_ID = 't-fall-2026';
export const SPRING_TERM_ID = 't-spring-2026';

const TERMS: Term[] = [
  {
    id: SPRING_TERM_ID,
    name: 'Spring 2026 session',
    start: '2026-03-01',
    end: '2026-04-26',
    meetingsPlanned: 8,
  },
  {
    id: FALL_TERM_ID,
    name: 'Fall 2026 session',
    start: '2026-09-13',
    end: '2026-11-08',
    meetingsPlanned: 8,
  },
];

// --- Ensembles and the weekly pattern ---------------------------------------

/**
 * The standing week. Every meeting in a term is this pattern repeated, so the
 * pattern lives here rather than on `Ensemble`: once a term is generated the
 * meetings are the record, and a one-off class can sit anywhere.
 */
interface Pattern {
  ensemble: Ensemble;
  /** 0 = Sunday. */
  weekday: number;
  start: string;
  end: string;
}

const PATTERN: Pattern[] = [
  {
    ensemble: {
      id: 'e-combo-a',
      name: 'Combo A',
      programId: 'studio-sessions',
      venueId: STUDIO_VENUE_ID,
      room: 'Studio 1',
      leadStaffId: 's-albert',
      tone: 'blue',
    },
    weekday: 0,
    start: '15:00',
    end: '16:00',
  },
  {
    ensemble: {
      id: 'e-combo-b',
      name: 'Combo B',
      programId: 'studio-sessions',
      venueId: STUDIO_VENUE_ID,
      room: 'Studio 1',
      leadStaffId: 's-barry',
      tone: 'teal',
    },
    weekday: 0,
    start: '16:00',
    end: '17:00',
  },
  {
    ensemble: {
      id: 'e-big-band',
      name: 'Big Band',
      programId: 'studio-sessions',
      venueId: STUDIO_VENUE_ID,
      room: 'Main room',
      leadStaffId: 's-devon',
      tone: 'olive',
    },
    weekday: 0,
    start: '17:15',
    end: '18:45',
  },
  {
    ensemble: {
      id: 'e-homeschool-1',
      name: 'Homeschool I',
      programId: 'homeschool',
      venueId: STUDIO_VENUE_ID,
      room: 'Studio 2',
      leadStaffId: 's-renee',
      tone: 'blue',
    },
    weekday: 1,
    start: '16:00',
    end: '17:00',
  },
  {
    ensemble: {
      id: 'e-homeschool-2',
      name: 'Homeschool II',
      programId: 'homeschool',
      venueId: STUDIO_VENUE_ID,
      room: 'Studio 2',
      leadStaffId: 's-renee',
      tone: 'teal',
    },
    weekday: 1,
    start: '17:15',
    end: '18:15',
  },
  {
    ensemble: {
      id: 'e-jazz-legacy',
      name: 'Jazz Legacy',
      programId: 'jazz-legacy',
      venueId: STUDIO_VENUE_ID,
      room: 'Main room',
      leadStaffId: 's-albert',
      tone: 'olive',
    },
    weekday: 2,
    start: '16:00',
    end: '17:30',
  },
  {
    ensemble: {
      id: 'e-advanced-workshop',
      name: 'Advanced Workshop',
      programId: 'advanced-workshop',
      venueId: STUDIO_VENUE_ID,
      room: 'Studio 1',
      leadStaffId: 's-barry',
      tone: 'blue',
    },
    weekday: 2,
    start: '18:30',
    end: '20:00',
  },
  {
    ensemble: {
      id: 'e-paramount-ms',
      name: 'Paramount MS',
      programId: 'in-school',
      venueId: PARAMOUNT_MS_VENUE_ID,
      room: 'Band room B-12',
      leadStaffId: 's-devon',
      tone: 'neutral',
    },
    weekday: 4,
    start: '15:00',
    end: '16:00',
  },
];

const ENSEMBLES: Ensemble[] = PATTERN.map(p => p.ensemble);

// --- Students ---------------------------------------------------------------

type SeedStudent = [
  name: string,
  instrument: string,
  yearsIn: number,
  guardianName: string,
  guardianPhone: string,
];

/** Roster by ensemble, then the waitlist. 45 enrolled, 4 waiting. */
const ROSTER: Array<{ ensembleId: string; programId: ProgramId; students: SeedStudent[] }> = [
  {
    ensembleId: 'e-combo-a',
    programId: 'studio-sessions',
    students: [
      ['Maya Robinson', 'Trumpet', 3, 'Lorraine Robinson', '(562) 555-0148'],
      ['Devon Ellis', 'Alto sax', 2, 'Angela Ellis', ''],
      ['Priya Raman', 'Piano', 4, 'Sunil Raman', '(562) 555-0193'],
      ['Jonah Kim', 'Upright bass', 1, 'Hana Kim', ''],
      ['Alicia Vargas', 'Drums', 2, 'Rosa Vargas', '(562) 555-0127'],
      ['Theo Bennett', 'Trombone', 1, 'Marcus Bennett', ''],
      ['Naomi Fields', 'Vocals', 3, 'Carla Fields', ''],
      ['Marcus Idowu', 'Tenor sax', 2, 'Bola Idowu', '(562) 555-0164'],
      ['Ruby Castellanos', 'Guitar', 1, 'Elena Castellanos', ''],
      ['Simon Achebe', 'Trumpet', 2, 'Nkechi Achebe', ''],
    ],
  },
  {
    ensembleId: 'e-combo-b',
    programId: 'studio-sessions',
    students: [
      ['Iris Delgado', 'Alto sax', 3, 'Paulina Delgado', '(562) 555-0119'],
      ['Caleb Nguyen', 'Piano', 2, 'Tuyen Nguyen', ''],
      ['Zora Whitfield', 'Drums', 1, 'Andre Whitfield', ''],
      ['Felix Moreau', 'Upright bass', 2, 'Claire Moreau', '(562) 555-0155'],
      ['Tamara Okonjo', 'Vocals', 4, 'Grace Okonjo', ''],
      ['Eli Bernstein', 'Trombone', 1, 'Dana Bernstein', ''],
      ['Rosa Mendoza', 'Trumpet', 2, 'Javier Mendoza', '(562) 555-0176'],
    ],
  },
  {
    ensembleId: 'e-big-band',
    programId: 'studio-sessions',
    students: [
      ['Xavier Toussaint', 'Baritone sax', 3, 'Yvette Toussaint', ''],
      ['Hana Sato', 'Flute', 2, 'Kenji Sato', '(562) 555-0132'],
      ['Desmond Clark', 'Trumpet', 4, 'Irene Clark', ''],
      ['Lila Ferreira', 'Trombone', 2, 'Paulo Ferreira', ''],
      ['Omar Haddad', 'Tenor sax', 3, 'Samira Haddad', '(562) 555-0188'],
      ['Beatriz Pena', 'Piano', 1, 'Miguel Pena', ''],
      ['Curtis Ballard', 'Drums', 3, 'Yolanda Ballard', ''],
      ['Anika Sharma', 'Alto sax', 2, 'Ravi Sharma', '(562) 555-0141'],
    ],
  },
  {
    ensembleId: 'e-homeschool-1',
    programId: 'homeschool',
    students: [
      ['Levi Ostrander', 'Clarinet', 1, 'Bea Ostrander', ''],
      ['Juno Park', 'Violin', 2, 'Min Park', '(562) 555-0109'],
      ['Sadie Kowalski', 'Trumpet', 1, 'Piotr Kowalski', ''],
      ['Malik Robeson', 'Drums', 2, 'Denise Robeson', ''],
    ],
  },
  {
    ensembleId: 'e-homeschool-2',
    programId: 'homeschool',
    students: [
      ['Cora Lindqvist', 'Piano', 3, 'Erik Lindqvist', '(562) 555-0198'],
      ['Ismael Duarte', 'Guitar', 2, 'Ana Duarte', ''],
      ['Wren Callahan', 'Vocals', 1, 'Shannon Callahan', ''],
    ],
  },
  {
    ensembleId: 'e-jazz-legacy',
    programId: 'jazz-legacy',
    students: [
      ['Aurelio Santos', 'Tenor sax', 5, 'Maria Santos', '(562) 555-0121'],
      ['Noor Rahimi', 'Upright bass', 4, 'Farid Rahimi', ''],
      ['Grace Amoako', 'Piano', 4, 'Kwame Amoako', ''],
      ['Tobias Vance', 'Trumpet', 5, 'Lorna Vance', '(562) 555-0166'],
    ],
  },
  {
    ensembleId: 'e-advanced-workshop',
    programId: 'advanced-workshop',
    students: [
      ['Selena Ruiz', 'Alto sax', 5, 'Hector Ruiz', ''],
      ['Dashiell Moore', 'Drums', 4, 'Renata Moore', '(562) 555-0152'],
      ['Ingrid Halvorsen', 'Trombone', 4, 'Peter Halvorsen', ''],
    ],
  },
  {
    ensembleId: 'e-paramount-ms',
    programId: 'in-school',
    students: [
      ['Andre Fuentes', 'Trumpet', 1, 'Lupe Fuentes', ''],
      ['Kayla Simmons', 'Flute', 1, 'Trina Simmons', '(562) 555-0137'],
      ['Mateo Ibarra', 'Trombone', 2, 'Rocio Ibarra', ''],
      ['Destiny Blake', 'Alto sax', 1, 'Monique Blake', ''],
      ['Sohail Aziz', 'Percussion', 2, 'Nadia Aziz', '(562) 555-0183'],
      ['Elena Petrova', 'Clarinet', 1, 'Irina Petrova', ''],
    ],
  },
];

const WAITLIST: Array<{ programId: ProgramId; student: SeedStudent }> = [
  { programId: 'studio-sessions', student: ['Bram Hollis', 'Trumpet', 0, 'Meg Hollis', ''] },
  {
    programId: 'studio-sessions',
    student: ['Nadia Okafor', 'Piano', 0, 'Chidi Okafor', '(562) 555-0114'],
  },
  { programId: 'homeschool', student: ['Colby Renner', 'Drums', 0, 'Jess Renner', ''] },
  { programId: 'in-school', student: ['Yasmin Farouk', 'Vocals', 0, 'Layla Farouk', ''] },
];

/**
 * Photo releases. Most guardians signed at registration; these did not.
 * Omar Haddad and Beatriz Pena are in Big Band and Elena Petrova in Paramount
 * MS, both Devon's, so a teacher's roll call shows the marker.
 */
const NOT_GIVEN = new Set(['Omar Haddad', 'Ruby Castellanos']);
const NOT_ASKED = new Set([
  'Beatriz Pena',
  'Elena Petrova',
  'Theo Bennett',
  'Wren Callahan',
  'Bram Hollis',
  'Colby Renner',
]);

/** Fall registration day, when the office collected the forms. Returning students signed in spring. */
const FALL_SIGN_UP = '2026-09-06';
const SPRING_SIGN_UP = '2026-03-01';

function seedRelease(name: string, yearsIn: number): PhotoRelease {
  const status: PhotoReleaseStatus = NOT_GIVEN.has(name)
    ? 'not-given'
    : NOT_ASKED.has(name)
      ? 'not-asked'
      : 'given';
  if (status === 'not-asked') return { status };
  return {
    status,
    date: status === 'given' && yearsIn > 1 ? SPRING_SIGN_UP : FALL_SIGN_UP,
    recordedById: 's-keisha',
  };
}

function buildStudents(): Student[] {
  const out: Student[] = [];
  const id = () => `st-${String(out.length + 1).padStart(2, '0')}`;

  for (const group of ROSTER) {
    for (const [name, instrument, yearsIn, guardianName, guardianPhone] of group.students) {
      out.push({
        id: id(),
        name,
        instrument,
        yearsIn,
        guardianName,
        guardianPhone: guardianPhone || undefined,
        programId: group.programId,
        ensembleId: group.ensembleId,
        status: 'enrolled',
        photoRelease: seedRelease(name, yearsIn),
      });
    }
  }
  for (const row of WAITLIST) {
    const [name, instrument, yearsIn, guardianName, guardianPhone] = row.student;
    out.push({
      id: id(),
      name,
      instrument,
      yearsIn,
      guardianName,
      guardianPhone: guardianPhone || undefined,
      programId: row.programId,
      status: 'waitlist',
      photoRelease: seedRelease(name, yearsIn),
    });
  }
  return out;
}

// --- Meetings ---------------------------------------------------------------

/** The first `weekday` on or after `startISO`. */
function firstOccurrence(startISO: string, weekday: number): Date {
  const start = toDate(startISO);
  return addDays(start, (weekday - start.getDay() + 7) % 7);
}

/** `meetingsPlanned` weekly meetings per ensemble, from the standing pattern. */
function buildMeetings(term: Term, suffix: string): ClassMeeting[] {
  return PATTERN.flatMap(p => {
    const first = firstOccurrence(term.start, p.weekday);
    return Array.from({ length: term.meetingsPlanned }, (_, i) => ({
      id: `${p.ensemble.id}-${suffix}${i + 1}`,
      ensembleId: p.ensemble.id,
      date: toISO(addWeeks(first, i)),
      start: p.start,
      end: p.end,
      venueId: p.ensemble.venueId,
      room: p.ensemble.room,
    }));
  });
}

// --- Attendance -------------------------------------------------------------

/** A tiny deterministic PRNG, so the demo data is the same on every reseed. */
function rngFor(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function record(meetingId: string, studentId: string, mark: Mark): AttendanceRecord {
  return { id: `att-${meetingId}-${studentId}`, meetingId, studentId, mark };
}

const SPRING_NOTES = [
  'Worked the head on Blue Bossa, traded fours.',
  'Sectionals for the first half, full band on the shout chorus.',
  'Slow blues in F. Everyone soloed twice.',
  'Read down two new charts, tempo still soft.',
  'Rhythm section stayed after to lock the groove.',
];

/**
 * Last spring's term: every roll submitted, 85–96% of each roster in the room,
 * so a grant period and the attendance trend both have history.
 */
function seedSpringAttendance(
  meetings: ClassMeeting[],
  students: Student[],
): { meetings: ClassMeeting[]; attendance: AttendanceRecord[] } {
  const attendance: AttendanceRecord[] = [];

  const submitted = meetings.map((meeting, index) => {
    const roster = students.filter(
      s => s.status === 'enrolled' && s.ensembleId === meeting.ensembleId,
    );
    const random = rngFor(meeting.id);
    const rate = 0.85 + random() * 0.11;
    const absent = Math.max(0, Math.round(roster.length * (1 - rate)));
    const late = roster.length >= 6 && random() < 0.6 ? 1 : 0;

    // Deterministic shuffle: the first few are out, the next one is late.
    const order = roster
      .map(s => ({ s, k: random() }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.s);

    order.forEach((student, i) => {
      const mark: Mark = i < absent ? 'absent' : i < absent + late ? 'late' : 'present';
      attendance.push(record(meeting.id, student.id, mark));
    });

    return {
      ...meeting,
      rollSubmittedAt: `${meeting.date}T${meeting.end}:00.000Z`,
      notes: SPRING_NOTES[index % SPRING_NOTES.length],
    };
  });

  return { meetings: submitted, attendance };
}

/**
 * Fall week 1. Combo A met at 3:00pm and its roll is in: nine present, one
 * late. Combo B at 4:00pm and Big Band at 5:15pm are still to come today and
 * nobody has taken roll.
 */
function seedFallWeekOne(
  meetings: ClassMeeting[],
  students: Student[],
): { meetings: ClassMeeting[]; attendance: AttendanceRecord[] } {
  const comboA = meetings.find(m => m.id === 'e-combo-a-f1');
  if (!comboA) return { meetings, attendance: [] };

  const roster = students.filter(s => s.status === 'enrolled' && s.ensembleId === 'e-combo-a');
  const attendance = roster.map((student, i) =>
    record(comboA.id, student.id, i === 3 ? 'late' : 'present'),
  );

  return {
    meetings: meetings.map(m =>
      m.id === comboA.id
        ? {
            ...m,
            rollSubmittedAt: `${m.date}T${m.end}:00.000Z`,
            notes: 'First Sunday back. Ran the Autumn Leaves head, set the solo order.',
          }
        : m,
    ),
    attendance,
  };
}

// --- The seed ---------------------------------------------------------------

/** A fresh copy of the demo data. Never mutate the result in place. */
export function makeSeed(): TeachingState {
  const students = buildStudents();

  const spring = seedSpringAttendance(buildMeetings(TERMS[0], 's'), students);
  const fall = seedFallWeekOne(buildMeetings(TERMS[1], 'f'), students);

  return {
    terms: TERMS.map(t => ({ ...t })),
    ensembles: ENSEMBLES.map(e => ({ ...e })),
    meetings: [...spring.meetings, ...fall.meetings],
    students,
    attendance: [...spring.attendance, ...fall.attendance],
  };
}

/** What a new office starts with when the demo is off (decision 0004): nothing yet. */
export function makeEmpty(): TeachingState {
  return { terms: [], ensembles: [], meetings: [], students: [], attendance: [] };
}
