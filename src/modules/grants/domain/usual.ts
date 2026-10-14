import { CATEGORY_ACCOUNTS } from './seed-money';

/** The five categories most music-education budgets use, in the order a budget lists them. */
export const USUAL_CATEGORIES = [
  'Teaching artist stipends',
  'Sheet music and charts',
  'Instrument repair',
  'Venue and performances',
  'Admin and insurance',
] as const;

/**
 * The lines "Start from the usual five categories" adds to a grant's budget.
 * Only the demo knows which QuickBooks accounts sit behind each category, since
 * the codes are Jazz Angels' own; a real office's lines start with none, and it
 * picks them from its own chart of accounts.
 */
export function usualBudgetLines(demo: boolean): { category: string; accountCodes: string[] }[] {
  return USUAL_CATEGORIES.map(category => ({
    category,
    accountCodes: demo ? [...(CATEGORY_ACCOUNTS[category] ?? [])] : [],
  }));
}
