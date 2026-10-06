import type { Role } from './types';

/**
 * The seven roles of decision 0001 (`docs/decisions/0001-roles-and-permissions.md`).
 * This file names them; what each may do is not enforced yet.
 */

/** Every role, in the order decision 0001 lists them. */
export const ROLES: readonly Role[] = [
  'admin',
  'director',
  'office-manager',
  'bookkeeper',
  'teacher',
  'assistant',
  'read-only',
];

/** The words the screens use for each role, as decision 0001 writes them. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  director: 'Director',
  'office-manager': 'Office manager',
  bookkeeper: 'Bookkeeper',
  teacher: 'Teacher',
  assistant: 'Office assistant',
  'read-only': 'Read-only',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
