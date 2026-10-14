import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, SignedInUser } from '../../../../core/types';
import {
  currentSessions,
  lineForProgram,
  restoreTermRefusal,
  rollCallsDueFor,
  sessionWeekLabel,
  termClash,
  termForEnsemble,
  termForProgram,
  termWeek,
} from '../derive';
import { FALL_TERM_ID, SEED_TODAY, SPRING_TERM_ID, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { TeachingState, TermInput } from '../types';

/**
 * Decision 0007: a session's line is its program, or all programs. Two
 * current sessions on one line never overlap; a class follows its program's
 * own sessions once there are any, else the ones for all programs.
 */

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };

/** The teaching slice behind its real rules, with the seeded core. */
function harness(teaching: TeachingState = makeSeed(), today = SEED_TODAY) {
  let state = teaching;
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const core = makeCoreSeed();
  const portal = () => ({ core, teaching: state }) as unknown as PortalState;
  const actions = guardActions(
    teachingSlice.createActions(
      action => {
        sent.push(action);
        state = teachingSlice.reducer(state, action);
      },
      portal,
      { today, newId: p => `${p}-a${(n += 1)}`, user: KEISHA },
    ),
    teachingSlice.rules,
    portal,
    KEISHA,
    m => refused.push(m),
  );
  const term = (id: string) => portal().teaching.terms.find(t => t.id === id)!;
  return { actions, portal, refused, sent, term };
}

/** An in-school term that runs right across the studio's Fall 2026 session (Sep 13 – Nov 8). */
const IN_SCHOOL_FALL: TermInput = {
  name: 'Fall in-school term',
  programId: 'in-school',
  start: '2026-08-31',
  end: '2026-12-18',
  meetingsPlanned: 15,
};

const FALL_CLASH =
  'The dates overlap Fall 2026 session (Sep 13 – Nov 8, 2026), another session for all programs. Pick dates outside it.';

describe('sessions on one line may not overlap', () => {
  it('lets the seeded sessions pass', () => {
    const state = harness().portal();
    for (const t of state.teaching.terms) expect(termClash(state, t, t.id), t.name).toBeUndefined();
  });

  it('refuses a new session for all programs that overlaps another, naming it', () => {
    const h = harness();
    const id = h.actions.addTerm({
      name: 'Autumn intensive',
      start: '2026-10-01',
      end: '2026-10-31',
      meetingsPlanned: 4,
    });
    expect(id).toBeUndefined();
    expect(h.refused).toEqual([FALL_CLASH]);
    expect(h.portal().teaching.terms).toHaveLength(2);
  });

  it('counts both ends: a session that starts the day another ends overlaps it', () => {
    const h = harness();
    h.actions.addTerm({
      name: 'Winter 2026 session',
      start: '2026-11-08',
      end: '2027-01-10',
      meetingsPlanned: 8,
    });
    expect(h.refused).toEqual([FALL_CLASH]);
    h.actions.addTerm({
      name: 'Winter 2026 session',
      start: '2026-11-09',
      end: '2027-01-10',
      meetingsPlanned: 8,
    });
    expect(h.refused).toHaveLength(1);
    expect(h.portal().teaching.terms).toHaveLength(3);
  });

  it('refuses a change of dates that runs into another session, and keeps the old ones', () => {
    const h = harness();
    h.actions.updateTerm(SPRING_TERM_ID, { end: '2026-09-20' });
    expect(h.refused).toEqual([FALL_CLASH]);
    expect(h.term(SPRING_TERM_ID).end).toBe('2026-04-26');
    // Its own dates never clash with themselves.
    h.actions.updateTerm(FALL_TERM_ID, { end: '2026-11-15' });
    expect(h.refused).toHaveLength(1);
    expect(h.term(FALL_TERM_ID).end).toBe('2026-11-15');
  });

  it('allows sessions on different lines to overlap', () => {
    const h = harness();
    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    expect(h.refused).toEqual([]);
    expect(h.term(id)).toMatchObject({ programId: 'in-school', start: '2026-08-31' });

    // Homeschool's own session may sit on the same weeks too.
    h.actions.addTerm({ ...IN_SCHOOL_FALL, name: 'Homeschool fall', programId: 'homeschool' });
    expect(h.refused).toEqual([]);
  });

  it('refuses a second session for the same program on the same dates, naming the program', () => {
    const h = harness();
    h.actions.addTerm(IN_SCHOOL_FALL);
    h.actions.addTerm({ ...IN_SCHOOL_FALL, name: 'Paramount residency', start: '2026-12-01' });
    expect(h.refused).toEqual([
      'The dates overlap Fall in-school term (Aug 31 – Dec 18, 2026), another session for In-School Program. Pick dates outside it.',
    ]);
  });

  it('refuses moving a session onto a line where it overlaps, and clears the program going back', () => {
    const h = harness();
    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    h.actions.updateTerm(id, { programId: undefined });
    expect(h.refused).toEqual([
      'The dates overlap Fall 2026 session (Sep 13 – Nov 8, 2026), another session for all programs. Pick dates outside it.',
    ]);
    expect(h.term(id).programId).toBe('in-school');

    h.actions.updateTerm(id, { programId: undefined, start: '2026-11-09' });
    expect(h.refused).toHaveLength(1);
    expect(h.term(id).programId).toBeUndefined();
  });

  it('refuses a program that does not exist', () => {
    const h = harness();
    h.actions.addTerm({ ...IN_SCHOOL_FALL, programId: 'no-such-program' });
    expect(h.refused).toEqual(['Pick the program it belongs to, or All programs.']);
  });
});

describe('an archived session does not count toward an overlap (decision 0002)', () => {
  it('lets a new session take its dates', () => {
    const h = harness();
    h.actions.archiveTerm(FALL_TERM_ID);
    h.actions.addTerm({
      name: 'Fall 2026 session',
      start: '2026-09-13',
      end: '2026-11-08',
      meetingsPlanned: 8,
    });
    expect(h.refused).toEqual([]);
  });

  it('refuses restoring one that would overlap a current session, naming it', () => {
    const h = harness();
    h.actions.archiveTerm(FALL_TERM_ID);
    const id = h.actions.addTerm({
      name: 'Fall 2026 term',
      start: '2026-09-06',
      end: '2026-11-01',
      meetingsPlanned: 8,
    });
    const message =
      "Fall 2026 session can't come back: its dates overlap Fall 2026 term (Sep 6 – Nov 1, 2026), another session for all programs. Archive that one or change its dates first.";
    expect(restoreTermRefusal(h.portal(), FALL_TERM_ID)).toBe(message);
    h.actions.restoreTerm(FALL_TERM_ID);
    expect(h.refused).toEqual([message]);
    expect(h.term(FALL_TERM_ID).archivedAt).toBe(SEED_TODAY);

    // Once the other is archived, it comes back.
    h.actions.archiveTerm(id);
    expect(restoreTermRefusal(h.portal(), FALL_TERM_ID)).toBeUndefined();
    h.actions.restoreTerm(FALL_TERM_ID);
    expect(h.refused).toHaveLength(1);
    expect(h.term(FALL_TERM_ID).archivedAt).toBeUndefined();
  });

  it('restores one whose overlap is on another line', () => {
    const h = harness();
    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    h.actions.archiveTerm(id);
    h.actions.restoreTerm(id);
    expect(h.refused).toEqual([]);
    expect(h.term(id).archivedAt).toBeUndefined();
  });
});

describe('each program has its own current session', () => {
  it('puts in-school classes in their term and studio classes in theirs', () => {
    const h = harness();
    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    const state = h.portal();

    expect(termForProgram(state, 'in-school', SEED_TODAY)?.id).toBe(id);
    expect(termForProgram(state, 'studio-sessions', SEED_TODAY)?.id).toBe(FALL_TERM_ID);
    expect(termForEnsemble(state, 'e-paramount-ms', SEED_TODAY)?.id).toBe(id);
    expect(termForEnsemble(state, 'e-combo-a', SEED_TODAY)?.id).toBe(FALL_TERM_ID);
    // Week 2 of the in-school term is week 1 of the studio's.
    expect(termWeek(termForEnsemble(state, 'e-paramount-ms', SEED_TODAY), SEED_TODAY)).toBe(2);
    expect(termWeek(termForEnsemble(state, 'e-combo-a', SEED_TODAY), SEED_TODAY)).toBe(1);
  });

  it('falls back to the session for all programs for a program with none of its own', () => {
    const h = harness();
    h.actions.addTerm(IN_SCHOOL_FALL);
    const state = h.portal();
    expect(lineForProgram(state, 'homeschool')).toBeUndefined();
    expect(termForProgram(state, 'homeschool', SEED_TODAY)?.id).toBe(FALL_TERM_ID);
    expect(termForProgram(state, undefined, SEED_TODAY)?.id).toBe(FALL_TERM_ID);
    // With no in-school term at all, in-school classes follow the studio's too.
    expect(termForProgram(harness().portal(), 'in-school', SEED_TODAY)?.id).toBe(FALL_TERM_ID);
  });

  it('between sessions, gives the next one on the same line', () => {
    const h = harness();
    const spring = h.actions.addTerm({
      ...IN_SCHOOL_FALL,
      name: 'Spring in-school term',
      start: '2026-01-12',
      end: '2026-06-05',
    });
    const fall = h.actions.addTerm({ ...IN_SCHOOL_FALL, start: '2026-09-21' });
    const state = h.portal();

    // Sep 13 is between in-school terms: the next in-school one, not the studio's running session.
    expect(termForProgram(state, 'in-school', SEED_TODAY)?.id).toBe(fall);
    expect(termWeek(termForProgram(state, 'in-school', SEED_TODAY), SEED_TODAY)).toBeUndefined();
    expect(termForProgram(state, 'in-school', '2026-03-01')?.id).toBe(spring);
    // May is between studio sessions: the next one for all programs is Fall.
    expect(termForProgram(state, 'studio-sessions', '2026-05-10')?.id).toBe(FALL_TERM_ID);
  });

  it('keeps a program on its own line once its sessions are over', () => {
    const h = harness();
    h.actions.addTerm({ ...IN_SCHOOL_FALL, start: '2026-01-12', end: '2026-06-05' });
    expect(termForProgram(h.portal(), 'in-school', SEED_TODAY)).toBeUndefined();
  });

  it('never makes an archived session current', () => {
    const h = harness();
    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    h.actions.archiveTerm(id);
    // With no current session of its own, in-school is back on the line for all programs.
    expect(termForProgram(h.portal(), 'in-school', SEED_TODAY)?.id).toBe(FALL_TERM_ID);
  });
});

describe('what shows every line at once', () => {
  it('lists the session for all programs first, then each program with its own', () => {
    const h = harness();
    expect(currentSessions(h.portal(), SEED_TODAY).map(s => s.term.id)).toEqual([FALL_TERM_ID]);
    expect(sessionWeekLabel(h.portal(), SEED_TODAY)).toBe('Fall session week 1');

    const id = h.actions.addTerm(IN_SCHOOL_FALL);
    expect(currentSessions(h.portal(), SEED_TODAY)).toEqual([
      { term: expect.objectContaining({ id: FALL_TERM_ID }) },
      { programId: 'in-school', term: expect.objectContaining({ id }) },
    ]);
    expect(sessionWeekLabel(h.portal(), SEED_TODAY)).toBe(
      'Fall session week 1 (all programs) · Fall in-school term week 2 (In-school)',
    );
  });

  it('leaves the roll calls due as they were: each class is due on its own date', () => {
    const h = harness();
    const before = rollCallsDueFor(h.portal(), SEED_TODAY, KEISHA).map(m => m.id);
    h.actions.addTerm(IN_SCHOOL_FALL);
    expect(rollCallsDueFor(h.portal(), SEED_TODAY, KEISHA).map(m => m.id)).toEqual(before);
    expect(before).toHaveLength(2);
  });
});
