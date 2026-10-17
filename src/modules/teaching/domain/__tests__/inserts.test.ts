import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import type { PortalState } from '../../../../core/types';
import { SEED_TODAY, makeSeed } from '../seed';
import { teachingSlice } from '../slice';
import type { StudentInput, TeachingActions, TeachingState } from '../types';

const COMBO_B = 'e-combo-b-f1'; // today, 4:00pm, roll not taken
/** Someone on Combo B's roster. */
const PLAYER = makeSeed().students.find(s => s.ensembleId === 'e-combo-b')!.id;

const NEW: StudentInput = {
  name: 'Ada Okoye',
  instrument: 'Trumpet',
  yearsIn: 1,
  guardianName: 'Ngozi Okoye',
  programId: 'studio-sessions',
  status: 'enrolled',
  ensembleId: 'e-combo-b',
};

/**
 * The slice's raw actions on the seed. Every action sent is kept, so `resend`
 * can send them all again, as Try again does after a save that timed out.
 */
function harness() {
  let teaching: TeachingState = makeSeed();
  let sent: AnyAction[] = [];
  let n = 0;
  const dispatch = (action: AnyAction) => {
    sent.push(action);
    teaching = teachingSlice.reducer(teaching, action);
  };
  const actions = teachingSlice.createActions(
    dispatch,
    () => ({ teaching }) as unknown as PortalState,
    {
      today: SEED_TODAY,
      newId: (prefix: string) => `${prefix}-${(n += 1)}`,
      user: { id: 's-keisha', name: 'Keisha Moore', role: 'office-manager' },
    },
  );
  return {
    actions,
    state: () => teaching,
    sent: () => sent,
    resend() {
      const again = sent;
      sent = [];
      again.forEach(dispatch);
    },
  };
}

const paths: Array<[string, (a: TeachingActions) => void]> = [
  [
    'addMeeting',
    a =>
      a.addMeeting({
        ensembleId: 'e-combo-b',
        date: '2026-10-01',
        start: '16:00',
        end: '17:00',
        venueId: 'v-studio',
        room: 'Studio 1',
      }),
  ],
  ['setMark', a => a.setMark(COMBO_B, PLAYER, 'late')],
  ['submitRollCall', a => a.submitRollCall(COMBO_B)],
  ['enrollStudent', a => a.enrollStudent(NEW)],
  ['importStudents', a => a.importStudents([NEW, { ...NEW, name: 'Bo Okoye' }])],
  [
    'addTerm',
    a => a.addTerm({ name: 'Spring', start: '2027-02-01', end: '2027-05-31', meetingsPlanned: 12 }),
  ],
  [
    'addEnsemble',
    a =>
      a.addEnsemble({
        name: 'Combo C',
        programId: 'studio-sessions',
        leadStaffId: 's-devon',
        venueId: 'v-studio',
        room: 'Studio 2',
        tone: 'blue',
      }),
  ],
];

describe('teaching inserts sent twice', () => {
  it.each(paths)('%s leaves one row', (_name, run) => {
    const h = harness();
    run(h.actions);
    expect(h.sent().length).toBeGreaterThan(0);
    const once = h.state();
    h.resend();
    expect(h.state()).toEqual(once);
  });

  it('marks each student present once when the roll call is sent again', () => {
    const h = harness();
    h.actions.submitRollCall(COMBO_B);
    const marks = h.state().attendance.filter(a => a.meetingId === COMBO_B).length;
    expect(marks).toBeGreaterThan(0);
    h.resend();
    expect(h.state().attendance.filter(a => a.meetingId === COMBO_B)).toHaveLength(marks);
  });
});
