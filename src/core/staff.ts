import type { StaffMember } from './types';
import { isArchived } from './archive';

/**
 * A staff record's optional email (#152): how it is checked and tidied. It
 * becomes the sign-in name once the backend arrives, so two current people may
 * not share one. Pure: Settings and the store's rules both ask here.
 */

/** Something, an @, something, a dot, something; no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `text` reads like an email address. */
export function looksLikeEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** The email as it is stored: trimmed, lower-case, undefined when blank. */
export function tidyEmail(email: string | null | undefined): string | undefined {
  const text = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return text || undefined;
}

export const STAFF_EMAIL_REFUSAL = 'Check the email. It should look like name@example.com.';

/**
 * Why this email cannot go on a staff record, in the words the form shows, or
 * undefined when it can. Blank is fine. `id` is the record being edited, so it
 * does not clash with itself; archived people do not hold their address.
 */
export function staffEmailProblem(
  staff: readonly StaffMember[],
  email: string | undefined,
  id?: string,
): string | undefined {
  const tidy = tidyEmail(email);
  if (!tidy) return undefined;
  if (!looksLikeEmail(tidy)) return STAFF_EMAIL_REFUSAL;
  const other = staff.find(s => s.id !== id && !isArchived(s) && tidyEmail(s.email) === tidy);
  if (other) return `${other.name} already has that email. Each person needs their own.`;
  return undefined;
}
