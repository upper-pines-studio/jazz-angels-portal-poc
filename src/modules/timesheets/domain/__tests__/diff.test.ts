import { describe, expect, it } from 'vitest';
import { diffSlice } from '../../../../core/diff';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, SignedInUser } from '../../../../core/types';
import { SEED_TODAY, makeSeed } from '../seed';
import { timesheetsSlice } from '../slice';
import { timesheetsTables } from '../tables';
import type { TimesheetsState } from '../types';

/**
 * The timesheets fields cleared with `undefined` go out as `null` in the rows
 * `Repository.apply` is handed (decision 0008, 2A, #122): Send back clears the
 * approval, and submitting again clears the reason it was sent back for.
 */

const DENISE: SignedInUser = { id: 's-denise', name: 'Denise', role: 'admin' };

function harness() {
  let state = makeSeed();
  const actionsAs = (user: SignedInUser) =>
    timesheetsSlice.createActions(
      a => {
        state = timesheetsSlice.reducer(state, a);
      },
      () => ({ core: makeCoreSeed(), timesheets: state }) as unknown as PortalState,
      { today: SEED_TODAY, newId: prefix => `${prefix}-new`, user },
    );
  const diffOf = (run: () => void) => {
    const before: TimesheetsState = state;
    run();
    return { diff: diffSlice(timesheetsTables, before, state), after: state };
  };
  return { actionsAs, diffOf, state: () => state };
}

/** The activity row the mapping writes for one step. */
const stepRow = (state: TimesheetsState, id: string) =>
  timesheetsTables.toRows(state).activity.find(r => r.id === id);

describe('timesheets clearing actions as rows', () => {
  const h = harness();
  const entry = h.state().entries.find(e => e.status === 'approved' && e.staffId !== DENISE.id)!;
  const sentBackStep = `${entry.id}:${entry.history.length + 1}`;
  const submittedStep = `${entry.id}:${entry.history.length + 2}`;

  it('Send back clears the approval with null', () => {
    const { diff, after } = h.diffOf(() =>
      h.actionsAs(DENISE).sendBackEntry(entry.id, 'Split the rehearsal hours'),
    );
    expect(diff).toEqual([
      {
        table: 'time_entries',
        inserts: [],
        updates: [
          {
            key: { id: entry.id },
            set: {
              status: 'draft',
              approved_by: null,
              approved_at: null,
              sent_back_by: 's-denise',
              sent_back_at: SEED_TODAY,
              sent_back_reason: 'Split the rehearsal hours',
            },
            was: {
              status: 'approved',
              approved_by: entry.approvedBy,
              approved_at: entry.approvedAt,
              sent_back_by: null,
              sent_back_at: null,
              sent_back_reason: null,
            },
          },
        ],
        deletes: [],
      },
      { table: 'activity', inserts: [stepRow(after, sentBackStep)], updates: [], deletes: [] },
    ]);
    expect(stepRow(after, sentBackStep)).toMatchObject({
      subject_kind: 'time-entry',
      subject_id: entry.id,
      kind: 'sent-back',
      who_id: 's-denise',
      detail: { reason: 'Split the rehearsal hours' },
    });
  });

  it('submitting after Send back clears the reason with null, and keeps who sent it back', () => {
    const owner: SignedInUser = { id: entry.staffId, name: 'Owner', role: 'teacher' };
    const { diff, after } = h.diffOf(() => h.actionsAs(owner).submitEntry(entry.id));
    expect(diff).toEqual([
      {
        table: 'time_entries',
        inserts: [],
        updates: [
          {
            key: { id: entry.id },
            set: { status: 'submitted', sent_back_reason: null },
            was: { status: 'draft', sent_back_reason: 'Split the rehearsal hours' },
          },
        ],
        deletes: [],
      },
      { table: 'activity', inserts: [stepRow(after, submittedStep)], updates: [], deletes: [] },
    ]);
    expect(stepRow(after, submittedStep)).toMatchObject({
      kind: 'submitted',
      who_id: entry.staffId,
    });
  });
});
