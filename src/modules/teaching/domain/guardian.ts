import type { Address } from '../../../core';
import type { Student } from './types';

/**
 * A guardian's optional email and address (decision 0004): how they are
 * checked, tidied and read from a line of text. Guardian data, so it reaches
 * the same people as the guardian's name and phone (decision 0001, `asSeenBy`).
 *
 * Pure: the student screens, the import and the store's rules all ask here.
 */

/** Something, an @, something, a dot, something; no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `text` reads like an email address. */
export function looksLikeEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** What is wrong with a guardian email, in the words the form shows. Blank is fine. */
export function guardianEmailRefusal(email: string | undefined): string | undefined {
  if (!email?.trim() || looksLikeEmail(email)) return undefined;
  return 'Check the email. It should look like name@example.com.';
}

/** The four parts, in the order a form and a sentence name them. */
const ADDRESS_PARTS: Array<{ part: keyof Address; word: string }> = [
  { part: 'street', word: 'street' },
  { part: 'city', word: 'city' },
  { part: 'state', word: 'state' },
  { part: 'zip', word: 'ZIP' },
];

/** "city", "city and ZIP", "street, city and ZIP". */
export function partsList(words: string[]): string {
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** The parts of an address left blank, by their word: `['city', 'ZIP']`. */
export function missingAddressParts(address: Partial<Address>): string[] {
  return ADDRESS_PARTS.filter(({ part }) => !address[part]?.trim()).map(({ word }) => word);
}

/**
 * What is wrong with a guardian address: all four parts or none, as on a
 * venue. Undefined when it can be saved; unset and all-blank are fine.
 */
export function guardianAddressRefusal(address: Partial<Address> | undefined): string | undefined {
  if (!address) return undefined;
  const missing = missingAddressParts(address);
  if (missing.length === 0 || missing.length === ADDRESS_PARTS.length) return undefined;
  return `Add the ${partsList(missing)}, or leave the address blank.`;
}

/** An address as saved: each part trimmed, and none at all when every part is blank. */
export function tidyAddress(address: Partial<Address> | undefined): Address | undefined {
  if (!address) return undefined;
  const tidy: Address = {
    street: address.street?.trim() ?? '',
    city: address.city?.trim() ?? '',
    state: address.state?.trim() ?? '',
    zip: address.zip?.trim() ?? '',
  };
  return missingAddressParts(tidy).length === ADDRESS_PARTS.length ? undefined : tidy;
}

/** "CA 90723", or "CA" and "90723" as two cells. */
const STATE_ZIP = /^([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/;
const STATE = /^[A-Za-z]{2}\.?$/;
const ZIP = /^\d{5}(?:-\d{4})?$/;

/**
 * An address written on one line, as a spreadsheet's Address column holds it:
 * "8500 Contreras St, Paramount, CA 90723", or with the state and ZIP in
 * their own parts. The street may hold commas of its own ("Apt 4"). Undefined
 * when the line cannot be read as street, city, state and ZIP.
 */
export function readAddressLine(text: string): Address | undefined {
  const parts = text
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  const last = parts.at(-1) ?? '';
  const both = STATE_ZIP.exec(last);
  if (both && parts.length >= 3) {
    return {
      street: parts.slice(0, -2).join(', '),
      city: parts.at(-2)!,
      state: both[1].toUpperCase(),
      zip: both[2],
    };
  }
  const state = parts.at(-2) ?? '';
  if (parts.length >= 4 && ZIP.test(last) && STATE.test(state)) {
    return {
      street: parts.slice(0, -3).join(', '),
      city: parts.at(-3)!,
      state: state.replace('.', '').toUpperCase(),
      zip: last,
    };
  }
  return undefined;
}

/**
 * What is wrong with a student's guardian email or address, for the store's
 * rules: the email first, then the address. Undefined when both can be saved.
 */
export function guardianRefusal(
  input: Partial<Pick<Student, 'guardianEmail' | 'guardianAddress'>>,
): string | undefined {
  return guardianEmailRefusal(input.guardianEmail) ?? guardianAddressRefusal(input.guardianAddress);
}
