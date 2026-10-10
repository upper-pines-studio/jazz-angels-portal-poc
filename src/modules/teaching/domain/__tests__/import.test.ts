import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role } from '../../../../core/types';
import {
  parseStudentsCsv,
  readCsv,
  studentsCsvTemplate,
  studentsToImport,
  writeCsv,
} from '../import';
import type { StudentImportContext } from '../import';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { TeachingState } from '../types';

const core = makeCoreSeed();
const teaching = makeSeed();
const ctx: StudentImportContext = {
  programs: core.programs,
  ensembles: teaching.ensembles,
  students: teaching.students,
  today: SEED_TODAY,
};
const BIG_BAND = teaching.ensembles.find(e => e.name === 'Big Band')!;
const EXISTING = teaching.students.find(s => s.status === 'enrolled')!;

const HEADER =
  'Name,Instrument,Years in,Guardian name,Guardian phone,Program,Ensemble,Photo release';
/** The columns before Photo release, for the files written before it existed. */
const OLD_HEADER = 'Name,Instrument,Years in,Guardian name,Guardian phone,Program,Ensemble';

describe('readCsv', () => {
  it('reads quoted cells with commas, doubled quotes and line breaks, and CRLF', () => {
    const text = 'a,b,c\r\n"Lee, Jr.","say ""hi""","two\nlines"\r\nx,,z';
    expect(readCsv(text)).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['Lee, Jr.', 'say "hi"', 'two\nlines'] },
      { line: 4, cells: ['x', '', 'z'] },
    ]);
  });

  it('drops a byte-order mark and a trailing line break', () => {
    expect(readCsv(`${String.fromCharCode(0xfeff)}Name\nMaya\n`)).toEqual([
      { line: 1, cells: ['Name'] },
      { line: 2, cells: ['Maya'] },
    ]);
  });

  it('reads back what writeCsv writes', () => {
    const rows = [
      ['Name', 'Note'],
      ['Ana "AJ" Ruiz', 'Plays, sings\nand writes'],
    ];
    expect(readCsv(writeCsv(rows)).map(r => r.cells)).toEqual(rows);
  });
});

describe('parseStudentsCsv: headers', () => {
  it('matches columns by name in any order and any case, and lists the ones it ignores', () => {
    const text = [
      'ENSEMBLE,email,guardian NAME,name,Years,Instrument,Program,Phone,Notes',
      'Big Band,ana@example.com,Rosa Ruiz,Ana Ruiz,2,Alto sax,Studio Semester Sessions,562-555-0101,',
    ].join('\n');
    const result = parseStudentsCsv(text, ctx);
    expect(result.problems).toEqual([]);
    expect(result.unknownColumns).toEqual(['email', 'Notes']);
    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row.problems).toEqual([]);
    expect(row.defaultChoice).toBe('add');
    expect(row.outcomes.add).toEqual({
      name: 'Ana Ruiz',
      instrument: 'Alto sax',
      yearsIn: 2,
      guardianName: 'Rosa Ruiz',
      guardianPhone: '562-555-0101',
      programId: BIG_BAND.programId,
      ensembleId: BIG_BAND.id,
      status: 'enrolled',
      photoRelease: { status: 'not-asked' },
    });
  });

  it('says so when there is no Name column', () => {
    const result = parseStudentsCsv('Student first,Instrument\nAna,Sax', ctx);
    expect(result.rows).toEqual([]);
    expect(result.problems[0]).toMatch(/No Name column/);
  });

  it('treats a program written by its short name or id as a match', () => {
    const text = `${HEADER}\nAna Ruiz,Sax,1,Rosa Ruiz,,studio,\nBo Lin,Bass,1,Mei Lin,,Jazz Legacy,`;
    const [a, b] = parseStudentsCsv(text, ctx).rows;
    expect(a.problems).toEqual([]);
    expect(a.outcomes.add).toMatchObject({ programId: 'studio-sessions', status: 'waitlist' });
    expect(a.outcomes.add?.ensembleId).toBeUndefined();
    expect(b.outcomes.add).toMatchObject({ programId: 'jazz-legacy', status: 'waitlist' });
  });
});

describe('parseStudentsCsv: rows', () => {
  it('flags a bad row among good ones and leaves the good ones alone', () => {
    const text = [
      HEADER,
      'Ana Ruiz,Alto sax,1,Rosa Ruiz,(562) 555-0101,Studio Semester Sessions,Big Band',
      ',Trumpet,1,Lorraine Robinson,(562) 555-0148,Studio Semester Sessions,Big Band',
      'Bo Lin,Bass,1,Mei Lin,555-01,Studio Semester Sessions,Big Bnd',
      'Cy Park,Drums,1,June Park,,Studio Semester Sessions,',
    ].join('\r\n');
    const { rows } = parseStudentsCsv(text, ctx);
    expect(rows.map(r => r.line)).toEqual([2, 3, 4, 5]);

    expect(rows[0].problems).toEqual([]);
    expect(rows[1].problems).toEqual(['Name is missing']);
    expect(rows[1].outcomes).toEqual({});
    expect(rows[1].defaultChoice).toBe('skip');

    expect(rows[2].problems).toEqual([
      'Phone "555-01" looks wrong; it will be left off',
      'Ensemble "Big Bnd" not found; closest is Big Band',
    ]);
    expect(rows[2].suggestedEnsembleId).toBe(BIG_BAND.id);
    expect(rows[2].defaultChoice).toBe('skip');
    expect(rows[2].outcomes.closest).toMatchObject({ ensembleId: BIG_BAND.id, status: 'enrolled' });
    expect(rows[2].outcomes.closest?.guardianPhone).toBeUndefined();
    expect(rows[2].outcomes.waitlist).toMatchObject({
      programId: 'studio-sessions',
      status: 'waitlist',
    });
    expect(rows[2].outcomes.waitlist?.ensembleId).toBeUndefined();

    expect(rows[3].outcomes.add).toMatchObject({ status: 'waitlist' });

    // As the preview starts: the clean rows go in, the doubtful ones wait for a person.
    expect(studentsToImport(rows, {}).map(s => s.name)).toEqual(['Ana Ruiz', 'Cy Park']);
    // Choosing the closest ensemble for Bo brings him in too.
    expect(studentsToImport(rows, { 4: 'closest' }).map(s => s.name)).toEqual([
      'Ana Ruiz',
      'Bo Lin',
      'Cy Park',
    ]);
  });

  it('offers the closest program, or nothing, for a program we do not have', () => {
    const text = `${HEADER}\nAna Ruiz,Sax,1,Rosa Ruiz,,Homeschol,\nBo Lin,Bass,1,Mei Lin,,Choir,`;
    const [a, b] = parseStudentsCsv(text, ctx).rows;
    expect(a.problems).toEqual([
      'Program "Homeschol" is not one of ours; closest is Homeschool Program',
    ]);
    expect(a.outcomes.closest).toMatchObject({ programId: 'homeschool', status: 'waitlist' });
    expect(b.problems).toEqual(['Program "Choir" is not one of ours']);
    expect(b.outcomes).toEqual({});
  });

  it('says when the ensemble belongs to another program', () => {
    const text = `${HEADER}\nAna Ruiz,Sax,1,Rosa Ruiz,,Homeschool Program,Big Band`;
    const [row] = parseStudentsCsv(text, ctx).rows;
    expect(row.problems).toEqual([
      'Big Band is in Studio Semester Sessions, not Homeschool Program',
    ]);
    expect(row.outcomes.closest).toMatchObject({ ensembleId: BIG_BAND.id });
    expect(row.outcomes.waitlist).toMatchObject({ programId: 'homeschool', status: 'waitlist' });
  });

  it('flags the second of two rows with the same name, and a name already in the portal', () => {
    const text = [
      HEADER,
      'Ana Ruiz,Sax,1,Rosa Ruiz,,Studio Semester Sessions,',
      'ana  ruiz,Flute,1,Rosa Ruiz,,Studio Semester Sessions,',
      `${EXISTING.name.toUpperCase()},Piano,1,Someone,,Studio Semester Sessions,`,
    ].join('\n');
    const { rows } = parseStudentsCsv(text, ctx);
    expect(rows[0].problems).toEqual([]);
    expect(rows[1].problems).toEqual(['ana ruiz appears twice in this file (first on line 2)']);
    expect(rows[1].defaultChoice).toBe('skip');
    expect(rows[1].outcomes.add).toBeDefined();
    expect(rows[2].problems).toEqual([
      `A student named ${EXISTING.name.toUpperCase()} is already enrolled`,
    ]);
    expect(rows[2].defaultChoice).toBe('skip');
  });

  it('says an empty file is empty, and one with only a header has no students', () => {
    expect(parseStudentsCsv('', ctx)).toEqual({
      rows: [],
      unknownColumns: [],
      problems: ['The file is empty.'],
    });
    expect(parseStudentsCsv('\r\n,,\r\n', ctx).problems).toEqual(['The file is empty.']);
    expect(parseStudentsCsv(`${HEADER}\n`, ctx).problems).toEqual([
      'The file names its columns but has no students.',
    ]);
  });
});

describe('studentsCsvTemplate', () => {
  it('round-trips through the parser as one clean row', () => {
    const template = studentsCsvTemplate(ctx);
    expect(template.split('\r\n')[0]).toBe(HEADER);
    const result = parseStudentsCsv(template, { ...ctx, students: [] });
    expect(result.problems).toEqual([]);
    expect(result.unknownColumns).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].problems).toEqual([]);
    expect(result.rows[0].outcomes.add).toMatchObject({
      name: 'Maya Robinson',
      ensembleId: teaching.ensembles[0].id,
      status: 'enrolled',
      photoRelease: { status: 'given', date: SEED_TODAY },
    });
  });

  it('still writes the header when there are no programs or ensembles', () => {
    const template = studentsCsvTemplate({ programs: [], ensembles: [] });
    expect(readCsv(template)[0].cells.join(',')).toBe(HEADER);
  });
});

describe('importStudents', () => {
  function harness(role: Role) {
    let state: TeachingState = makeSeed();
    let n = 0;
    const dispatch = (action: AnyAction) => {
      state = teachingSlice.reducer(state, action);
    };
    const getState = () => ({ core, teaching: state }) as unknown as PortalState;
    const user = { id: 's-keisha', name: 'Keisha', role };
    const actions = guardActions(
      teachingSlice.createActions(dispatch, getState, {
        today: SEED_TODAY,
        newId: (prefix: string) => `${prefix}-new-${(n += 1)}`,
        user,
      }),
      teachingSlice.rules,
      getState,
      user,
    );
    return { actions, students: () => state.students };
  }

  it('adds every student in one change and says how many', () => {
    const h = harness('office-manager');
    const before = h.students().length;
    const { rows } = parseStudentsCsv(
      `${OLD_HEADER}\nAna Ruiz,Sax,1,Rosa Ruiz,,Studio Semester Sessions,Big Band\nBo Lin,Bass,1,Mei Lin,,Homeschool Program,`,
      ctx,
    );
    expect(h.actions.importStudents(studentsToImport(rows, {}))).toBe(2);
    expect(h.students()).toHaveLength(before + 2);
    const added = h.students().slice(-2);
    expect(added.map(s => s.id)).toEqual(['st-new-1', 'st-new-2']);
    expect(added.map(s => s.status)).toEqual(['enrolled', 'waitlist']);
  });

  it('is refused to a role that may not edit students', () => {
    const h = harness('assistant');
    const before = h.students().length;
    expect(
      h.actions.importStudents([
        {
          name: 'Ana Ruiz',
          instrument: 'Sax',
          yearsIn: 1,
          guardianName: 'Rosa Ruiz',
          programId: 'studio-sessions',
          status: 'waitlist',
        },
      ]),
    ).toBeUndefined();
    expect(h.students()).toHaveLength(before);
  });

  it('stamps who recorded a yes or a no, and leaves a blank on Not asked yet', () => {
    const h = harness('office-manager');
    const { rows } = parseStudentsCsv(
      [
        HEADER,
        'Ana Ruiz,Sax,1,Rosa Ruiz,,Studio Semester Sessions,Big Band,yes',
        'Bo Lin,Bass,1,Mei Lin,,Homeschool Program,,No',
        'Cy Moss,Drums,1,Di Moss,,Homeschool Program,,',
      ].join('\n'),
      ctx,
    );
    h.actions.importStudents(studentsToImport(rows, {}));
    expect(
      h
        .students()
        .slice(-3)
        .map(s => s.photoRelease),
    ).toEqual([
      { status: 'given', date: SEED_TODAY, recordedById: 's-keisha' },
      { status: 'not-given', date: SEED_TODAY, recordedById: 's-keisha' },
      { status: 'not-asked' },
    ]);
  });
});

describe('parseStudentsCsv: the Photo release column', () => {
  const parse = (cell: string, header = HEADER) =>
    parseStudentsCsv(
      `${header}\nAna Ruiz,Sax,1,Rosa Ruiz,,Studio Semester Sessions,Big Band,${cell}`,
      ctx,
    ).rows[0];

  it('reads yes as Given and no as Not given, dated the import day, in any case', () => {
    expect(parse('yes').photoRelease).toEqual({ status: 'given', date: SEED_TODAY });
    expect(parse(' YES ').outcomes.add?.photoRelease).toEqual({
      status: 'given',
      date: SEED_TODAY,
    });
    expect(parse('No').photoRelease).toEqual({ status: 'not-given', date: SEED_TODAY });
    expect(parse('yes').problems).toEqual([]);
  });

  it('reads a blank, or no column at all, as Not asked yet', () => {
    expect(parse('').photoRelease).toEqual({ status: 'not-asked' });
    expect(parse('').problems).toEqual([]);
    const old = parseStudentsCsv(
      `${OLD_HEADER}\nAna Ruiz,Sax,1,Rosa Ruiz,,Studio Semester Sessions,Big Band`,
      ctx,
    ).rows[0];
    expect(old.photoRelease).toEqual({ status: 'not-asked' });
    expect(old.problems).toEqual([]);
  });

  it('imports any other answer as Not asked yet, with a note, and still adds the row', () => {
    const row = parse('maybe');
    expect(row.photoRelease).toEqual({ status: 'not-asked' });
    expect(row.problems).toEqual([
      'Photo release "maybe" is not yes or no; it will be Not asked yet',
    ]);
    expect(row.defaultChoice).toBe('add');
  });

  it('answers to "Photo consent" and "Photos" as well', () => {
    const header = OLD_HEADER + ',Photo consent';
    expect(parse('yes', header).photoRelease.status).toBe('given');
    expect(parse('yes', OLD_HEADER + ',Photos').photoRelease.status).toBe('given');
  });
});
