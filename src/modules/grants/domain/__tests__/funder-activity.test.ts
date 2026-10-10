import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { funderActivity, funderLastActivity } from '../derive';
import { makeSeed } from '../seed';
import type { Activity, Grant } from '../types';

/**
 * Herb Alpert with two grants, the older one archived, and a row on another
 * funder's grant written in between, so order and filtering both show.
 */
function stateWithTwoHerbAlpertGrants(): PortalState {
  const grants = makeSeed();
  const current = grants.grants.find(g => g.id === 'g-herb-alpert-2026')!;
  const archived: Grant = {
    ...current,
    id: 'g-herb-alpert-2025',
    title: 'Herb Alpert Foundation 2025',
    archivedAt: '2026-01-05',
    archivedById: 's-gwen',
  };
  const row = (id: string, grantId: string, at: string, text: string): Activity => ({
    id,
    grantId,
    at,
    whoId: 's-barry',
    text,
  });
  return {
    core: makeCoreSeed(),
    grants: {
      ...grants,
      grants: [...grants.grants, archived],
      activity: [
        row('a-1', 'g-herb-alpert-2026', '2026-08-01T10:00:00.000Z', 'Newer on the current grant'),
        row('a-2', 'g-herb-alpert-2025', '2025-05-01T09:00:00.000Z', 'On the archived grant'),
        row('a-3', 'g-la-county-2026', '2026-08-02T09:00:00.000Z', 'Another funder'),
        row('a-4', 'g-herb-alpert-2026', '2026-08-01T16:30:00.000Z', 'Later the same day'),
      ],
    },
  } as unknown as PortalState;
}

describe('funderActivity', () => {
  const state = stateWithTwoHerbAlpertGrants();
  const lines = funderActivity(state, 'f-herb-alpert');

  it('is newest first, by time as well as day', () => {
    expect(lines.map(l => l.row.id)).toEqual(['a-4', 'a-1', 'a-2']);
  });

  it("names each line's grant", () => {
    expect(lines.map(l => l.grant.id)).toEqual([
      'g-herb-alpert-2026',
      'g-herb-alpert-2026',
      'g-herb-alpert-2025',
    ]);
  });

  it("includes an archived grant's activity: it is history", () => {
    expect(lines.find(l => l.row.id === 'a-2')?.grant.archivedAt).toBe('2026-01-05');
  });

  it("leaves out another funder's grants", () => {
    expect(lines.some(l => l.row.id === 'a-3')).toBe(false);
    expect(funderActivity(state, 'f-la-county-arts').map(l => l.row.id)).toEqual(['a-3']);
  });

  it('is empty for a funder with no grants, or no activity', () => {
    expect(funderActivity(state, 'f-nobody')).toEqual([]);
    const quiet = {
      ...state,
      grants: { ...state.grants, activity: [] },
    } as unknown as PortalState;
    expect(funderActivity(quiet, 'f-herb-alpert')).toEqual([]);
    expect(funderLastActivity(quiet, 'f-herb-alpert')).toBeUndefined();
  });

  it("gives the Funders list the day of the funder's newest row", () => {
    expect(funderLastActivity(state, 'f-herb-alpert')).toBe('2026-08-01');
  });

  it('reads the demo data: every Herb Alpert row, newest first', () => {
    const demo = { core: makeCoreSeed(), grants: makeSeed() } as unknown as PortalState;
    const demoLines = funderActivity(demo, 'f-herb-alpert');
    expect(demoLines).toHaveLength(7);
    expect(demoLines[0].row.text).toBe('Logged $8,000 to Teaching artist stipends');
    expect(demoLines.at(-1)?.row.text).toBe('Grant added');
  });
});
