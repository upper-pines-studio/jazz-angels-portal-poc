import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { sentBackAttention, weekFromParam, weekHref } from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';
import { timesheetsSlice } from '../slice';
import type { TimesheetsState } from '../types';

const today = SEED_TODAY;
const keisha: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };
const devon: SignedInUser = { id: 's-devon', name: 'Devon Price', role: 'teacher' };

/** One timesheets state that several people act on in turn, as the store would. */
function office() {
  let timesheets: TimesheetsState = makeSeed();
  const portal = () => ({ core: makeCoreSeed(), timesheets }) as unknown as PortalState;
  const as = (user: SignedInUser) =>
    timesheetsSlice.createActions(
      a => {
        timesheets = timesheetsSlice.reducer(timesheets, a);
      },
      portal,
      { today, newId: prefix => `${prefix}-new`, user },
    );
  return { as, portal };
}

/** Devon's approved entries, oldest first: the ones Keisha may send back. */
function devonsApproved(state: PortalState) {
  return state.timesheets.entries
    .filter(e => e.staffId === 's-devon' && e.status === 'approved')
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

describe('the dashboard row for hours sent back', () => {
  it('shows nothing while nothing is sent back', () => {
    expect(sentBackAttention(office().portal(), devon)).toEqual([]);
  });

  it('gives the person one row per entry sent back, naming the day, the activity and who', () => {
    const o = office();
    const [first, second] = devonsApproved(o.portal());
    o.as(keisha).sendBackEntry(first.id, 'Wrong day.');
    o.as(keisha).sendBackEntry(second.id, 'Too many hours.');

    const rows = sentBackAttention(o.portal(), devon);
    expect(rows.map(r => r.id)).toEqual([
      `timesheets-sent-back-${first.id}`,
      `timesheets-sent-back-${second.id}`,
    ]);
    expect(rows[0]).toMatchObject({
      date: first.date,
      label: 'Hours sent back to fix',
      detail: `${first.activity} · Sent back by Keisha Monroe`,
      status: 'due-soon',
      statusLabel: 'Sent back',
      href: weekHref(first.date),
      ownerId: 's-devon',
      source: 'Timesheets',
    });
  });

  it('is not shown to the office who sent it back, nor to anyone else', () => {
    const o = office();
    const [entry] = devonsApproved(o.portal());
    o.as(keisha).sendBackEntry(entry.id, 'Wrong day.');

    expect(sentBackAttention(o.portal(), keisha)).toEqual([]);
    const others: Array<[string, Role]> = [
      ['s-denise', 'admin'],
      ['s-barry', 'director'],
      ['s-albert', 'teacher'],
      ['s-renee', 'teacher'],
      ['s-someone', 'bookkeeper'],
      ['s-someone', 'assistant'],
      ['s-someone', 'read-only'],
    ];
    for (const [id, role] of others) {
      expect(sentBackAttention(o.portal(), { id, name: 'Someone', role })).toEqual([]);
    }
  });

  it('shows nothing to a role that does not log hours, even on their own entry', () => {
    const o = office();
    const [entry] = devonsApproved(o.portal());
    o.as(keisha).sendBackEntry(entry.id, 'Wrong day.');
    expect(sentBackAttention(o.portal(), { ...devon, role: 'read-only' })).toEqual([]);
  });

  it('goes when the entry is submitted again', () => {
    const o = office();
    const [entry] = devonsApproved(o.portal());
    o.as(keisha).sendBackEntry(entry.id, 'Wrong day.');
    expect(sentBackAttention(o.portal(), devon)).toHaveLength(1);

    o.as(devon).submitEntry(entry.id);
    expect(sentBackAttention(o.portal(), devon)).toEqual([]);
  });
});

describe('the week a link opens', () => {
  it("links to the Monday of the entry's week", () => {
    expect(weekHref('2026-09-13')).toBe('/timesheets?week=2026-09-07');
    expect(weekHref('2026-09-07')).toBe('/timesheets?week=2026-09-07');
  });

  it('reads a date as the Monday of its week, and anything else as none', () => {
    expect(weekFromParam('2026-09-07')).toBe('2026-09-07');
    expect(weekFromParam('2026-09-10')).toBe('2026-09-07');
    expect(weekFromParam(null)).toBeUndefined();
    expect(weekFromParam('')).toBeUndefined();
    expect(weekFromParam('next week')).toBeUndefined();
    expect(weekFromParam('2026-13-45')).toBeUndefined();
  });
});
