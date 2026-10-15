import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import {
  APPROVED_REFUSAL,
  CHANGE_DRAFT_ONLY_REFUSAL,
  DRAFT_ONLY_REFUSAL,
  OWN_HOURS_REFUSAL,
  OWN_SEND_BACK_REFUSAL,
  SEND_BACK_APPROVED_ONLY_REFUSAL,
  SEND_BACK_REASON_REFUSAL,
  awaitingApproval,
  entriesForWeek,
  isSentBack,
  mayApprove,
  mayChangeEntry,
  mayDeleteEntry,
  mayLogFor,
  mayRecall,
  maySendBack,
  ownDrafts,
  sentBackTo,
} from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { reducer, timesheetsSlice, toQuarterHours } from '../slice';
import type { TimeEntry, TimesheetsState } from '../types';

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

  it('leaves a submitted or approved entry where it is', () => {
    const h = harness();
    const kept = h.state().entries.filter(e => e.status !== 'draft');
    const before = h.state();
    for (const entry of kept) h.actions.deleteEntry(entry.id);
    expect(h.state()).toBe(before);
    expect(h.sent).toEqual([]);
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
    h.actions.recallEntry(id);
    h.actions.deleteEntry(id);
    expect(h.sent.map(a => `${a.type} ${a.key}`)).toEqual([
      'timesheets/insert entries',
      'timesheets/update entries',
      'timesheets/update entries',
      'timesheets/update entries',
      'timesheets/remove entries',
    ]);
    expect(h.sent.map(a => timesheetsSlice.describe!(a))).toEqual([
      'the hours',
      'the hours',
      'the approval',
      'the hours',
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

describe('recallEntry', () => {
  it('takes a submitted entry back to a draft, off the queue', () => {
    const h = harness();
    const entry = submitted();
    h.actions.recallEntry(entry.id);
    expect(h.state().entries.find(e => e.id === entry.id)!.status).toBe('draft');
    expect(awaitingApproval(portal(h.state()))).toHaveLength(1);
    expect(timesheetsSlice.describe!(h.sent[0])).toBe('the hours');
  });

  it('leaves a draft or an approved entry alone', () => {
    const h = harness();
    const before = h.state();
    for (const status of ['draft', 'approved']) {
      h.actions.recallEntry(h.state().entries.find(e => e.status === status)!.id);
    }
    h.actions.recallEntry('nope');
    expect(h.state()).toBe(before);
    expect(h.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Who may log and approve (decision 0001), through the store's check
// ---------------------------------------------------------------------------

/**
 * The actions as the store hands them out: every one behind the slice's rules.
 * `from` starts it on data another person has already changed.
 */
function guarded(user: SignedInUser, from: TimesheetsState = makeSeed()) {
  let state = from;
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

// ---------------------------------------------------------------------------
// Deleting and recalling (decision 0001: log hours, own; decision 0002)
// ---------------------------------------------------------------------------

describe('deleting through the store', () => {
  it('lets a teacher delete their own draft', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours(hours('s-devon'));
    const entry = h.state().entries.find(e => e.id === id)!;
    expect(mayDeleteEntry(DEVON, entry)).toBe(true);
    h.actions.deleteEntry(id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.some(e => e.id === id)).toBe(false);
  });

  it('refuses their own submitted or approved hours, with the reason', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours(hours('s-devon'));
    h.actions.submitEntry(id);
    h.actions.deleteEntry(id);
    expect(h.refused).toEqual([DRAFT_ONLY_REFUSAL]);

    const approved = makeSeed().entries.find(
      e => e.staffId === 's-devon' && e.status === 'approved',
    )!;
    expect(mayDeleteEntry(DEVON, approved)).toBe(false);
    h.actions.deleteEntry(approved.id);
    expect(h.refused).toEqual([DRAFT_ONLY_REFUSAL, DRAFT_ONLY_REFUSAL]);
    expect(h.state().entries.find(e => e.id === id)?.status).toBe('submitted');
    expect(h.state().entries.some(e => e.id === approved.id)).toBe(true);
  });

  it("refuses somebody else's draft, even for the office", () => {
    const h = guarded(KEISHA);
    const theirs = h.state().entries.find(e => e.staffId !== 's-keisha' && e.status === 'draft')!;
    expect(mayDeleteEntry(KEISHA, theirs)).toBe(false);
    h.actions.deleteEntry(theirs.id);
    expect(h.refused).toHaveLength(1);
    expect(h.state().entries.some(e => e.id === theirs.id)).toBe(true);
  });
});

describe('recalling through the store', () => {
  it('lets a teacher recall their own submitted entry until it is approved', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours(hours('s-devon'));
    h.actions.submitEntry(id);
    expect(
      mayRecall(
        DEVON,
        h.state().entries.find(e => e.id === id)!,
      ),
    ).toBe(true);
    h.actions.recallEntry(id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.find(e => e.id === id)?.status).toBe('draft');
  });

  it('refuses an approved entry, with the reason', () => {
    const h = guarded(DEVON);
    const approved = h
      .state()
      .entries.find(e => e.staffId === 's-devon' && e.status === 'approved')!;
    expect(mayRecall(DEVON, approved)).toBe(false);
    h.actions.recallEntry(approved.id);
    expect(h.refused).toEqual([APPROVED_REFUSAL]);
    expect(h.state().entries.find(e => e.id === approved.id)?.status).toBe('approved');
  });

  it("refuses somebody else's submitted entry, even for the office", () => {
    const entry = submitted();
    const h = guarded(KEISHA);
    expect(mayRecall(KEISHA, entry)).toBe(false);
    h.actions.recallEntry(entry.id);
    expect(h.refused).toHaveLength(1);
    expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('submitted');
  });
});

// ---------------------------------------------------------------------------
// Sending approved hours back (decision 0001: the office sends wrong hours back to fix)
// ---------------------------------------------------------------------------

/** One of Devon's approved entries from the seed, approved by Barry. */
function devonsApproved(): TimeEntry {
  return makeSeed().entries.find(e => e.staffId === 's-devon' && e.status === 'approved')!;
}

const REASON = 'This was Saturday the 5th, not Sunday.';

describe('sending back through the store', () => {
  it('returns an approved entry to its person as a draft, with who, when and why', () => {
    const entry = devonsApproved();
    expect(maySendBack(KEISHA, entry)).toBe(true);
    const h = guarded(KEISHA);
    h.actions.sendBackEntry(entry.id, `  ${REASON}  `);
    expect(h.refused).toEqual([]);

    const back = h.state().entries.find(e => e.id === entry.id)!;
    expect(back).toMatchObject({
      status: 'draft',
      sentBackBy: 's-keisha',
      sentBackAt: today,
      sentBackReason: REASON,
    });
    expect(back.approvedBy).toBeUndefined();
    expect(back.approvedAt).toBeUndefined();
    expect(isSentBack(back)).toBe(true);
    expect(sentBackTo(portal(h.state()), DEVON).map(e => e.id)).toEqual([entry.id]);
  });

  it('lets every role that approves send back', () => {
    const entry = devonsApproved();
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const h = guarded(as('s-approver', role));
      h.actions.sendBackEntry(entry.id, REASON);
      expect(h.refused).toEqual([]);
      expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('draft');
    }
  });

  it('refuses a send back with no reason', () => {
    const entry = devonsApproved();
    const h = guarded(KEISHA);
    const before = h.state();
    h.actions.sendBackEntry(entry.id, '   ');
    expect(h.refused).toEqual([SEND_BACK_REASON_REFUSAL]);
    expect(h.state()).toBe(before);
  });

  it('refuses your own hours whatever the role, with the reason', () => {
    const entry = devonsApproved();
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const self = as('s-devon', role);
      expect(maySendBack(self, entry)).toBe(false);
      const h = guarded(self);
      h.actions.sendBackEntry(entry.id, REASON);
      expect(h.refused).toEqual([OWN_SEND_BACK_REFUSAL]);
      expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('approved');
    }
  });

  it('refuses a role that does not approve', () => {
    const entry = devonsApproved();
    for (const role of ['teacher', 'assistant', 'read-only'] as Role[]) {
      const user = as('s-someone-else', role);
      expect(maySendBack(user, entry)).toBe(false);
      const h = guarded(user);
      h.actions.sendBackEntry(entry.id, REASON);
      expect(h.refused).toHaveLength(1);
      expect(h.state().entries.find(e => e.id === entry.id)?.status).toBe('approved');
    }
  });

  it('refuses an entry that is not approved, with the reason', () => {
    const h = guarded(KEISHA);
    const before = h.state();
    const draft = before.entries.find(e => e.staffId !== 's-keisha' && e.status === 'draft')!;
    for (const entry of [submitted(), draft]) {
      expect(maySendBack(KEISHA, entry)).toBe(false);
      h.actions.sendBackEntry(entry.id, REASON);
    }
    expect(h.refused).toEqual([SEND_BACK_APPROVED_ONLY_REFUSAL, SEND_BACK_APPROVED_ONLY_REFUSAL]);
    expect(h.state()).toBe(before);
  });

  it('is described as sending the hours back when it cannot be saved', () => {
    const h = harness(KEISHA);
    h.actions.sendBackEntry(devonsApproved().id, REASON);
    expect(timesheetsSlice.describe!(h.sent[0])).toBe('sending the hours back');
  });
});

describe('fixing sent-back hours', () => {
  /** Keisha sends Devon's approved entry back; Devon picks it up on the same data. */
  function sentBack() {
    const entry = devonsApproved();
    const office = guarded(KEISHA);
    office.actions.sendBackEntry(entry.id, REASON);
    return { id: entry.id, ...guarded(DEVON, office.state()) };
  }

  it('lets the person change it, and then resubmit it', () => {
    const h = sentBack();
    const entry = h.state().entries.find(e => e.id === h.id)!;
    expect(mayChangeEntry(DEVON, entry)).toBe(true);
    h.actions.changeEntry(h.id, {
      date: '2026-09-05',
      programId: entry.programId,
      ensembleId: entry.ensembleId,
      activity: entry.activity,
      hours: 2.1,
    });
    expect(h.refused).toEqual([]);
    expect(h.state().entries.find(e => e.id === h.id)).toMatchObject({
      date: '2026-09-05',
      hours: 2,
      status: 'draft',
      sentBackReason: REASON,
    });

    h.actions.submitEntry(h.id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.find(e => e.id === h.id)?.status).toBe('submitted');
  });

  it('clears the reason on resubmit and keeps who sent it back and when', () => {
    const h = sentBack();
    expect(h.actions.submitWeek(h.state().entries.find(e => e.id === h.id)!.date)).toBe(1);
    const resubmitted = h.state().entries.find(e => e.id === h.id)!;
    expect(resubmitted.status).toBe('submitted');
    expect(resubmitted.sentBackReason).toBeUndefined();
    expect(resubmitted).toMatchObject({ sentBackBy: 's-keisha', sentBackAt: today });
    expect(isSentBack(resubmitted)).toBe(false);
    expect(sentBackTo(portal(h.state()), DEVON)).toEqual([]);
  });

  it('keeps who sent it back once the office approves it again', () => {
    const h = sentBack();
    h.actions.submitEntry(h.id);
    const office = guarded(KEISHA, h.state());
    office.actions.approveEntry(h.id);
    expect(office.refused).toEqual([]);
    expect(office.state().entries.find(e => e.id === h.id)).toMatchObject({
      status: 'approved',
      approvedBy: 's-keisha',
      sentBackBy: 's-keisha',
      sentBackAt: today,
    });
  });

  it('lets the person delete it as a draft', () => {
    const h = sentBack();
    const entry = h.state().entries.find(e => e.id === h.id)!;
    expect(mayDeleteEntry(DEVON, entry)).toBe(true);
    h.actions.deleteEntry(h.id);
    expect(h.refused).toEqual([]);
    expect(h.state().entries.some(e => e.id === h.id)).toBe(false);
  });

  it('lets the person recall it again after resubmitting, without the old reason', () => {
    const h = sentBack();
    h.actions.submitEntry(h.id);
    h.actions.recallEntry(h.id);
    expect(h.refused).toEqual([]);
    expect(isSentBack(h.state().entries.find(e => e.id === h.id)!)).toBe(false);
  });
});

describe('changing a draft through the store', () => {
  const changes = {
    date: today,
    programId: 'studio-sessions' as const,
    activity: 'Sectional, Studio 2',
    hours: 1.5,
  };

  it('lets a teacher change their own draft, clearing an ensemble left out', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours({ ...hours('s-devon'), ensembleId: 'ens-x' });
    h.actions.changeEntry(id, changes);
    expect(h.refused).toEqual([]);
    const changed = h.state().entries.find(e => e.id === id)!;
    expect(changed).toMatchObject({ activity: 'Sectional, Studio 2', hours: 1.5 });
    expect(changed.ensembleId).toBeUndefined();
  });

  it('refuses their own submitted or approved hours, with the reason', () => {
    const h = guarded(DEVON);
    const id = h.actions.logHours(hours('s-devon'));
    h.actions.submitEntry(id);
    const before = h.state();
    h.actions.changeEntry(id, changes);
    h.actions.changeEntry(devonsApproved().id, changes);
    expect(h.refused).toEqual([CHANGE_DRAFT_ONLY_REFUSAL, CHANGE_DRAFT_ONLY_REFUSAL]);
    expect(h.state()).toBe(before);
  });

  it("refuses somebody else's draft, even for the office", () => {
    const h = guarded(KEISHA);
    const theirs = h.state().entries.find(e => e.staffId !== 's-keisha' && e.status === 'draft')!;
    expect(mayChangeEntry(KEISHA, theirs)).toBe(false);
    const before = h.state();
    h.actions.changeEntry(theirs.id, changes);
    expect(h.refused).toHaveLength(1);
    expect(h.state()).toBe(before);
  });
});
