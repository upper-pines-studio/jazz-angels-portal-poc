import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import {
  hasNoPhotoRelease,
  maySeePhotoRelease,
  photoReleaseRefusal,
  rollCallStudentsFor,
  rosterFor,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { StudentInput, TeachingState } from '../types';

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const DEVON: SignedInUser = { id: 's-devon', name: 'Devon Price', role: 'teacher' };
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

/** The teaching slice behind its real rules, today being the seed's Sunday. */
function harness(user: SignedInUser = KEISHA, start: TeachingState = makeSeed()) {
  let teaching = start;
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
      { today: SEED_TODAY, newId: p => `${p}-a${(n += 1)}`, user },
    ),
    teachingSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  const student = (id: string) => portal().teaching.students.find(s => s.id === id)!;
  const named = (name: string) => portal().teaching.students.find(s => s.name === name)!;
  return { actions, portal, refused, sent, student, named };
}

const NEW: StudentInput = {
  name: 'Ada Okoye',
  instrument: 'Trumpet',
  yearsIn: 1,
  guardianName: 'Ngozi Okoye',
  programId: 'studio-sessions',
  status: 'waitlist',
};

describe('a photo release on the student', () => {
  it('starts on Not asked yet for a new student', () => {
    const h = harness();
    const id = h.actions.enrollStudent(NEW);
    expect(h.student(id).photoRelease).toEqual({ status: 'not-asked' });
  });

  it('is set in Enroll, dated today unless a date is sent, and credited to who enrolled', () => {
    const h = harness();
    const given = h.actions.enrollStudent({ ...NEW, photoRelease: { status: 'given' } });
    const refused = h.actions.enrollStudent({
      ...NEW,
      name: 'Bo Okoye',
      photoRelease: { status: 'not-given', date: '2026-09-10' },
    });
    expect(h.student(given).photoRelease).toEqual({
      status: 'given',
      date: SEED_TODAY,
      recordedById: 's-keisha',
    });
    expect(h.student(refused).photoRelease).toEqual({
      status: 'not-given',
      date: '2026-09-10',
      recordedById: 's-keisha',
    });
  });

  it('is changed with setPhotoRelease, which stamps who recorded it from the signed-in person', () => {
    const h = harness();
    const beatriz = h.named('Beatriz Pena');
    expect(beatriz.photoRelease.status).toBe('not-asked');

    h.actions.setPhotoRelease(beatriz.id, { status: 'given', date: '2026-09-12' });
    expect(h.student(beatriz.id).photoRelease).toEqual({
      status: 'given',
      date: '2026-09-12',
      recordedById: 's-keisha',
    });
    expect(teachingSlice.describe!(h.sent[0])).toBe('the photo release');

    // Back to Not asked yet: no date, nobody.
    h.actions.setPhotoRelease(beatriz.id, { status: 'not-asked', date: '2026-09-12' });
    expect(h.student(beatriz.id).photoRelease).toEqual({ status: 'not-asked' });
  });

  it('is not changed through updateStudent, which cannot say who recorded it', () => {
    const h = harness();
    const beatriz = h.named('Beatriz Pena');
    h.actions.updateStudent(beatriz.id, {
      yearsIn: 2,
      photoRelease: { status: 'given', recordedById: 's-gwen' },
    } as never);
    expect(h.student(beatriz.id)).toMatchObject({
      yearsIn: 2,
      photoRelease: { status: 'not-asked' },
    });
  });
});

describe('who may change a photo release', () => {
  it('is whoever may edit the student: the office yes, a teacher, an assistant, a bookkeeper and Read-only no', () => {
    for (const role of ['admin', 'director', 'office-manager'] as Role[]) {
      const h = harness(as(role));
      const omar = h.named('Omar Haddad');
      h.actions.setPhotoRelease(omar.id, { status: 'given' });
      expect(h.refused).toEqual([]);
      expect(h.student(omar.id).photoRelease).toMatchObject({ status: 'given', date: SEED_TODAY });
    }
    for (const role of ['teacher', 'assistant', 'bookkeeper', 'read-only'] as Role[]) {
      // A teacher is refused even for a student in a class they lead.
      const h = harness(role === 'teacher' ? DEVON : as(role));
      const omar = h.named('Omar Haddad');
      h.actions.setPhotoRelease(omar.id, { status: 'given' });
      expect(h.refused).toHaveLength(1);
      expect(h.student(omar.id).photoRelease.status).toBe('not-given');
    }
  });

  it('refuses an answer that is not one of the three, or a date that is not a date, saying why', () => {
    const h = harness();
    const omar = h.named('Omar Haddad');
    h.actions.setPhotoRelease(omar.id, { status: 'maybe' as never });
    h.actions.setPhotoRelease(omar.id, { status: 'given', date: 'Sept 12' });
    expect(h.refused).toEqual([
      'Pick Given, Not given or Not asked yet.',
      'Pick the date the guardian answered.',
    ]);
    expect(h.student(omar.id).photoRelease.status).toBe('not-given');
  });

  it('tells the card when the date is after today', () => {
    expect(photoReleaseRefusal({ status: 'given', date: '2026-09-14' }, SEED_TODAY)).toBe(
      'Pick a date on or before today.',
    );
    expect(photoReleaseRefusal({ status: 'given', date: SEED_TODAY }, SEED_TODAY)).toBeUndefined();
    expect(photoReleaseRefusal({ status: 'not-asked' }, SEED_TODAY)).toBeUndefined();
  });
});

describe('who sees a photo release', () => {
  const state = harness().portal();

  it('follows guardian contact details: the office everyone, a teacher their own classes', () => {
    for (const role of ['admin', 'director', 'office-manager'] as Role[]) {
      const roster = rosterFor(state, as(role));
      expect(roster.length).toBeGreaterThan(0);
      expect(roster.every(s => s.photoRelease !== undefined)).toBe(true);
    }
    const devons = rosterFor(state, DEVON);
    expect(devons.length).toBeGreaterThan(0);
    expect(devons.every(s => s.photoRelease !== undefined)).toBe(true);
    const omar = state.teaching.students.find(s => s.name === 'Omar Haddad')!;
    const maya = state.teaching.students.find(s => s.name === 'Maya Robinson')!;
    expect(maySeePhotoRelease(state, DEVON, omar)).toBe(true);
    expect(maySeePhotoRelease(state, DEVON, maya)).toBe(false);
  });

  it('is left off the record for the Office assistant, who sees students without contacts', () => {
    const roster = rosterFor(state, as('assistant'));
    expect(roster.length).toBeGreaterThan(0);
    expect(roster.some(s => 'photoRelease' in s)).toBe(false);
    expect(roster.some(s => hasNoPhotoRelease(s))).toBe(false);
  });

  it('reaches nobody who sees counts only or no students', () => {
    expect(rosterFor(state, as('read-only'))).toEqual([]);
    expect(rosterFor(state, as('bookkeeper'))).toEqual([]);
  });

  it('marks who has no release: Not given and Not asked yet, never Given', () => {
    const byName = (name: string) => state.teaching.students.find(s => s.name === name)!;
    expect(hasNoPhotoRelease(byName('Omar Haddad'))).toBe(true);
    expect(hasNoPhotoRelease(byName('Beatriz Pena'))).toBe(true);
    expect(hasNoPhotoRelease(byName('Hana Sato'))).toBe(false);
  });

  it('on a submitted roll call, keeps a moved student’s release only for who may still see it', () => {
    const h = harness();
    const meeting = h.portal().teaching.meetings.find(m => m.id === 'e-big-band-f1')!;
    h.actions.submitRollCall(meeting.id);
    const omar = h.named('Omar Haddad');
    // Omar moves from Devon's Big Band to Barry's Combo B after the roll is in.
    h.actions.updateStudent(omar.id, { ensembleId: 'e-combo-b' });
    const submitted = h.portal().teaching.meetings.find(m => m.id === meeting.id)!;

    const forDevon = rollCallStudentsFor(h.portal(), DEVON, submitted);
    const omarForDevon = forDevon.find(s => s.id === omar.id)!;
    expect(omarForDevon).toBeDefined();
    expect(omarForDevon).not.toHaveProperty('photoRelease');
    expect(omarForDevon).not.toHaveProperty('guardianName');
    // His classmates still in Big Band keep theirs.
    expect(forDevon.find(s => s.name === 'Beatriz Pena')!.photoRelease?.status).toBe('not-asked');

    const forKeisha = rollCallStudentsFor(h.portal(), KEISHA, submitted);
    expect(forKeisha.find(s => s.id === omar.id)!.photoRelease?.status).toBe('not-given');
  });
});

describe('the demo seed', () => {
  it('gives a mix of the three answers, with some of each in a class Devon leads', () => {
    const { students, ensembles } = makeSeed();
    const count = (status: string) => students.filter(s => s.photoRelease.status === status).length;
    expect(count('given')).toBeGreaterThan(count('not-given') + count('not-asked'));
    expect(count('not-given')).toBeGreaterThanOrEqual(2);
    expect(count('not-asked')).toBeGreaterThanOrEqual(3);
    const devons = new Set(ensembles.filter(e => e.leadStaffId === 's-devon').map(e => e.id));
    const inDevons = students.filter(s => s.ensembleId && devons.has(s.ensembleId));
    expect(inDevons.some(s => s.photoRelease.status === 'not-given')).toBe(true);
    expect(inDevons.some(s => s.photoRelease.status === 'not-asked')).toBe(true);
    // A given or refused release says when and who.
    for (const s of students.filter(s => s.photoRelease.status !== 'not-asked'))
      expect(s.photoRelease).toMatchObject({ date: expect.any(String), recordedById: 's-keisha' });
  });
});

describe('loading saved students', () => {
  it('loads a student saved before photo releases as Not asked yet', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    for (const s of saved.students) delete s.photoRelease;
    const loaded = teachingSlice.normalise!(saved)!;
    expect(loaded.students.every(s => s.photoRelease.status === 'not-asked')).toBe(true);
    expect(loaded.students[0].photoRelease).toEqual({ status: 'not-asked' });
  });

  it('keeps a sound release and turns an unknown answer into Not asked yet', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    saved.students[0].photoRelease = { status: 'perhaps', date: SEED_TODAY };
    saved.students[1].photoRelease = { status: 'given', date: 42, recordedById: 's-gwen' };
    const loaded = teachingSlice.normalise!(saved)!;
    expect(loaded.students[0].photoRelease).toEqual({ status: 'not-asked' });
    expect(loaded.students[1].photoRelease).toEqual({ status: 'given', recordedById: 's-gwen' });
    expect(loaded.students[2].photoRelease).toEqual(makeSeed().students[2].photoRelease);
  });
});
