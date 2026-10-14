import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { ensembleById, rollCallsDueFor, unsubmittedRollCalls } from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';

const state = { core: makeCoreSeed(), teaching: makeSeed() } as unknown as PortalState;
const today = SEED_TODAY; // Sunday 2026-09-13
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });
const names = (user: SignedInUser) =>
  rollCallsDueFor(state, today, user).map(m => ensembleById(state, m.ensembleId)?.name);

/** Today Combo B (Barry leads it) and Big Band (Devon leads it) have no roll in. */
describe('the Schedule badge', () => {
  it('starts from two roll calls due', () => {
    expect(
      unsubmittedRollCalls(state, today).map(m => ensembleById(state, m.ensembleId)?.name),
    ).toEqual(['Combo B', 'Big Band']);
  });

  it.each<[Role, number]>([
    ['admin', 2],
    ['director', 2],
    ['office-manager', 2],
    ['bookkeeper', 0],
    ['teacher', 0],
    ['assistant', 0],
    ['read-only', 0],
  ])('counts the roll calls a %s may take: %i', (role, count) => {
    expect(rollCallsDueFor(state, today, as(role))).toHaveLength(count);
  });

  it("counts a teacher's own classes and no one else's", () => {
    expect(names(as('teacher', 's-devon'))).toEqual(['Big Band']);
    expect(names(as('teacher', 's-renee'))).toEqual([]);
  });

  it('counts every class for a director, whoever leads it', () => {
    expect(names(as('director', 's-barry'))).toEqual(['Combo B', 'Big Band']);
  });
});
