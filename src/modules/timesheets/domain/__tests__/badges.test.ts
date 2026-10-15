import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { awaitingApproval, awaitingApprovalFor, waitingOn } from '../derive';
import { makeSeed } from '../seed';

const state = { core: makeCoreSeed(), timesheets: makeSeed() } as unknown as PortalState;
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

/** The seed has two entries awaiting approval: Renee Cole's and Devon Price's. */
describe('the Timesheets badge', () => {
  it('starts from two entries awaiting approval', () => {
    expect(awaitingApproval(state).map(e => e.staffId)).toEqual(['s-renee', 's-devon']);
  });

  it.each<[Role, number]>([
    ['admin', 2],
    ['director', 2],
    ['office-manager', 2],
    ['bookkeeper', 2],
    ['teacher', 0],
    ['assistant', 0],
    ['read-only', 0],
  ])('counts what a %s may approve: %i', (role, count) => {
    expect(awaitingApprovalFor(state, as(role))).toHaveLength(count);
  });

  it("leaves out the approver's own hours, which nobody approves", () => {
    expect(awaitingApprovalFor(state, as('director', 's-devon')).map(e => e.staffId)).toEqual([
      's-renee',
    ]);
  });
});

describe('the Timesheets badge with hours sent back', () => {
  /** Devon's first approved entry, sent back by Keisha with a reason. */
  const devons = state.timesheets.entries.find(
    e => e.staffId === 's-devon' && e.status === 'approved',
  )!;
  const sentBack = {
    ...state,
    timesheets: {
      entries: state.timesheets.entries.map(e =>
        e.id === devons.id
          ? {
              ...e,
              status: 'draft' as const,
              approvedBy: undefined,
              approvedAt: undefined,
              sentBackBy: 's-keisha',
              sentBackAt: '2026-09-13',
              sentBackReason: 'Wrong day.',
            }
          : e,
      ),
    },
  } as PortalState;

  it("counts the person's own sent-back hours as theirs to act on", () => {
    expect(waitingOn(state, as('teacher', 's-devon'))).toBe(0);
    expect(waitingOn(sentBack, as('teacher', 's-devon'))).toBe(1);
  });

  it('adds them to what an approver may approve, and counts them for nobody else', () => {
    // Devon as a director: Renee's submitted entry to approve, and his own sent back.
    expect(waitingOn(sentBack, as('director', 's-devon'))).toBe(2);
    expect(waitingOn(sentBack, as('teacher', 's-albert'))).toBe(0);
    expect(waitingOn(sentBack, as('office-manager', 's-keisha'))).toBe(2);
  });
});
