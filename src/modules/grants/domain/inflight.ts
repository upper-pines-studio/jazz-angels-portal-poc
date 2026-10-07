import { isInFlightPhase } from './phases';
import type { NewGrantInput } from './types';

/**
 * Bringing in a grant already under way (decision 0004): the checks the store
 * runs before `addGrant` writes one, so a bad input changes nothing. The Add
 * grant dialog shows the same problems against each field.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined): value is string {
  return !!value && ISO_DATE.test(value);
}

/** A whole number of dollars, zero or more. */
export function isWholeDollars(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/** Why this in-flight grant cannot be brought in, or undefined when it can. */
export function inFlightRefusal(input: NewGrantInput): string | undefined {
  const flight = input.inFlight;
  if (!flight) return undefined;

  if (!isInFlightPhase(input.phase))
    return 'A grant already under way comes in at Awarded, Active or Reporting.';
  if (!isWholeDollars(flight.amountAwarded) || flight.amountAwarded <= 0)
    return 'Enter the amount awarded in whole dollars.';

  const { periodStart, periodEnd } = input.dates ?? {};
  if (periodStart && periodEnd && periodEnd < periodStart)
    return 'The grant period has to end after it starts.';

  const seen = new Set<string>();
  for (const line of flight.budgetLines ?? []) {
    const name = line.category.trim();
    if (!name) return 'Give every budget line a category.';
    if (seen.has(name.toLowerCase())) return `There are two budget lines called ${name}.`;
    seen.add(name.toLowerCase());
    if (!isWholeDollars(line.planned)) return 'Budget amounts are whole dollars.';
  }

  for (const p of flight.payments ?? []) {
    if (!p.label.trim()) return 'Give every payment a name, like First installment.';
    if (!isWholeDollars(p.amount) || p.amount <= 0) return 'Payment amounts are whole dollars.';
    if (!isIsoDate(p.expectedDate)) return 'Every payment needs the date it is expected.';
    if (p.receivedDate !== undefined && !isIsoDate(p.receivedDate))
      return 'A received payment needs the date it arrived.';
  }

  for (const r of flight.reports ?? []) {
    if (!isIsoDate(r.dueDate)) return 'Every report needs its due date.';
    const sent = r.status === 'submitted' || r.status === 'accepted';
    if (r.submittedDate !== undefined && (!sent || !isIsoDate(r.submittedDate)))
      return 'Only a report that has been sent has a sent date.';
  }

  return undefined;
}
