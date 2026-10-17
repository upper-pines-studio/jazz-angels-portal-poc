import { describe, expect, it } from 'vitest';
import { rebuildHistory } from '../derive';
import { makeEmpty, makeSeed } from '../seed';
import { stepText, timesheetsTables } from '../tables';
import type { TimeEntry } from '../types';

describe('timesheets tables (#121)', () => {
  it.each([
    ['demo seed', makeSeed()],
    ['empty', makeEmpty()],
  ])('round-trips the %s', (_, state) => {
    const rows = timesheetsTables.toRows(state);
    expect(Object.keys(rows)).toEqual(Object.keys(timesheetsTables.keys));
    expect(timesheetsTables.fromRows(rows)).toEqual(state);
  });

  it("writes each step of an entry's history as an activity row on the entry", () => {
    const state = makeSeed();
    const entry = state.entries.find(e => e.history.length > 1)!;
    const rows = timesheetsTables.toRows(state);
    const steps = rows.activity.filter(r => r.subject_id === entry.id);
    expect(steps.map(r => r.id)).toEqual(entry.history.map(h => h.id));
    expect(steps[0]).toMatchObject({
      subject_kind: 'time-entry',
      who_id: entry.history[0].whoId,
      at: entry.history[0].at,
      kind: entry.history[0].kind,
    });
    expect(rows.time_entries[0]).not.toHaveProperty('history');
  });

  it('says each step in words, as SCHEMA.md does', () => {
    const at = '2026-09-08';
    expect(stepText({ id: 'x:1', kind: 'approved', whoId: 's-gwen', at })).toBe('Approved');
    expect(
      stepText({ id: 'x:2', kind: 'sent-back', whoId: 's-gwen', at, reason: 'Wrong day' }),
    ).toBe('Sent back: Wrong day');
    expect(
      stepText({
        id: 'x:3',
        kind: 'changed',
        whoId: 's-ana',
        at,
        changes: { hours: { from: 1.25, to: 1.5 }, programId: { from: 'a', to: 'b' } },
      }),
    ).toBe('Changed: hours 1.25 to 1.50, program');
  });

  it("round-trips a rebuilt history, its undated steps taking the entry's date", () => {
    const entry: TimeEntry = {
      id: 'te-old',
      staffId: 's-ana',
      date: '2026-08-31',
      programId: 'studio-sessions',
      activity: 'Combo rehearsal',
      hours: 2,
      status: 'approved',
      approvedBy: 's-gwen',
      approvedAt: '2026-09-02',
      sentBackBy: 's-gwen',
      sentBackAt: '2026-09-01',
      sentBackReason: 'Wrong day',
      history: [],
    };
    const old = { ...entry, history: rebuildHistory(entry) };
    const rows = timesheetsTables.toRows({ entries: [old] });
    expect(rows.activity[0]).toMatchObject({
      at: '2026-08-31',
      detail: { rebuilt: true, undated: true },
    });
    expect(rows.activity[1].detail).toEqual({ reason: 'Wrong day', rebuilt: true });
    expect(timesheetsTables.fromRows(rows)).toEqual({ entries: [old] });
  });

  it("reads back only the time entries' activity rows", () => {
    const state = makeSeed();
    const rows = timesheetsTables.toRows(state);
    const grantRow = {
      id: 'act-1',
      subject_kind: 'grant',
      subject_id: 'g-1',
      at: '2026-09-01T09:00:00.000Z',
      who_id: 's-gwen',
      who: null,
      text: 'Moved to Submitted',
      kind: null,
      detail: null,
    } as unknown as (typeof rows.activity)[number];
    expect(timesheetsTables.fromRows({ ...rows, activity: [grantRow, ...rows.activity] })).toEqual(
      state,
    );
  });
});
