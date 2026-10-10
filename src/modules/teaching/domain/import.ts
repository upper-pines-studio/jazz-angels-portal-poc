import type { Program, ProgramId } from '../../../core';
import type { Ensemble, PhotoReleaseInput, Student, StudentInput, StudentStatus } from './types';

/**
 * Bringing a term's roster in from a spreadsheet (decision 0004): a small CSV
 * reader and writer, the template the office fills in, and the parser that
 * turns the file into rows a person can check before anything is added.
 *
 * Pure: no store, no browser. The import dialog reads the file, hands the text
 * here, and adds the rows the person chose with `importStudents`.
 */

// ---------------------------------------------------------------------------
// CSV reading and writing
// ---------------------------------------------------------------------------

/** One record of a CSV file and the line of the file it starts on (1-based). */
export interface CsvRecord {
  line: number;
  cells: string[];
}

/**
 * Read CSV text: commas between cells, double quotes around a cell that holds
 * a comma, a quote or a line break, a doubled quote for a quote inside one.
 * Accepts CRLF or LF line ends and a leading byte-order mark, as Excel writes.
 */
export function readCsv(text: string): CsvRecord[] {
  const BYTE_ORDER_MARK = 0xfeff;
  const src = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let i = 0;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: startLine, cells });
    cells = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      startLine = line;
    } else {
      cell += ch;
    }
    i += 1;
  }
  // The last record, unless the file ended on a line break.
  if (cell !== '' || cells.length > 0) endRecord();
  return records;
}

/** Write rows as CSV text, quoting only the cells that need it. */
export function writeCsv(rows: Array<Array<string | number | undefined>>): string {
  const cell = (v: string | number | undefined) => {
    const text = v === undefined ? '' : String(v);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// The columns
// ---------------------------------------------------------------------------

type Column =
  | 'name'
  | 'instrument'
  | 'yearsIn'
  | 'guardianName'
  | 'guardianPhone'
  | 'program'
  | 'ensemble'
  | 'photoRelease';

/** The header row of the template, in order. */
export const STUDENT_CSV_COLUMNS: Array<{ column: Column; header: string }> = [
  { column: 'name', header: 'Name' },
  { column: 'instrument', header: 'Instrument' },
  { column: 'yearsIn', header: 'Years in' },
  { column: 'guardianName', header: 'Guardian name' },
  { column: 'guardianPhone', header: 'Guardian phone' },
  { column: 'program', header: 'Program' },
  { column: 'ensemble', header: 'Ensemble' },
  { column: 'photoRelease', header: 'Photo release' },
];

/** Every header a column answers to, after `simplify`. */
const HEADER_NAMES: Record<Column, string[]> = {
  name: ['name', 'student', 'student name'],
  instrument: ['instrument'],
  yearsIn: ['years in', 'years'],
  guardianName: ['guardian name', 'guardian'],
  guardianPhone: ['guardian phone', 'phone'],
  program: ['program'],
  ensemble: ['ensemble'],
  photoRelease: ['photo release', 'photo consent', 'photos'],
};

/** Lower case, punctuation to spaces, single spaces: "Big-Band!" and "big band" compare equal. */
export function simplify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Closest match
// ---------------------------------------------------------------------------

/** How many single-letter edits turn `a` into `b`. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const swap = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + swap);
    }
    prev = next;
  }
  return prev[b.length];
}

interface Candidate<T> {
  value: T;
  /** The names it answers to, already simplified. */
  keys: string[];
}

/** The candidate whose name is exactly `text`, once both are simplified. */
function exact<T>(text: string, candidates: Candidate<T>[]): T | undefined {
  const wanted = simplify(text);
  return candidates.find(c => c.keys.includes(wanted))?.value;
}

/**
 * The candidate `text` most likely meant: one name contains the other ("Legacy"
 * for "Jazz Legacy Program"), or it is a typo or two away ("Big Bnd"). None
 * when nothing is close.
 */
function closest<T>(text: string, candidates: Candidate<T>[]): T | undefined {
  const wanted = simplify(text);
  if (wanted.length < 2) return undefined;
  let best: { value: T; score: number } | undefined;
  for (const c of candidates) {
    for (const key of c.keys) {
      let score: number;
      if (wanted.length >= 3 && (key.includes(wanted) || wanted.includes(key))) score = 0;
      else {
        const d = editDistance(wanted, key);
        if (d > Math.max(1, Math.floor(key.length / 3))) continue;
        score = d;
      }
      if (!best || score < best.score) best = { value: c.value, score };
    }
  }
  return best?.value;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** What the parser needs to know about the portal. */
export interface StudentImportContext {
  programs: Program[];
  ensembles: Ensemble[];
  /** The students already in the portal, to flag a name that is there already. */
  students: Array<Pick<Student, 'name' | 'status'>>;
  /** The import day, which a "yes" or "no" in the Photo release column is dated. */
  today: string;
}

/** What the person can do with one row. */
export type ImportChoice = 'add' | 'closest' | 'waitlist' | 'skip';

export type NewStudent = StudentInput;

export interface ImportRow {
  /** The line of the file the row starts on; the header is line 1. */
  line: number;
  name: string;
  instrument: string;
  yearsIn: number;
  guardianName: string;
  /** Unset when blank, or when it did not look like a phone number. */
  guardianPhone?: string;
  /** Given or Not given dated the import day for "yes" or "no"; Not asked yet otherwise. */
  photoRelease: PhotoReleaseInput;
  /** The Program and Ensemble cells as written. */
  program: string;
  ensemble: string;
  /** Set when the cell names one of ours exactly (case and punctuation aside). */
  programId?: ProgramId;
  ensembleId?: string;
  /** The closest of ours, when the cell does not name one exactly. */
  suggestedProgramId?: ProgramId;
  suggestedEnsembleId?: string;
  /** Plain sentences, one per problem. Empty for a row that can go in as written. */
  problems: string[];
  /** The student each choice would add. A choice with no student is not offered. */
  outcomes: Partial<Record<Exclude<ImportChoice, 'skip'>, NewStudent>>;
  /** What the preview starts on: add a clean row, skip anything that needs a person's eye. */
  defaultChoice: ImportChoice;
}

export interface StudentImport {
  rows: ImportRow[];
  /** Headers that match none of the columns, as written. They are ignored. */
  unknownColumns: string[];
  /** Problems with the file as a whole: empty, no Name column, no rows. */
  problems: string[];
}

const PHONE_DIGITS = /^1?\d{10}$/;

/** A US phone number: ten digits, or eleven with a leading 1, and no letters. */
function looksLikePhone(text: string): boolean {
  if (/[a-wyz]/i.test(text)) return false; // "x" is allowed for an extension
  const digits = text.replace(/x.*$/i, '').replace(/\D/g, '');
  return PHONE_DIGITS.test(digits);
}

const STATUS_WORDS: Record<StudentStatus, string> = {
  enrolled: 'is already enrolled',
  waitlist: 'is already on the waitlist',
  alumni: 'is already in the portal as an alum',
};

/**
 * Read a roster CSV into rows to check. Columns are found by their header,
 * in any order and any case; a column we do not know is listed and ignored.
 * A row with an ensemble is enrolled in it; a row without one goes on the
 * program's waitlist.
 */
export function parseStudentsCsv(text: string, ctx: StudentImportContext): StudentImport {
  const records = readCsv(text).filter(r => r.cells.some(c => c.trim() !== ''));
  if (records.length === 0) {
    return { rows: [], unknownColumns: [], problems: ['The file is empty.'] };
  }

  // Which cell holds which column. The first header that answers to a column wins.
  const [header, ...body] = records;
  const at: Partial<Record<Column, number>> = {};
  const unknownColumns: string[] = [];
  header.cells.forEach((raw, index) => {
    const wanted = simplify(raw);
    if (!wanted) return;
    const column = (Object.keys(HEADER_NAMES) as Column[]).find(c =>
      HEADER_NAMES[c].includes(wanted),
    );
    if (column && at[column] === undefined) at[column] = index;
    else unknownColumns.push(raw.trim());
  });

  if (at.name === undefined) {
    return {
      rows: [],
      unknownColumns,
      problems: [
        'No Name column. The first row names the columns; the blank template shows which ones.',
      ],
    };
  }
  if (body.length === 0) {
    return {
      rows: [],
      unknownColumns,
      problems: ['The file names its columns but has no students.'],
    };
  }

  const programs: Candidate<Program>[] = ctx.programs.map(p => ({
    value: p,
    keys: [simplify(p.name), simplify(p.short), simplify(p.id)],
  }));
  const ensemblesIn = (programId?: ProgramId): Candidate<Ensemble>[] =>
    ctx.ensembles
      .filter(e => !programId || e.programId === programId)
      .map(e => ({ value: e, keys: [simplify(e.name)] }));
  const programName = (id: ProgramId) => ctx.programs.find(p => p.id === id)?.name ?? id;

  const existing = new Map(ctx.students.map(s => [simplify(s.name), s.status]));
  const seen = new Map<string, number>();

  const rows = body.map(({ line, cells }): ImportRow => {
    const get = (column: Column) => {
      const index = at[column];
      return index === undefined ? '' : (cells[index] ?? '').trim();
    };
    const problems: string[] = [];
    /** A problem no choice can fix: the row can only be skipped. */
    let blocked = false;
    /** A problem a person should look at: the row starts on Skip. */
    let doubtful = false;

    const name = get('name').replace(/\s+/g, ' ');
    const instrument = get('instrument');
    const guardianName = get('guardianName');
    if (!name) {
      problems.push('Name is missing');
      blocked = true;
    }
    if (!instrument) {
      problems.push('Instrument is missing');
      blocked = true;
    }
    if (!guardianName) {
      problems.push('Guardian name is missing');
      blocked = true;
    }

    const yearsText = get('yearsIn');
    let yearsIn = 1;
    if (yearsText) {
      const n = Number(yearsText);
      if (Number.isInteger(n) && n >= 1 && n <= 30) yearsIn = n;
      else problems.push(`Years in "${yearsText}" is not a whole number; it will be 1`);
    }

    const phoneText = get('guardianPhone');
    let guardianPhone: string | undefined;
    if (phoneText) {
      if (looksLikePhone(phoneText)) guardianPhone = phoneText;
      else problems.push(`Phone "${phoneText}" looks wrong; it will be left off`);
    }

    // Yes or no, in any case; blank is Not asked yet, and so is anything else, with a note.
    const releaseText = get('photoRelease');
    const releaseWord = simplify(releaseText);
    const photoRelease: PhotoReleaseInput =
      releaseWord === 'yes'
        ? { status: 'given', date: ctx.today }
        : releaseWord === 'no'
          ? { status: 'not-given', date: ctx.today }
          : { status: 'not-asked' };
    if (releaseText && releaseWord !== 'yes' && releaseWord !== 'no')
      problems.push(`Photo release "${releaseText}" is not yes or no; it will be Not asked yet`);

    if (name) {
      const key = simplify(name);
      const status = existing.get(key);
      const firstLine = seen.get(key);
      if (status) {
        problems.push(`A student named ${name} ${STATUS_WORDS[status]}`);
        doubtful = true;
      } else if (firstLine !== undefined) {
        problems.push(`${name} appears twice in this file (first on line ${firstLine})`);
        doubtful = true;
      }
      if (firstLine === undefined) seen.set(key, line);
    }

    // Placement. The ensemble, when it is one of ours, settles the program.
    const program = get('program');
    const ensemble = get('ensemble');
    const programId = program ? exact(program, programs)?.id : undefined;
    const suggestedProgramId = program && !programId ? closest(program, programs)?.id : undefined;
    const ensembleId = ensemble
      ? (exact(ensemble, ensemblesIn(programId)) ?? exact(ensemble, ensemblesIn()))?.id
      : undefined;
    const suggestedEnsembleId =
      ensemble && !ensembleId
        ? (
            closest(ensemble, ensemblesIn(programId ?? suggestedProgramId)) ??
            closest(ensemble, ensemblesIn())
          )?.id
        : undefined;
    const ensembleOf = (id?: string) => ctx.ensembles.find(e => e.id === id);

    /** The program a waitlisted student would wait for: the one named, or its closest. */
    let waitFor: ProgramId | undefined = programId;
    if (!program) {
      if (!ensemble) {
        problems.push('Program is missing');
        blocked = true;
      }
    } else if (!programId) {
      waitFor = suggestedProgramId;
      problems.push(
        suggestedProgramId
          ? `Program "${program}" is not one of ours; closest is ${programName(suggestedProgramId)}`
          : `Program "${program}" is not one of ours`,
      );
    }

    if (ensemble && !ensembleId) {
      const near = ensembleOf(suggestedEnsembleId);
      problems.push(
        near
          ? `Ensemble "${ensemble}" not found; closest is ${near.name}`
          : `Ensemble "${ensemble}" not found`,
      );
    }
    const placed = ensembleOf(ensembleId);
    if (placed && programId && placed.programId !== programId) {
      problems.push(
        `${placed.name} is in ${programName(placed.programId)}, not ${programName(programId)}`,
      );
    }
    // With no program cell, the ensemble names it, exactly or at its closest.
    if (!program) waitFor = (placed ?? ensembleOf(suggestedEnsembleId))?.programId;

    const student = (programFor: ProgramId, ensembleFor?: Ensemble): NewStudent => ({
      name,
      instrument,
      yearsIn,
      guardianName,
      ...(guardianPhone ? { guardianPhone } : {}),
      programId: ensembleFor?.programId ?? programFor,
      ...(ensembleFor ? { ensembleId: ensembleFor.id } : {}),
      status: ensembleFor ? 'enrolled' : 'waitlist',
      photoRelease,
    });

    const outcomes: ImportRow['outcomes'] = {};
    if (!blocked) {
      const placementClean =
        (!program || programId) &&
        (!ensemble || ensembleId) &&
        !(placed && programId && placed.programId !== programId);
      if (placementClean) {
        const home = (placed?.programId ?? programId) as ProgramId;
        outcomes.add = student(home, placed);
      } else {
        // The closest program and ensemble, as far as there are any.
        const nearEnsemble = placed ?? ensembleOf(suggestedEnsembleId);
        const nearProgram = programId ?? suggestedProgramId;
        const closestWorks = (!ensemble || nearEnsemble) && (nearEnsemble || nearProgram);
        if (closestWorks) {
          outcomes.closest = student(
            (nearEnsemble?.programId ?? nearProgram) as ProgramId,
            nearEnsemble,
          );
        }
        if (ensemble && waitFor) outcomes.waitlist = student(waitFor);
      }
    }

    const defaultChoice: ImportChoice = outcomes.add && !doubtful ? 'add' : 'skip';

    return {
      line,
      name,
      instrument,
      yearsIn,
      guardianName,
      ...(guardianPhone ? { guardianPhone } : {}),
      photoRelease,
      program,
      ensemble,
      ...(programId ? { programId } : {}),
      ...(ensembleId ? { ensembleId } : {}),
      ...(suggestedProgramId ? { suggestedProgramId } : {}),
      ...(suggestedEnsembleId ? { suggestedEnsembleId } : {}),
      problems,
      outcomes,
      defaultChoice,
    };
  });

  return { rows, unknownColumns, problems: [] };
}

/** The students the chosen rows add, in file order. Skipped rows add nobody. */
export function studentsToImport(
  rows: ImportRow[],
  choices: Record<number, ImportChoice | undefined>,
): NewStudent[] {
  return rows.flatMap(row => {
    const choice = choices[row.line] ?? row.defaultChoice;
    if (choice === 'skip') return [];
    const student = row.outcomes[choice];
    return student ? [student] : [];
  });
}

/**
 * The blank template: the header row and one example row, placed in the
 * first ensemble we have, so the office sees how a program and an ensemble
 * are written.
 */
export function studentsCsvTemplate(ctx: Pick<StudentImportContext, 'programs' | 'ensembles'>) {
  const ensemble = ctx.ensembles[0];
  const program = ctx.programs.find(p => p.id === ensemble?.programId) ?? ctx.programs[0];
  const example: Record<Column, string | number> = {
    name: 'Maya Robinson',
    instrument: 'Trumpet',
    yearsIn: 1,
    guardianName: 'Lorraine Robinson',
    guardianPhone: '(562) 555-0148',
    program: program?.name ?? '',
    ensemble: ensemble?.name ?? '',
    photoRelease: 'yes',
  };
  return writeCsv([
    STUDENT_CSV_COLUMNS.map(c => c.header),
    STUDENT_CSV_COLUMNS.map(c => example[c.column]),
  ]);
}
