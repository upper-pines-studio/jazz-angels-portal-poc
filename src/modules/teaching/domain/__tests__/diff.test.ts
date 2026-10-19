import { describe, expect, it } from 'vitest';
import { diffSlice } from '../../../../core/diff';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, SignedInUser } from '../../../../core/types';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import { teachingTables } from '../tables';
import type { TeachingState } from '../types';

/**
 * The teaching fields cleared with `undefined` go out as `null` in the rows
 * `Repository.apply` is handed (decision 0008, 2A, #122). With a backend, a
 * reopened roll that stayed closed could not be corrected, and a session that
 * stayed on its program would sit on the wrong line for decision 0007.
 */

const KEISHA: SignedInUser = { id: 's-keisha', name: 'Keisha Monroe', role: 'office-manager' };

function harness() {
  let state = makeSeed();
  const actions = teachingSlice.createActions(
    a => {
      state = teachingSlice.reducer(state, a);
    },
    () => ({ core: makeCoreSeed(), teaching: state }) as unknown as PortalState,
    { today: SEED_TODAY, newId: prefix => `${prefix}-new`, user: KEISHA },
  );
  const diffOf = (run: () => void) => {
    const before: TeachingState = state;
    run();
    return diffSlice(teachingTables, before, state);
  };
  return { actions, diffOf, state: () => state };
}

describe('teaching clearing actions as rows', () => {
  it('reopening a roll call clears roll_submitted_at with null', () => {
    const h = harness();
    const meeting = h.state().meetings.find(m => m.rollSubmittedAt)!;
    expect(h.diffOf(() => h.actions.reopenRollCall(meeting.id))).toEqual([
      {
        table: 'class_meetings',
        inserts: [],
        updates: [
          {
            key: { id: meeting.id },
            set: { roll_submitted_at: null },
            was: { roll_submitted_at: meeting.rollSubmittedAt },
          },
        ],
        deletes: [],
      },
    ]);
  });

  it('a session back to All programs clears program_id with null', () => {
    const h = harness();
    const id = h.actions.addTerm({
      name: 'Winter in-school term',
      programId: 'in-school',
      start: '2027-01-11',
      end: '2027-03-19',
      meetingsPlanned: 10,
    });
    expect(h.diffOf(() => h.actions.updateTerm(id, { programId: undefined }))).toEqual([
      {
        table: 'terms',
        inserts: [],
        updates: [{ key: { id }, set: { program_id: null }, was: { program_id: 'in-school' } }],
        deletes: [],
      },
    ]);
  });

  it('restoring a student clears both archive columns with null', () => {
    const h = harness();
    const student = h.state().students[0];
    h.actions.archiveStudent(student.id);
    expect(h.diffOf(() => h.actions.restoreStudent(student.id))).toEqual([
      {
        table: 'students',
        inserts: [],
        updates: [
          {
            key: { id: student.id },
            set: { archived_at: null, archived_by: null },
            was: { archived_at: SEED_TODAY, archived_by: 's-keisha' },
          },
        ],
        deletes: [],
      },
    ]);
  });
});
