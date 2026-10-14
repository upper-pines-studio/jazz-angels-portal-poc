import { describe, expect, it } from 'vitest';
import { CATEGORY_ACCOUNTS } from '../seed-money';
import { USUAL_CATEGORIES, usualBudgetLines } from '../usual';

describe('usualBudgetLines', () => {
  it('lists the five usual categories', () => {
    expect(usualBudgetLines(false).map(l => l.category)).toEqual([...USUAL_CATEGORIES]);
    expect(USUAL_CATEGORIES).toHaveLength(5);
  });

  it('gives a real office lines with no QuickBooks accounts', () => {
    for (const line of usualBudgetLines(false))
      expect(line.accountCodes, line.category).toEqual([]);
  });

  it('gives the demo the accounts its seeded budgets use', () => {
    const demo = usualBudgetLines(true);
    expect(demo.map(l => l.accountCodes)).toEqual(USUAL_CATEGORIES.map(c => CATEGORY_ACCOUNTS[c]));
    for (const line of demo) expect(line.accountCodes.length, line.category).toBeGreaterThan(0);
  });

  it('hands out copies, so editing one line cannot change the next call', () => {
    usualBudgetLines(true)[0].accountCodes.push('9999');
    expect(usualBudgetLines(true)[0].accountCodes).not.toContain('9999');
  });

  it('keeps the seed and the usual categories in step', () => {
    expect(Object.keys(CATEGORY_ACCOUNTS).sort()).toEqual([...USUAL_CATEGORIES].sort());
  });
});
