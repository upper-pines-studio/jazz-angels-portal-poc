import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import type { PortalState } from '../../../../core/types';
import { makeSeed } from '../seed';
import { timesheetsSlice } from '../slice';
import type { TimesheetsState } from '../types';

const TODAY = '2026-09-13';

describe('timesheets inserts sent twice', () => {
  it('logHours leaves one entry, with one step in its history', () => {
    let timesheets: TimesheetsState = makeSeed();
    const sent: AnyAction[] = [];
    const dispatch = (action: AnyAction) => {
      sent.push(action);
      timesheets = timesheetsSlice.reducer(timesheets, action);
    };
    const actions = timesheetsSlice.createActions(
      dispatch,
      () => ({ timesheets }) as unknown as PortalState,
      {
        today: TODAY,
        newId: prefix => `${prefix}-fixed`,
        user: { id: 's-devon', name: 'Devon Price', role: 'teacher' },
      },
    );

    const id = actions.logHours({
      staffId: 's-devon',
      date: TODAY,
      programId: 'in-school',
      activity: 'Paramount MS, in-school band',
      hours: 1.5,
    });
    const once = timesheets;
    // Try again sends the same action, with the same id, a second time.
    sent.splice(0).forEach(dispatch);

    expect(id).toBe('te-fixed');
    expect(timesheets).toBe(once);
    expect(timesheets.entries.filter(e => e.id === id)).toHaveLength(1);
    expect(timesheets.entries.find(e => e.id === id)?.history).toHaveLength(1);
  });
});
