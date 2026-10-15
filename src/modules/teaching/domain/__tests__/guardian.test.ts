import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { rollCallStudentsFor, rosterFor } from '../derive';
import {
  guardianAddressRefusal,
  guardianEmailRefusal,
  looksLikeEmail,
  readAddressLine,
  tidyAddress,
} from '../guardian';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { StudentInput, TeachingState } from '../types';

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const DEVON: SignedInUser = { id: 's-devon', name: 'Devon Price', role: 'teacher' };
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

const PARAMOUNT = { street: '8500 Contreras St', city: 'Paramount', state: 'CA', zip: '90723' };

/** The teaching slice behind its real rules, today being the seed's Sunday. */
function harness(user: SignedInUser = KEISHA, start: TeachingState = makeSeed()) {
  let teaching = start;
  let n = 0;
  const refused: string[] = [];
  const portal = () => ({ core: makeCoreSeed(), teaching }) as unknown as PortalState;
  const actions = guardActions(
    teachingSlice.createActions(
      action => {
        teaching = teachingSlice.reducer(teaching, action);
      },
      portal,
      { today: SEED_TODAY, newId: p => `${p}-g${(n += 1)}`, user },
    ),
    teachingSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  const student = (id: string) => portal().teaching.students.find(s => s.id === id)!;
  return { actions, portal, refused, student };
}

const NEW: StudentInput = {
  name: 'Ada Okoye',
  instrument: 'Trumpet',
  yearsIn: 1,
  guardianName: 'Ngozi Okoye',
  programId: 'studio-sessions',
  status: 'waitlist',
};

describe('the demo seed guardians', () => {
  const students = makeSeed().students;
  const withEmail = students.filter(s => s.guardianEmail);
  const withAddress = students.filter(s => s.guardianAddress);

  it('gives about half the students an email and about a third an address', () => {
    expect(withEmail.length / students.length).toBeGreaterThan(0.4);
    expect(withEmail.length / students.length).toBeLessThan(0.6);
    expect(withAddress.length / students.length).toBeGreaterThan(0.25);
    expect(withAddress.length / students.length).toBeLessThan(0.45);
    expect(students.length - withEmail.length).toBeGreaterThan(0);
  });

  it('only gives an address to a student who also has an email', () => {
    for (const s of withAddress) expect(s.guardianEmail).toBeTruthy();
  });

  it('uses emails the store accepts, on a reserved example domain', () => {
    for (const s of withEmail) {
      expect(guardianEmailRefusal(s.guardianEmail)).toBeUndefined();
      expect(looksLikeEmail(s.guardianEmail!)).toBe(true);
      expect(s.guardianEmail).toMatch(/@example\.(com|org)$/);
    }
  });

  it('uses whole Long Beach addresses the store accepts', () => {
    for (const s of withAddress) {
      const a = s.guardianAddress!;
      expect(guardianAddressRefusal(a)).toBeUndefined();
      expect(tidyAddress(a)).toEqual(a);
      expect(a.city).toBe('Long Beach');
      expect(a.state).toBe('CA');
      expect(a.zip).toMatch(/^908\d\d$/);
    }
  });
});

describe('a guardian email', () => {
  it('is fine blank, and refused with a plain message when it is not an email', () => {
    expect(guardianEmailRefusal(undefined)).toBeUndefined();
    expect(guardianEmailRefusal('  ')).toBeUndefined();
    expect(guardianEmailRefusal(' ngozi@example.com ')).toBeUndefined();
    for (const bad of ['ngozi', 'ngozi@', 'ngozi@example', 'ngozi @example.com']) {
      expect(looksLikeEmail(bad)).toBe(false);
      expect(guardianEmailRefusal(bad)).toBe(
        'Check the email. It should look like name@example.com.',
      );
    }
  });
});

describe('a guardian address', () => {
  it('is all four parts or none, and says which parts are missing', () => {
    expect(guardianAddressRefusal(undefined)).toBeUndefined();
    expect(guardianAddressRefusal(PARAMOUNT)).toBeUndefined();
    expect(guardianAddressRefusal({ street: ' ', city: '', state: '', zip: '' })).toBeUndefined();
    expect(guardianAddressRefusal({ ...PARAMOUNT, zip: '' })).toBe(
      'Add the ZIP, or leave the address blank.',
    );
    expect(guardianAddressRefusal({ street: '', city: 'Paramount', state: '', zip: '' })).toBe(
      'Add the street, state and ZIP, or leave the address blank.',
    );
  });

  it('is tidied to its trimmed parts, or to none when every part is blank', () => {
    expect(
      tidyAddress({ street: ' 8500 Contreras St ', city: 'Paramount ', state: 'CA', zip: '90723' }),
    ).toEqual(PARAMOUNT);
    expect(tidyAddress({ street: '', city: ' ', state: '', zip: '' })).toBeUndefined();
  });

  it('is read from one line only when it holds a street, a city, a state and a ZIP', () => {
    expect(readAddressLine('8500 Contreras St, Paramount, CA 90723')).toEqual(PARAMOUNT);
    expect(readAddressLine('8500 Contreras St, Paramount, CA, 90723-1234')).toEqual({
      ...PARAMOUNT,
      zip: '90723-1234',
    });
    expect(readAddressLine('8500 Contreras St, Paramount')).toBeUndefined();
    expect(readAddressLine('Paramount, CA 90723')).toBeUndefined();
    expect(readAddressLine('8500 Contreras St Paramount CA 90723')).toBeUndefined();
  });
});

describe('the store', () => {
  it('saves a guardian email and address on Enroll, and changes them later', () => {
    const h = harness();
    const id = h.actions.enrollStudent({
      ...NEW,
      guardianEmail: 'ngozi@example.com',
      guardianAddress: PARAMOUNT,
    });
    expect(h.student(id)).toMatchObject({
      guardianEmail: 'ngozi@example.com',
      guardianAddress: PARAMOUNT,
    });
    h.actions.updateStudent(id, {
      guardianEmail: undefined,
      guardianAddress: { street: '', city: '', state: '', zip: '' },
    });
    expect(h.student(id).guardianEmail).toBeUndefined();
    expect(h.student(id).guardianAddress).toBeUndefined();
    expect(h.refused).toEqual([]);
  });

  it('refuses a bad email or half an address, on Enroll and on a change, saying why', () => {
    const h = harness();
    const before = h.portal().teaching.students.length;
    expect(h.actions.enrollStudent({ ...NEW, guardianEmail: 'ngozi@' })).toBeUndefined();
    expect(
      h.actions.enrollStudent({ ...NEW, guardianAddress: { ...PARAMOUNT, city: '' } }),
    ).toBeUndefined();
    expect(h.portal().teaching.students).toHaveLength(before);

    const id = h.portal().teaching.students[0].id;
    h.actions.updateStudent(id, { guardianEmail: 'not an email' });
    expect(h.student(id).guardianEmail).not.toBe('not an email');
    expect(h.refused).toEqual([
      'Check the email. It should look like name@example.com.',
      'Add the city, or leave the address blank.',
      'Check the email. It should look like name@example.com.',
    ]);
  });
});

describe('who sees the guardian email and address', () => {
  /** The seed with every student given a guardian email and address. */
  const withContacts = (): PortalState =>
    ({
      core: makeCoreSeed(),
      teaching: {
        ...makeSeed(),
        students: makeSeed().students.map(s => ({
          ...s,
          guardianEmail: 'family@example.com',
          guardianAddress: PARAMOUNT,
        })),
      },
    }) as unknown as PortalState;

  it('reaches the office and a teacher for their own classes', () => {
    const state = withContacts();
    expect(rosterFor(state, KEISHA).every(s => s.guardianEmail && s.guardianAddress)).toBe(true);
    const own = rosterFor(state, DEVON);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every(s => s.guardianEmail && s.guardianAddress)).toBe(true);
  });

  it('is left off the record for whoever may not see the guardian phone', () => {
    const state = withContacts();
    const roster = rosterFor(state, as('assistant'));
    expect(roster.length).toBeGreaterThan(0);
    expect(roster.some(s => 'guardianEmail' in s || 'guardianAddress' in s)).toBe(false);
    // A teacher at someone else's class sees the roll without them.
    const meeting = state.teaching.meetings.find(m => {
      const lead = state.teaching.ensembles.find(e => e.id === m.ensembleId)?.leadStaffId;
      return lead !== DEVON.id;
    })!;
    const roll = rollCallStudentsFor(state, as('teacher', 's-nobody'), meeting);
    expect(roll.length).toBeGreaterThan(0);
    expect(roll.some(s => 'guardianEmail' in s || 'guardianAddress' in s)).toBe(false);
  });
});
