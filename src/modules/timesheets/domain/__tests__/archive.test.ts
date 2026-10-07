import { describe, expect, it } from 'vitest';
import { archiveFields } from '../../../../core/archive';
import { staffById } from '../../../../core/derive';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { awaitingApproval, entriesInRange, hoursForProgram, hoursThisMonth } from '../derive';
import { SEED_TODAY, makeSeed } from '../seed';

/** Last spring's term, the range a grant period would ask about. */
const SPRING = { from: '2026-03-01', to: '2026-04-26' };

describe('an archived teacher’s hours (decision 0002)', () => {
  const before = { core: makeCoreSeed(), timesheets: makeSeed() } as unknown as PortalState;
  const core = makeCoreSeed();
  core.staff = core.staff.map(s =>
    s.id === 's-devon' ? { ...s, ...archiveFields({ id: 's-gwen' }, '2026-10-07') } : s,
  );
  const after = { core, timesheets: makeSeed() } as unknown as PortalState;

  it('still count, over a range that includes the time they worked', () => {
    const devon = (s: PortalState) =>
      entriesInRange(s, SPRING).filter(e => e.staffId === 's-devon');
    expect(devon(before).length).toBeGreaterThan(0);
    expect(devon(after)).toEqual(devon(before));
    expect(hoursForProgram(after, 'in-school', SPRING.from, SPRING.to)).toBe(
      hoursForProgram(before, 'in-school', SPRING.from, SPRING.to),
    );
    expect(hoursThisMonth(after, SEED_TODAY)).toBe(hoursThisMonth(before, SEED_TODAY));
    expect(awaitingApproval(after)).toEqual(awaitingApproval(before));
  });

  it('still name them, and their approvals name whoever approved', () => {
    const approved = after.timesheets.entries.find(e => e.approvedBy);
    expect(staffById(after, 's-devon')?.name).toBe('Devon Price');
    expect(staffById(after, approved?.approvedBy)?.name).toBeTruthy();
  });
});
