import { describe, expect, it } from 'vitest';
import { inSchoolProgramIds } from '../../../../core/derive';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { hoursForProgram, hoursForPrograms } from '../derive';
import { makeSeed } from '../seed';

// "In-school hours" on Timesheets: the hours on every program marked
// in-school, whatever its id.

/** Last spring's term, the range a grant period would ask about. */
const SPRING = { from: '2026-03-01', to: '2026-04-26' };

function stateWith(mark: Record<string, boolean>): PortalState {
  const core = makeCoreSeed();
  core.programs = core.programs.map(p => (p.id in mark ? { ...p, inSchool: mark[p.id] } : p));
  return { core, timesheets: makeSeed() } as unknown as PortalState;
}

const inSchoolHours = (state: PortalState) =>
  hoursForPrograms(state, inSchoolProgramIds(state), SPRING.from, SPRING.to);

describe('in-school hours', () => {
  it('reads as the In-School Program’s hours in the demo', () => {
    const state = stateWith({});
    expect(inSchoolHours(state)).toBe(16);
    expect(inSchoolHours(state)).toBe(hoursForProgram(state, 'in-school', SPRING.from, SPRING.to));
  });

  it('adds up every in-school program, and follows the flag, not the id', () => {
    const both = stateWith({ homeschool: true });
    const homeschool = hoursForProgram(both, 'homeschool', SPRING.from, SPRING.to);
    expect(homeschool).toBeGreaterThan(0);
    expect(inSchoolHours(both)).toBe(16 + homeschool);
    expect(inSchoolHours(stateWith({ 'in-school': false, homeschool: true }))).toBe(homeschool);
    expect(inSchoolHours(stateWith({ 'in-school': false }))).toBe(0);
  });
});
