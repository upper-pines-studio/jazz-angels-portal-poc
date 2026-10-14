import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState, Role, SignedInUser } from '../../../../core/types';
import { deadlines, deadlinesDueFor } from '../derive';
import { offPaceGrants, offPaceGrantsFor, toAssignFor, transactionCounts } from '../money';
import { SEED_TODAY, makeSeed } from '../seed';

const state = { core: makeCoreSeed(), grants: makeSeed() } as unknown as PortalState;
const today = SEED_TODAY; // 2026-09-13
const as = (role: Role): SignedInUser => ({ id: 's-someone', name: 'Someone', role });

const due = deadlines(state, today).filter(d => d.status !== 'upcoming').length;
const toAssign = transactionCounts(state)['to-assign'];
const offPace = offPaceGrants(state, today).length;

describe('the seed', () => {
  it('has deadlines due, transactions to assign and grants off pace', () => {
    expect(due).toBeGreaterThan(0);
    expect(toAssign).toBeGreaterThan(0);
    expect(offPace).toBeGreaterThan(0);
  });
});

describe('the Deadlines badge', () => {
  it.each<[Role, boolean]>([
    ['admin', true],
    ['director', true],
    ['office-manager', true],
    ['bookkeeper', false],
    ['teacher', false],
    ['assistant', true],
    ['read-only', false],
  ])('counts for a %s: %s', (role, counts) => {
    expect(deadlinesDueFor(state, today, as(role))).toHaveLength(counts ? due : 0);
  });
});

describe('the Transactions badge', () => {
  it.each<[Role, boolean]>([
    ['admin', true],
    ['director', true],
    ['office-manager', true],
    ['bookkeeper', true],
    ['teacher', false],
    ['assistant', false],
    ['read-only', false],
  ])('counts for a %s: %s', (role, counts) => {
    expect(toAssignFor(state, as(role))).toBe(counts ? toAssign : 0);
  });
});

describe('the Spend-down badge', () => {
  it.each<[Role, boolean]>([
    ['admin', true],
    ['director', true],
    ['office-manager', true],
    ['bookkeeper', true],
    ['teacher', false],
    ['assistant', false],
    ['read-only', false],
  ])('counts for a %s: %s', (role, counts) => {
    expect(offPaceGrantsFor(state, today, as(role))).toHaveLength(counts ? offPace : 0);
  });
});
