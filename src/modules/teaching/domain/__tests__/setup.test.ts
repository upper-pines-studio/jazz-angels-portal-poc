import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreEmpty, makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { CoreState, PortalState, Role, SignedInUser } from '../../../../core/types';
import {
  ensembleOptions,
  ensembleProblems,
  leadOptions,
  meetingsForWeek,
  nextTone,
  rollCallStudents,
  sessionWeekLabel,
  termForDate,
  termProblems,
  termsList,
  weeksBetween,
} from '../derive';
import { FALL_TERM_ID, SEED_TODAY, makeEmpty, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { EnsembleInput, TeachingState, TermInput } from '../types';

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

/** The teaching slice behind its real rules, with the core it reads from. */
function harness(
  user: SignedInUser = KEISHA,
  {
    teaching = makeSeed(),
    core = makeCoreSeed(),
    today = SEED_TODAY,
  }: { teaching?: TeachingState; core?: CoreState; today?: string } = {},
) {
  let state = teaching;
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const portal = () => ({ core, teaching: state }) as unknown as PortalState;
  const actions = guardActions(
    teachingSlice.createActions(
      action => {
        sent.push(action);
        state = teachingSlice.reducer(state, action);
      },
      portal,
      { today, newId: p => `${p}-a${(n += 1)}`, user },
    ),
    teachingSlice.rules,
    portal,
    user,
    m => refused.push(m),
  );
  return { actions, portal, refused, sent };
}

const WINTER: TermInput = {
  name: 'Winter 2027 session',
  start: '2027-01-10',
  end: '2027-03-07',
  meetingsPlanned: 8,
};

const COMBO_C: EnsembleInput = {
  name: 'Combo C',
  programId: 'studio-sessions',
  leadStaffId: 's-renee',
  venueId: 'v-studio',
  room: 'Studio 2',
  tone: 'olive',
};

describe('adding and editing a session', () => {
  it('adds a session with a generated id, the name trimmed', () => {
    const h = harness();
    const id = h.actions.addTerm({ ...WINTER, name: '  Winter 2027 session ' });
    expect(id).toBe('t-a1');
    expect(h.portal().teaching.terms.find(t => t.id === id)).toEqual({ ...WINTER, id });
    expect(teachingSlice.describe!(h.sent[0])).toBe('the session');
  });

  it('changes the name, the dates and the classes planned, and keeps the id', () => {
    const h = harness();
    h.actions.updateTerm(FALL_TERM_ID, {
      name: 'Fall 2026',
      end: '2026-11-15',
      meetingsPlanned: 9,
    });
    const fall = h.portal().teaching.terms.find(t => t.id === FALL_TERM_ID)!;
    expect(fall).toMatchObject({ name: 'Fall 2026', start: '2026-09-13', end: '2026-11-15' });
    expect(fall.meetingsPlanned).toBe(9);
  });

  it('refuses a session that ends before it starts, or has no name, saying why', () => {
    const h = harness();
    expect(h.actions.addTerm({ ...WINTER, end: '2027-01-01' })).toBeUndefined();
    h.actions.updateTerm(FALL_TERM_ID, { name: ' ' });
    expect(h.refused).toEqual([
      'The session has to end after it starts.',
      'Give the session a name.',
    ]);
    expect(h.portal().teaching.terms).toHaveLength(2);
    expect(h.portal().teaching.terms.find(t => t.id === FALL_TERM_ID)!.name).toBe(
      'Fall 2026 session',
    );
  });

  it('is the office’s: a teacher, an assistant and a bookkeeper are refused', () => {
    for (const role of ['teacher', 'assistant', 'bookkeeper', 'read-only'] as Role[]) {
      const h = harness(as(role));
      h.actions.addTerm(WINTER);
      h.actions.updateTerm(FALL_TERM_ID, { name: 'Changed' });
      h.actions.archiveTerm(FALL_TERM_ID);
      expect(h.sent, role).toEqual([]);
      expect(h.refused, role).toHaveLength(3);
    }
    for (const role of ['admin', 'director', 'office-manager'] as Role[]) {
      const h = harness(as(role));
      h.actions.addTerm(WINTER);
      expect(h.refused, role).toEqual([]);
    }
  });
});

describe('what a session needs', () => {
  it('names every field that is missing or wrong', () => {
    expect(termProblems(WINTER)).toEqual({});
    expect(termProblems({ name: '', start: '', end: '', meetingsPlanned: 0 })).toEqual({
      name: 'Give the session a name.',
      start: 'Pick the day the session starts.',
      end: 'Pick the day the session ends.',
      meetingsPlanned: 'Plan at least one class for each ensemble.',
    });
    expect(termProblems({ ...WINTER, end: WINTER.start }).end).toBe(
      'The session has to end after it starts.',
    );
    expect(termProblems({ ...WINTER, meetingsPlanned: 2.5 }).meetingsPlanned).toBeDefined();
  });

  it('plans one class a week between the dates until the office says otherwise', () => {
    expect(weeksBetween('2026-09-13', '2026-11-08')).toBe(8);
    expect(weeksBetween('2026-03-01', '2026-04-26')).toBe(8);
    expect(weeksBetween('2027-01-10', '2027-01-12')).toBe(1);
    expect(weeksBetween('', '2027-01-12')).toBe(1);
    expect(weeksBetween('2027-01-12', '2027-01-10')).toBe(1);
  });
});

describe('archiving and restoring a session', () => {
  it('takes it off the list and out of the current session, and back', () => {
    const h = harness();
    expect(termForDate(h.portal(), SEED_TODAY)?.id).toBe(FALL_TERM_ID);

    h.actions.archiveTerm(FALL_TERM_ID);
    const archived = h.portal().teaching.terms.find(t => t.id === FALL_TERM_ID)!;
    expect(archived).toMatchObject({ archivedAt: SEED_TODAY, archivedById: 's-keisha' });
    expect(termForDate(h.portal(), SEED_TODAY)).toBeUndefined();
    expect(sessionWeekLabel(h.portal(), SEED_TODAY)).toBeUndefined();
    expect(termsList(h.portal()).map(t => t.id)).toEqual(['t-spring-2026']);
    expect(termsList(h.portal(), true).map(t => t.id)).toEqual(['t-spring-2026', FALL_TERM_ID]);
    // Nothing cascades: its classes and roll calls stay on the schedule.
    expect(meetingsForWeek(h.portal(), SEED_TODAY).length).toBeGreaterThan(0);
    expect(teachingSlice.describe!(h.sent[0])).toBe('the archive change');

    h.actions.restoreTerm(FALL_TERM_ID);
    expect(termForDate(h.portal(), SEED_TODAY)?.id).toBe(FALL_TERM_ID);
    expect(h.portal().teaching.terms.find(t => t.id === FALL_TERM_ID)).not.toHaveProperty(
      'archivedAt',
      expect.anything(),
    );
  });

  it('lists the sessions earliest first', () => {
    const h = harness();
    h.actions.addTerm(WINTER);
    h.actions.addTerm({
      ...WINTER,
      name: 'Summer 2026 camp',
      start: '2026-07-01',
      end: '2026-07-31',
    });
    expect(termsList(h.portal()).map(t => t.name)).toEqual([
      'Spring 2026 session',
      'Summer 2026 camp',
      'Fall 2026 session',
      'Winter 2027 session',
    ]);
  });
});

describe('adding and editing an ensemble', () => {
  it('adds an ensemble that Add class and the pickers offer at once', () => {
    const h = harness();
    const id = h.actions.addEnsemble({ ...COMBO_C, name: ' Combo C ', room: ' Studio 2 ' });
    expect(id).toBe('e-a1');
    expect(h.portal().teaching.ensembles.find(e => e.id === id)).toEqual({ ...COMBO_C, id });
    expect(ensembleOptions(h.portal(), 'studio-sessions')).toContainEqual({ id, name: 'Combo C' });
    expect(teachingSlice.describe!(h.sent[0])).toBe('the ensemble');
  });

  it('refuses an ensemble with a name already in use, or nobody to lead it', () => {
    const h = harness();
    h.actions.addEnsemble({ ...COMBO_C, name: 'big band' });
    h.actions.addEnsemble({ ...COMBO_C, leadStaffId: '' });
    expect(h.refused).toEqual([
      'There is already an ensemble called Big Band.',
      'Pick who leads it.',
    ]);
    expect(h.sent).toEqual([]);
  });

  it('keeps its own name when edited, and any name an archived ensemble had is free', () => {
    const h = harness();
    h.actions.updateEnsemble('e-big-band', { name: 'Big Band', tone: 'teal' });
    expect(h.refused).toEqual([]);
    h.actions.archiveEnsemble('e-combo-a');
    h.actions.addEnsemble({ ...COMBO_C, name: 'Combo A' });
    expect(h.refused).toEqual([]);
  });

  it('moves the classes from today on to a new place, and leaves past and submitted ones', () => {
    const h = harness();
    const before = h.portal().teaching.meetings.filter(m => m.ensembleId === 'e-combo-a');
    h.actions.updateEnsemble('e-combo-a', { venueId: 'v-alondra-ms', room: 'Music room' });
    const after = h.portal().teaching.meetings.filter(m => m.ensembleId === 'e-combo-a');
    const ensemble = h.portal().teaching.ensembles.find(e => e.id === 'e-combo-a')!;
    expect(ensemble).toMatchObject({ venueId: 'v-alondra-ms', room: 'Music room' });

    for (const m of after) {
      const was = before.find(b => b.id === m.id)!;
      const moves = m.date >= SEED_TODAY && !m.rollSubmittedAt;
      expect(m.venueId, m.id).toBe(moves ? 'v-alondra-ms' : was.venueId);
      expect(m.room, m.id).toBe(moves ? 'Music room' : was.room);
    }
    // Combo A's roll today is in, so today's class stays in Studio 1.
    expect(after.find(m => m.date === SEED_TODAY)).toMatchObject({ room: 'Studio 1' });
    expect(after.some(m => m.room === 'Music room')).toBe(true);
    // The ensemble and its classes are one change.
    expect(h.sent).toHaveLength(1);
    expect(teachingSlice.describe!(h.sent[0])).toBe('the ensemble');
  });

  it('changes nothing on the schedule when only the name, lead or colour change', () => {
    const h = harness();
    h.actions.updateEnsemble('e-combo-b', { leadStaffId: 's-devon', tone: 'gold' });
    expect(h.sent).toHaveLength(1);
    expect(h.portal().teaching.ensembles.find(e => e.id === 'e-combo-b')).toMatchObject({
      leadStaffId: 's-devon',
      tone: 'gold',
    });
  });

  it('is the office’s: a teacher and an assistant are refused', () => {
    for (const role of ['teacher', 'assistant'] as Role[]) {
      const h = harness(as(role, 's-devon'));
      h.actions.addEnsemble(COMBO_C);
      h.actions.updateEnsemble('e-big-band', { name: 'Devon’s Big Band' });
      expect(h.sent, role).toEqual([]);
      expect(h.refused, role).toHaveLength(2);
    }
  });
});

describe('what an ensemble needs', () => {
  const state = () => ({ core: makeCoreSeed(), teaching: makeSeed() }) as unknown as PortalState;

  it('names every field that is missing or wrong', () => {
    expect(ensembleProblems(state(), COMBO_C)).toEqual({});
    expect(
      ensembleProblems(state(), {
        name: '',
        programId: 'nope',
        leadStaffId: 'nobody',
        venueId: '',
        room: '',
        tone: 'pink' as never,
      }),
    ).toEqual({
      name: 'Give the ensemble a name.',
      programId: 'Pick the program it belongs to.',
      leadStaffId: 'Pick who leads it.',
      venueId: 'Pick where it meets.',
      tone: 'Pick a colour.',
    });
  });

  it('offers the current staff who teach as leads, plus the one already chosen', () => {
    const s = state();
    expect(leadOptions(s).map(p => p.id)).toEqual(['s-albert', 's-barry', 's-devon', 's-renee']);
    s.core.staff = s.core.staff.map(p =>
      p.id === 's-renee' ? { ...p, archivedAt: SEED_TODAY } : p,
    );
    expect(leadOptions(s).map(p => p.id)).not.toContain('s-renee');
    expect(leadOptions(s, 's-renee').map(p => p.id)).toContain('s-renee');
    expect(leadOptions(s, 's-keisha').map(p => p.id)).toContain('s-keisha');
  });

  it('starts a new ensemble on a colour nobody uses yet', () => {
    const empty = { core: makeCoreEmpty(), teaching: makeEmpty() } as unknown as PortalState;
    expect(nextTone(empty)).toBe('blue');
    empty.teaching.ensembles = [{ id: 'e', ...COMBO_C, tone: 'blue' }];
    expect(nextTone(empty)).toBe('teal');
  });
});

describe('a new office, from nothing to a roll call', () => {
  it('adds a session, an ensemble, a class and a student, and takes roll', () => {
    const today = '2027-01-10';
    const core = makeCoreEmpty();
    core.venues = [{ id: 'v-hall', name: 'Community Hall', kind: 'community' }];
    const h = harness(KEISHA, { teaching: makeEmpty(), core, today });

    h.actions.addTerm(WINTER);
    const ensembleId = h.actions.addEnsemble({
      ...COMBO_C,
      leadStaffId: 's-devon',
      venueId: 'v-hall',
    });
    const meetingId = h.actions.addMeeting({
      ensembleId,
      date: today,
      start: '16:00',
      end: '17:00',
      venueId: 'v-hall',
      room: '',
    });
    h.actions.enrollStudent({
      name: 'Ada Brooks',
      instrument: 'Trumpet',
      yearsIn: 1,
      guardianName: 'Lena Brooks',
      programId: 'studio-sessions',
      ensembleId,
      status: 'enrolled',
    });
    h.actions.submitRollCall(meetingId);

    expect(h.refused).toEqual([]);
    expect(termForDate(h.portal(), today)?.name).toBe('Winter 2027 session');
    expect(sessionWeekLabel(h.portal(), today)).toBe('Winter session week 1');
    const meeting = h.portal().teaching.meetings.find(m => m.id === meetingId)!;
    expect(meeting.rollSubmittedAt).toBeDefined();
    expect(rollCallStudents(h.portal(), meeting).map(s => s.name)).toEqual(['Ada Brooks']);
    expect(h.portal().teaching.attendance).toEqual([
      expect.objectContaining({ meetingId, mark: 'present' }),
    ]);
  });
});

describe('loading saved sessions', () => {
  it('keeps every id, archive fields that are strings, and fills a missing classes planned', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    saved.terms[0].archivedAt = null;
    saved.terms[1] = { ...saved.terms[1], archivedAt: SEED_TODAY, archivedById: 's-gwen' };
    delete saved.terms[1].meetingsPlanned;
    const loaded = teachingSlice.normalise!(saved)!;
    expect(loaded.terms.map(t => t.id)).toEqual(['t-spring-2026', FALL_TERM_ID]);
    expect(loaded.terms[0]).not.toHaveProperty('archivedAt');
    expect(loaded.terms[1]).toMatchObject({ archivedAt: SEED_TODAY, meetingsPlanned: 8 });
  });
});
