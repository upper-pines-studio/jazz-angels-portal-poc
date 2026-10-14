import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { awaitingApproval, awaitingApprovalFor } from '../derive';
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
