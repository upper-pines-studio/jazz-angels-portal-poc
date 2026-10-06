import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { OWN_HOURS_REFUSAL, awaitingApproval, mayApprove, mayLogFor } from '../derive';
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

describe('approveEntry', () => {
  it('stamps the approver and today, and clears it from the queue', () => {
    const entry = submitted();
    const next = reducer(makeSeed(), {
      type: 'approve',
      id: entry.id,
      by: 's-denise',
      at: today,
    });
    const approved = next.entries.find(e => e.id === entry.id)!;

    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('s-denise');
    expect(approved.approvedAt).toBe(today);
    expect(awaitingApproval(portal(next))).toHaveLength(1);
  });

  it('leaves an already approved entry alone', () => {
    const state = makeSeed();
    const already = state.entries.find(e => e.status === 'approved')!;
    const next = reducer(state, { type: 'approve', id: already.id, by: 's-denise', at: today });
    expect(next).toBe(state);
  });

  it('ignores an id that is not there', () => {
    const state = makeSeed();
    expect(reducer(state, { type: 'approve', id: 'nope', by: 's-barry', at: today })).toBe(state);
  });
});

describe('approveEntry from the actions', () => {
  it('credits the approval to the signed-in person', () => {
    let state = makeSeed();
    const actions = timesheetsSlice.createActions(
      a => {
        state = timesheetsSlice.reducer(state, a);
      },
      () => portal(state),
      {
        today,
        newId: prefix => `${prefix}-1`,
        user: { id: 's-walt', name: 'Walt Brennan', role: 'bookkeeper' },
      },
    );
    const entry = submitted();
    actions.approveEntry(entry.id);
    expect(state.entries.find(e => e.id === entry.id)).toMatchObject({
      status: 'approved',
      approvedBy: 's-walt',
      approvedAt: today,
    });
  });
});

describe('submitEntry', () => {
  it('moves a draft into the queue and stops there', () => {
    const state = makeSeed();
    const draft = state.entries.find(e => e.status === 'draft')!;
    const next = reducer(state, { type: 'submit', id: draft.id });

    expect(next.entries.find(e => e.id === draft.id)!.status).toBe('submitted');
    expect(awaitingApproval(portal(next))).toHaveLength(3);
    // Submitting again changes nothing.
    expect(reducer(next, { type: 'submit', id: draft.id })).toBe(next);
  });
});

describe('logHours and deleteEntry', () => {
  it('adds a draft in quarter hours and takes it away again', () => {
    const entry: TimeEntry = {
      id: 'te-new',
      staffId: 's-devon',
      date: today,
      programId: 'in-school',
      activity: 'Paramount MS, in-school band',
      hours: toQuarterHours(1.3),
      status: 'draft',
    };
    const added = reducer(makeSeed(), { type: 'log', entry });

    expect(added.entries).toHaveLength(makeSeed().entries.length + 1);
    expect(added.entries.at(-1)!.hours).toBe(1.25);
    expect(reducer(added, { type: 'delete', id: 'te-new' }).entries).toHaveLength(
      makeSeed().entries.length,
    );
  });

  it('never rounds an entry down to nothing', () => {
    expect(toQuarterHours(0.1)).toBe(0.25);
    expect(toQuarterHours(2)).toBe(2);
    expect(toQuarterHours(3.4)).toBe(3.5);
  });
});

describe('the slice', () => {
  it('only answers to its own namespace', () => {
    const state = makeSeed();
    const entry = submitted();
    expect(timesheetsSlice.reducer(state, { type: 'grants/approve', id: entry.id })).toBe(state);

    const next = timesheetsSlice.reducer(state, {
      type: 'timesheets/approve',
      id: entry.id,
      by: 's-denise',
      at: today,
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
