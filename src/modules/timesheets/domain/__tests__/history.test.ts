import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import { guardActions } from '../../../../core/store';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { hasRebuiltHistory, historyLines, mayReadHistory, rebuildHistory } from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { reducer, timesheetsSlice } from '../slice';
import type { TimeEntry, TimesheetsState } from '../types';

// Each entry keeps every step it went through, written with the status it describes (#95).

const today = SEED_TODAY;
const as = (id: string, role: Role): SignedInUser => ({ id, name: id, role });
const DEVON = as('s-devon', 'teacher');
const KEISHA = as('s-keisha', 'office-manager');
const REASON = 'The meeting ran 1.50 hours, not 1.25.';

function portal(timesheets: TimesheetsState): PortalState {
  return { core: makeCoreSeed(), timesheets } as unknown as PortalState;
}

/** The actions as the store hands them out, for one person, on shared data. */
function store(state: { current: TimesheetsState }) {
  const refused: string[] = [];
  const as = (user: SignedInUser, on: string = today) => {
    const getState = () => portal(state.current);
    return guardActions(
      timesheetsSlice.createActions(
        a => {
          state.current = timesheetsSlice.reducer(state.current, a);
        },
        getState,
        { today: on, newId: prefix => `${prefix}-new`, user },
      ),
      timesheetsSlice.rules,
      getState,
      user,
      message => refused.push(message),
    );
  };
  const entry = (id: string) => state.current.entries.find(e => e.id === id)!;
  return { as, refused, entry };
}

const hours = {
  staffId: 's-devon',
  date: '2026-09-09',
  programId: 'in-school' as const,
  activity: 'Paramount MS planning',
  hours: 1.25,
};

const kinds = (entry: TimeEntry) => entry.history.map(e => e.kind);

describe('the history', () => {
  it('records logging, submitting and approving, each with who and when', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    s.as(DEVON).submitWeek(hours.date);
    s.as(KEISHA, '2026-09-14').approveEntry(id);

    expect(s.refused).toEqual([]);
    expect(s.entry(id).history).toEqual([
      { id: `${id}:1`, kind: 'logged', whoId: 's-devon', at: today },
      { id: `${id}:2`, kind: 'submitted', whoId: 's-devon', at: today },
      { id: `${id}:3`, kind: 'approved', whoId: 's-keisha', at: '2026-09-14' },
    ]);
  });

  it('records a recall, and a change with what it changed', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    s.as(DEVON).submitEntry(id);
    s.as(DEVON).recallEntry(id);
    s.as(DEVON).changeEntry(id, { ...hours, hours: 1.5 });

    expect(kinds(s.entry(id))).toEqual(['logged', 'submitted', 'recalled', 'changed']);
    expect(s.entry(id).history[3]).toMatchObject({
      whoId: 's-devon',
      at: today,
      changes: { hours: { from: 1.25, to: 1.5 } },
    });
  });

  it('records nothing for a change that changes nothing', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    const before = s.entry(id);
    s.as(DEVON).changeEntry(id, hours);
    expect(s.entry(id)).toBe(before);
  });

  it('keeps the approval through a send back, and approving again adds a second', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    s.as(DEVON).submitEntry(id);
    s.as(KEISHA, '2026-09-14').approveEntry(id);
    s.as(KEISHA, '2026-09-15').sendBackEntry(id, `  ${REASON} `);
    s.as(DEVON, '2026-09-15').changeEntry(id, { ...hours, hours: 1.5 });
    s.as(DEVON, '2026-09-15').submitEntry(id);
    s.as(KEISHA, '2026-09-16').approveEntry(id);

    const entry = s.entry(id);
    expect(s.refused).toEqual([]);
    expect(kinds(entry)).toEqual([
      'logged',
      'submitted',
      'approved',
      'sent-back',
      'changed',
      'submitted',
      'approved',
    ]);
    const approvals = entry.history.filter(e => e.kind === 'approved');
    expect(approvals.map(e => [e.whoId, e.at])).toEqual([
      ['s-keisha', '2026-09-14'],
      ['s-keisha', '2026-09-16'],
    ]);
    expect(entry.history[3]).toMatchObject({
      kind: 'sent-back',
      whoId: 's-keisha',
      at: '2026-09-15',
      reason: REASON,
    });
    // The entry's own fields keep working as they did.
    expect(entry).toMatchObject({
      status: 'approved',
      approvedBy: 's-keisha',
      approvedAt: '2026-09-16',
      sentBackBy: 's-keisha',
      sentBackAt: '2026-09-15',
    });
    expect(historyLines(entry).map(l => l.again)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('only ever adds: every step keeps the ones before it as they were', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    const seen: TimeEntry['history'][] = [s.entry(id).history];
    s.as(DEVON).submitEntry(id);
    seen.push(s.entry(id).history);
    s.as(KEISHA).approveEntry(id);
    seen.push(s.entry(id).history);
    s.as(KEISHA).sendBackEntry(id, REASON);
    seen.push(s.entry(id).history);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].slice(0, seen[i - 1].length)).toEqual(seen[i - 1]);
      expect(seen[i]).toHaveLength(seen[i - 1].length + 1);
    }
  });

  it('never takes a history from a patch', () => {
    const state = makeSeed();
    const entry = state.entries[0];
    const next = reducer(state, {
      type: 'update',
      key: 'entries',
      id: entry.id,
      patch: { history: [] } as never,
    });
    expect(next.entries[0].history).toEqual(entry.history);
  });

  it('keeps one step when the same change arrives twice', () => {
    const state = makeSeed();
    const entry = state.entries.find(e => e.status === 'submitted')!;
    const event = { id: `${entry.id}:9`, kind: 'approved' as const, whoId: 's-keisha', at: today };
    const action = {
      type: 'update' as const,
      key: 'entries' as const,
      id: entry.id,
      patch: { status: 'approved' as const },
      event,
    };
    const twice = reducer(reducer(state, action), action);
    expect(
      twice.entries.find(e => e.id === entry.id)!.history.filter(e => e.id === event.id),
    ).toHaveLength(1);
  });

  it('adds nothing when the store refuses a step', () => {
    const s = store({ current: makeSeed() });
    const id = s.as(DEVON).logHours(hours);
    s.as(DEVON).submitEntry(id);
    const before = s.entry(id).history;

    s.as(DEVON).approveEntry(id); // nobody approves their own
    s.as(KEISHA).recallEntry(id); // nor recalls somebody else's
    s.as(KEISHA).sendBackEntry(id, REASON); // only approved hours go back
    s.as(DEVON).changeEntry(id, { ...hours, hours: 2 }); // only a draft changes
    s.as(KEISHA).approveEntry(id);
    const approved = s.entry(id).history;
    s.as(KEISHA).sendBackEntry(id, '  '); // a reason is required
    s.as(DEVON).recallEntry(id); // approved stays

    expect(s.refused).toHaveLength(6);
    expect(approved.slice(0, before.length)).toEqual(before);
    expect(kinds(s.entry(id))).toEqual(['logged', 'submitted', 'approved']);
  });

  it('is open to the person who logged it and to the roles that approve', () => {
    const entry = makeSeed().entries.find(e => e.staffId === 's-devon')!;
    expect(mayReadHistory(DEVON, entry)).toBe(true);
    expect(mayReadHistory(KEISHA, entry)).toBe(true);
    expect(mayReadHistory(as('s-walt', 'bookkeeper'), entry)).toBe(true);
    expect(mayReadHistory(as('s-renee', 'teacher'), entry)).toBe(false);
    expect(mayReadHistory(as('s-otis', 'assistant'), entry)).toBe(false);
  });
});

describe('the seed', () => {
  it('gives every entry a history that matches its status', () => {
    for (const entry of makeSeed().entries) {
      expect(entry.history[0]).toMatchObject({ kind: 'logged', whoId: entry.staffId });
      const last = entry.history[entry.history.length - 1];
      if (entry.status === 'approved') {
        expect(last).toMatchObject({
          kind: 'approved',
          whoId: entry.approvedBy,
          at: entry.approvedAt,
        });
      }
      if (entry.status === 'submitted') expect(last.kind).toBe('submitted');
      expect(hasRebuiltHistory(entry)).toBe(false);
    }
  });
});

describe('an entry saved before the history was kept', () => {
  const old = {
    id: 'te-old',
    staffId: 's-devon',
    date: '2026-09-02',
    programId: 'in-school',
    activity: 'Paramount MS summer band',
    hours: 2,
  };

  it('loads with logged, and approved if it was, and no error', () => {
    const loaded = timesheetsSlice.normalise!({
      entries: [
        { ...old, status: 'draft' },
        {
          ...old,
          id: 'te-old-2',
          status: 'approved',
          approvedBy: 's-barry',
          approvedAt: '2026-09-07',
        },
        { ...old, id: 'te-old-3', status: 'submitted', history: 'garbled' },
      ],
    })!;
    const [draft, approved, submitted] = loaded.entries;
    expect(draft.history).toEqual([
      { id: 'te-old:1', kind: 'logged', whoId: 's-devon', rebuilt: true },
    ]);
    expect(approved.history).toEqual([
      { id: 'te-old-2:1', kind: 'logged', whoId: 's-devon', rebuilt: true },
      { id: 'te-old-2:2', kind: 'approved', whoId: 's-barry', at: '2026-09-07', rebuilt: true },
    ]);
    expect(kinds(submitted)).toEqual(['logged', 'submitted']);
    expect(hasRebuiltHistory(approved)).toBe(true);
  });

  it('keeps a send back it recorded, with its reason', () => {
    expect(
      rebuildHistory({
        ...old,
        programId: 'in-school',
        status: 'draft',
        sentBackBy: 's-keisha',
        sentBackAt: '2026-09-13',
        sentBackReason: REASON,
      }).map(e => [e.kind, e.whoId, e.at, e.reason]),
    ).toEqual([
      ['logged', 's-devon', undefined, undefined],
      ['sent-back', 's-keisha', '2026-09-13', REASON],
    ]);
  });

  it('takes its next step after the rebuilt ones', () => {
    const s = store({
      current: timesheetsSlice.normalise!({
        entries: [{ ...old, status: 'submitted' }],
      })!,
    });
    s.as(KEISHA).approveEntry('te-old');
    expect(s.entry('te-old').history.map(e => e.id)).toEqual(['te-old:1', 'te-old:2', 'te-old:3']);
    expect(s.entry('te-old').history[2]).toMatchObject({ kind: 'approved', whoId: 's-keisha' });
  });

  it('reads back a saved history as it was', () => {
    const seeded = makeSeed();
    expect(timesheetsSlice.normalise!(seeded)).toEqual(seeded);
  });
});
