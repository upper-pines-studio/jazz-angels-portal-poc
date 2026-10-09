import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import {
  OWN_HOURS_REFUSAL,
  awaitingApproval,
  entriesForWeek,
  mayApprove,
  mayLogFor,
  ownDrafts,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { reducer, timesheetsSlice, toQuarterHours } from '../slice';
import type { TimeEntry } from '../types';

const today = SEED_TODAY;

function portal(timesheets = makeSeed()): PortalState {
  return { core: makeCoreSeed(), timesheets } as unknown as PortalState;
}

/** One of the two entries Devon and Renee are waiting on. */
function submitted(): TimeEntry {
  return awaitingApproval(portal())[0];
}

describe('seed', () => {
  it('logs every entry in quarter hours', () => {
    for (const entry of makeSeed().entries) {
      expect(entry.hours * 4).toBe(Math.round(entry.hours * 4));
      expect(entry.hours).toBeGreaterThan(0);
    }
  });

  it('gives every approved entry an approver and a date, and nobody else one', () => {
    for (const entry of makeSeed().entries) {
      if (entry.status === 'approved') {
        expect(entry.approvedBy).toBeTruthy();
        expect(entry.approvedAt).toBeTruthy();
        expect(entry.approvedAt! <= SEED_TODAY).toBe(true);
      } else {
        expect(entry.approvedBy).toBeUndefined();
      }
    }
  });

  it('leaves some drafts about as well as approvals', () => {
    const statuses = new Set(makeSeed().entries.map(e => e.status));
    expect(statuses).toEqual(new Set(['draft', 'submitted', 'approved']));
  });
});

/** The slice's own actions over a seeded state, keeping every action they dispatched. */
function harness(user: SignedInUser = { id: 's-denise', name: 'Denise', role: 'admin' }) {
  let state = makeSeed();
  const sent: AnyAction[] = [];
  const actions = timesheetsSlice.createActions(
    a => {
      sent.push(a);
      state = timesheetsSlice.reducer(state, a);
    },
    () => portal(state),
    { today, newId: prefix => `${prefix}-new`, user },
  );
  return { actions, sent, state: () => state };
}

describe('approveEntry', () => {
  it('stamps the approver and today, and clears it from the queue', () => {
    const h = harness();
    const entry = submitted();
    h.actions.approveEntry(entry.id);
    const approved = h.state().entries.find(e => e.id === entry.id)!;

    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('s-denise');
    expect(approved.approvedAt).toBe(today);
    expect(awaitingApproval(portal(h.state()))).toHaveLength(1);
  });

  it('leaves an already approved entry alone', () => {
    const h = harness();
    const already = h.state().entries.find(e => e.status === 'approved')!;
    const before = h.state();
    h.actions.approveEntry(already.id);
    expect(h.state()).toBe(before);
    expect(h.sent).toEqual([]);
  });

  it('ignores an id that is not there', () => {
    const h = harness();
    const before = h.state();
    h.actions.approveEntry('nope');
    expect(h.state()).toBe(before);
  });
});

describe('approveEntry from the actions', () => {
  it('credits the approval to the signed-in person', () => {
    const h = harness({ id: 's-walt', name: 'Walt Brennan', role: 'bookkeeper' });
    const entry = submitted();
    h.actions.approveEntry(entry.id);
    expect(h.state().entries.find(e => e.id === entry.id)).toMatchObject({
      status: 'approved',
      approvedBy: 's-walt',
      approvedAt: today,
    });
  });
});

describe('submitEntry', () => {
  it('moves a draft into the queue and stops there', () => {
    const h = harness();
    const draft = h.state().entries.find(e => e.status === 'draft')!;
    h.actions.submitEntry(draft.id);

    expect(h.state().entries.find(e => e.id === draft.id)!.status).toBe('submitted');
    expect(awaitingApproval(portal(h.state()))).toHaveLength(3);
    // Submitting again changes nothing.
    const next = h.state();
    h.actions.submitEntry(draft.id);
    expect(h.state()).toBe(next);
    expect(h.sent).toHaveLength(1);
  });
});

describe('logHours and deleteEntry', () => {
  it('adds a draft in quarter hours and takes it away again', () => {
    const h = harness({ id: 's-devon', name: 'Devon Price', role: 'teacher' });
    const id = h.actions.logHours({
      staffId: 's-devon',
      date: today,
      programId: 'in-school',
      activity: 'Paramount MS, in-school band',
      hours: 1.3,
    });

    expect(h.state().entries).toHaveLength(makeSeed().entries.length + 1);
    expect(h.state().entries.at(-1)).toMatchObject({ id, hours: 1.25, status: 'draft' });
    h.actions.deleteEntry(id);
    expect(h.state().entries).toHaveLength(makeSeed().entries.length);
  });

  it('never rounds an entry down to nothing', () => {
    expect(toQuarterHours(0.1)).toBe(0.25);
    expect(toQuarterHours(2)).toBe(2);
    expect(toQuarterHours(3.4)).toBe(3.5);
  });
});

describe('the generic actions', () => {
  it('send every change as insert, update or remove on the entries', () => {
    const h = harness({ id: 's-devon', name: 'Devon Price', role: 'teacher' });
    const id = h.actions.logHours({
      staffId: 's-devon',
      date: today,
      programId: 'in-school',
      activity: 'Sectional',
      hours: 1,
    });
    h.actions.submitEntry(id);
    h.actions.approveEntry(submitted().id);
    h.actions.deleteEntry(id);
    expect(h.sent.map(a => `${a.type} ${a.key}`)).toEqual([
      'timesheets/insert entries',
      'timesheets/update entries',
      'timesheets/update entries',
      'timesheets/remove entries',
    ]);
    expect(h.sent.map(a => timesheetsSlice.describe!(a))).toEqual([
      'the hours',
      'the hours',
      'the approval',
      'the hours',
    ]);
  });

  it('keeps one entry when the same insert arrives twice', () => {
    const h = harness();
    h.actions.logHours({
      staffId: 's-denise',
      date: today,
      programId: 'in-school',
      activity: 'Sectional',
      hours: 1,
    });
    const once = h.state();
    expect(timesheetsSlice.reducer(once, h.sent[0])).toBe(once);
  });

  it('applies a batch in order', () => {
    const entry = submitted();
    const next = reducer(makeSeed(), {
      type: 'batch',
      actions: [
        { type: 'update', key: 'entries', id: entry.id, patch: { hours: 2 } },
        { type: 'remove', key: 'entries', id: entry.id },
      ],
    });
    expect(next.entries.some(e => e.id === entry.id)).toBe(false);
  });
});

describe('the slice', () => {
  it('only answers to its own namespace', () => {
    const state = makeSeed();
    const entry = submitted();
    const patch = { status: 'approved' };
    expect(
      timesheetsSlice.reducer(state, {
        type: 'grants/update',
        key: 'entries',
        id: entry.id,
        patch,
      }),
    ).toBe(state);

    const next = timesheetsSlice.reducer(state, {
      type: 'timesheets/update',
      key: 'entries',
      id: entry.id,
      patch,
    });
    expect(next.entries.find(e => e.id === entry.id)!.status).toBe('approved');
  });

  it('accepts a payload with entries and rejects anything else', () => {
    const seeded = makeSeed();
    expect(timesheetsSlice.normalise!(seeded)).toEqual(seeded);
    expect(timesheetsSlice.normalise!({ entries: [] })).toEqual({ entries: [] });
    expect(timesheetsSlice.normalise!({})).toBeUndefined();
    expect(timesheetsSlice.normalise!(null)).toBeUndefined();
  });

  it('fills a status it does not recognise with draft', () => {
    const filled = timesheetsSlice.normalise!({
      entries: [
        {
          id: 'x',
          staffId: 's-devon',
          date: today,
          programId: 'in-school',
          activity: 'x',
          hours: 1,
        },
      ],
    });
    expect(filled!.entries[0].status).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// Who may log and approve (decision 0001), through the store's check
// ---------------------------------------------------------------------------

/** The actions as the store hands them out: every one behind the slice's rules. */
function guarded(user: SignedInUser) {
  let state = makeSeed();
  const refused: string[] = [];
  const getState = () => portal(state);
  const actions = guardActions(
    timesheetsSlice.createActions(
      a => {
        state = timesheetsSlice.reducer(state, a);
      },
      getState,
      { today, newId: prefix => `${prefix}-new`, user },
    ),
    timesheetsSlice.rules,
    getState,
    user,
    message => refused.push(message),
  );
  return { actions, refused, state: () => state };
}

const as = (id: string, role: Role): SignedInUser => ({ id, name: id, role });
const DEVON = as('s-devon', 'teacher');
const KEISHA = as('s-keisha', 'office-manager');

const hours = (staffId: string) => ({
  staffId,
  date: today,
  programId: 'studio-sessions' as const,
  activity: 'Sectional',
  hours: 1,
});

describe('approving hours', () => {
  it('lets the office approve somebody else’s submitted hours', () => {
    const h = guarded(KEISHA);
    const entry = submitted();
    h.actions.approveEntry(entry.id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('approved');
  });

  it('refuses your own hours whatever the role, with the reason', () => {
    const entry = submitted();
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const self = as(entry.staffId, role);
      expect(mayApprove(self, entry)).toBe(false);
      const h = guarded(self);
      h.actions.approveEntry(entry.id);
      expect(h.refused).toEqual([OWN_HOURS_REFUSAL]);
      expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('submitted');
    }
  });

  it('refuses a role that does not approve', () => {
    const entry = submitted();
    for (const role of ['teacher', 'assistant', 'read-only'] as Role[]) {
      const h = guarded(as('s-someone-else', role));
      h.actions.approveEntry(entry.id);
      expect(h.refused).toHaveLength(1);
      expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('submitted');
    }
  });
});

describe('logging hours', () => {
  it('lets every role but Read-only log their own', () => {
    for (const role of [
      'admin',
      'director',
      'office-manager',
      'bookkeeper',
      'teacher',
      'assistant',
    ] as Role[]) {
      const me = as('s-me', role);
      expect(mayLogFor(me, 's-me')).toBe(true);
      const h = guarded(me);
      h.actions.logHours(hours('s-me'));
      expect(h.refused).toEqual([]);
    }
    expect(mayLogFor(as('s-me', 'read-only'), 's-me')).toBe(false);
  });

  it('refuses hours logged for somebody else, even by the office', () => {
    const h = guarded(KEISHA);
    const before = h.state().entries.length;
    h.actions.logHours(hours('s-devon'));
    expect(h.refused).toEqual(["You can't do that as an Office manager."]);
    expect(h.state().entries).toHaveLength(before);
  });

  it('refuses a teacher deleting somebody else’s draft', () => {
    const h = guarded(DEVON);
    const theirs = h.state().entries.find(e => e.staffId !== 's-devon' && e.status === 'draft');
    expect(theirs).toBeDefined();
    h.actions.deleteEntry(theirs!.id);
    expect(h.refused).toHaveLength(1);
    expect(h.state().entries.some(e => e.id === theirs!.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Submitting a week (decision 0001: log hours, own)
// ---------------------------------------------------------------------------

/** Albert's and Barry's drafts sit in the week of Sep 7; Devon has none there. */
const SEP_7 = '2026-09-07';

describe('submitWeek', () => {
  it("hands over the signed-in person's drafts for the week as one change", () => {
    const albert = as('s-albert', 'teacher');
    const h = harness(albert);
    const mine = ownDrafts(albert, entriesForWeek(portal(h.state()), SEP_7));
    expect(mine.length).toBeGreaterThan(0);

    expect(h.actions.submitWeek(SEP_7)).toBe(mine.length);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].type).toBe('timesheets/batch');
    for (const entry of mine) {
      expect(h.state().entries.find(e => e.id === entry.id)!.status).toBe('submitted');
    }
  });

  it("leaves everyone else's drafts and the other weeks alone", () => {
    const h = harness(as('s-albert', 'teacher'));
    const others = h
      .state()
      .entries.filter(e => e.status === 'draft' && (e.staffId !== 's-albert' || e.date < SEP_7));
    expect(others.length).toBeGreaterThan(0);
    h.actions.submitWeek(SEP_7);
    for (const entry of others) {
      expect(h.state().entries.find(e => e.id === entry.id)!.status).toBe('draft');
    }
  });

  it('takes any day of the week as that Monday-to-Sunday week', () => {
    const albert = as('s-albert', 'teacher');
    const fromMonday = harness(albert);
    const fromSunday = harness(albert);
    const count = fromMonday.actions.submitWeek(SEP_7);
    expect(count).toBeGreaterThan(0);
    expect(fromSunday.actions.submitWeek('2026-09-13')).toBe(count);
    expect(fromSunday.state()).toEqual(fromMonday.state());
  });

  it('sends nothing when the person has no drafts that week', () => {
    const h = harness(DEVON);
    const before = h.state();
    expect(h.actions.submitWeek(SEP_7)).toBe(0);
    expect(h.state()).toBe(before);
    expect(h.sent).toEqual([]);
  });

  it('describes a failed submit as the hours', () => {
    const h = harness(as('s-albert', 'teacher'));
    h.actions.submitWeek(SEP_7);
    expect(timesheetsSlice.describe!(h.sent[0])).toBe('the hours');
  });
});

describe('submitting through the store', () => {
  it('lets a teacher submit their own draft', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours(hours('s-devon'));
    h.actions.submitEntry(id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.find(e => e.id === id)?.status).toBe('submitted');
  });

  it("refuses somebody else's draft, even for the office", () => {
    for (const user of [DEVON, KEISHA]) {
      const h = guarded(user);
      const theirs = h.state().entries.find(e => e.staffId !== user.id && e.status === 'draft')!;
      h.actions.submitEntry(theirs.id);
      expect(h.refused).toHaveLength(1);
      expect(h.state().entries.find(e => e.id === theirs.id)?.status).toBe('draft');
    }
  });

  it('lets every role that logs submit a week, and refuses Read-only', () => {
    const h = guarded(as('s-albert', 'teacher'));
    expect(h.actions.submitWeek(SEP_7)).toBeGreaterThan(0);
    expect(h.refused).toEqual([]);

    const ro = guarded(as('s-albert', 'read-only'));
    const before = ro.state();
    expect(ro.actions.submitWeek(SEP_7)).toBeUndefined();
    expect(ro.refused).toHaveLength(1);
    expect(ro.state()).toBe(before);
  });
});
