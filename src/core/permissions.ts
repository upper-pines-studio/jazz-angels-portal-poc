import { ROLES } from './roles';
import type { Role } from './types';

/**
 * What each role may see and do: the table in decision 0001
 * (`docs/decisions/0001-roles-and-permissions.md`, "What each role can do"),
 * written as data, and the one function that reads it.
 *
 * The rail, the routes, the buttons and the store all ask `can`, so a hidden
 * screen and a refused write agree. The table is keyed by role, never by
 * person: who holds which role is set on the staff record in Settings.
 */

/** One row of the table. */
export type Subject =
  | 'grants'
  | 'award'
  | 'program-budgets'
  | 'grant-shares'
  | 'transactions'
  | 'schedule'
  | 'roll-call'
  | 'students'
  | 'guardian-contacts'
  | 'timesheets-log'
  | 'timesheets-approve'
  | 'partners'
  | 'office-documents'
  | 'staff'
  | 'programs'
  | 'modules'
  | 'quickbooks-connect'
  | 'quickbooks-sync';

/** One cell, in the decision file's own words. `–` is "no". */
export type Cell =
  'Edit' | 'View' | 'View all' | 'Any class' | 'Own classes' | 'Counts only' | 'Own' | 'Yes' | '–';

/** The seven columns, in the decision file's order. */
type Row = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell];

/**
 * The table, row for row and column for column as decision 0001 has it, so the
 * two can be compared by eye. Columns follow `ROLES`.
 */
// prettier-ignore
export const PERMISSION_TABLE: ReadonlyArray<readonly [Subject, string, Row]> = [
  //                                                       Admin   Director Office mgr Bookkeeper Teacher        Assistant Read-only
  ['grants',             'Grants: pipeline, checklist, deadlines', ['Edit', 'Edit',  'Edit',  'View',  '–',           'Edit',  'View']],
  ['award',              'Award, budget, reports',                 ['Edit', 'Edit',  'Edit',  'Edit',  '–',           'View',  'View']],
  ['program-budgets',    'Program budgets and projects',           ['Edit', 'Edit',  'Edit',  'Edit',  '–',           'View',  'View']],
  ['grant-shares',       'Grant shares',                           ['Edit', 'Edit',  'Edit',  'Edit',  '–',           'View',  'View']],
  ['transactions',       'Transactions: assign, split',            ['Edit', 'Edit',  'Edit',  'Edit',  '–',           '–',     'View']],
  ['schedule',           'Schedule and classes',                   ['Edit', 'Edit',  'Edit',  '–',     'View all',    'View',  'View']],
  ['roll-call',          'Roll call',                              ['Any class', 'Any class', 'Any class', '–', 'Own classes', '–', '–']],
  ['students',           'Students: names, attendance',            ['Edit', 'Edit',  'Edit',  '–',     'Own classes', 'View',  'Counts only']],
  ['guardian-contacts',  'Guardian contact details',               ['Yes',  'Yes',   'Yes',   '–',     'Own classes', '–',     '–']],
  ['timesheets-log',     'Timesheets: log hours',                  ['Own',  'Own',   'Own',   'Own',   'Own',         'Own',   '–']],
  ['timesheets-approve', 'Timesheets: approve',                    ['Yes',  'Yes',   'Yes',   'Yes',   '–',           '–',     '–']],
  ['partners',           'Partners and venues',                    ['Edit', 'Edit',  'Edit',  'View',  'View',        'View',  'View']],
  ['office-documents',   'Office documents',                       ['Edit', 'Edit',  'Edit',  'Edit',  '–',           'View',  'View']],
  ['staff',              'Staff and roles',                        ['Yes',  'Yes',   '–',     '–',     '–',           '–',     '–']],
  ['programs',           'Programs: add, rename, archive',         ['Yes',  'Yes',   '–',     '–',     '–',           '–',     '–']],
  ['modules',            'Modules, import, export',                ['Yes',  '–',     '–',     '–',     '–',           '–',     '–']],
  ['quickbooks-connect', 'QuickBooks: connect',                    ['Yes',  '–',     '–',     '–',     '–',           '–',     '–']],
  ['quickbooks-sync',    'QuickBooks: sync',                       ['Yes',  'Yes',   'Yes',   'Yes',   '–',           '–',     '–']],
];

/**
 * What is being asked.
 * - `open`: may the screen be shown at all (the rail, the route). Any cell but `–`.
 * - `view`: may the records themselves be read. `Counts only` may not.
 * - `edit`: may they be changed.
 */
export type Need = 'open' | 'view' | 'edit';

/** A route, a rail item or an action names what it needs this way. */
export interface Requirement {
  subject: Subject;
  /** Defaults to `open`. */
  need?: Need;
}

/** Cells that hold only for the person's own records: their classes, their hours. */
const OWN_CELLS: readonly Cell[] = ['Own', 'Own classes'];
const VIEW_CELLS: readonly Cell[] = [
  'Edit',
  'View',
  'View all',
  'Any class',
  'Own classes',
  'Own',
  'Yes',
];
const EDIT_CELLS: readonly Cell[] = ['Edit', 'Any class', 'Own classes', 'Own', 'Yes'];

/**
 * Rows where `Own classes` means seeing, not changing. A teacher sees their own
 * classes' students and guardian contacts; they change attendance through Roll
 * call, not the roster.
 */
const SEE_ONLY_OWN: readonly Subject[] = ['students', 'guardian-contacts'];

const BY_SUBJECT = new Map(PERMISSION_TABLE.map(([subject, , row]) => [subject, row]));

/** The cell for one role on one row, as the decision file writes it. */
export function cell(role: Role, subject: Subject): Cell {
  const row = BY_SUBJECT.get(subject);
  const column = ROLES.indexOf(role);
  return row && column >= 0 ? row[column] : '–';
}

/** True when the cell only holds for the person's own classes or hours. */
export function isOwnOnly(role: Role, subject: Subject): boolean {
  return OWN_CELLS.includes(cell(role, subject));
}

/**
 * May this role do this? The one check.
 *
 * `own` says whether the record in hand is the person's own: their class (an
 * ensemble they lead) or their hours. An `Own` or `Own classes` cell allows
 * `view` and `edit` only when it is; `open` needs no record.
 */
export function can(role: Role, subject: Subject, need: Need = 'open', own = false): boolean {
  const c = cell(role, subject);
  if (c === '–') return false;
  if (need === 'open') return true;
  if (OWN_CELLS.includes(c) && !own) return false;
  if (need === 'view') return VIEW_CELLS.includes(c);
  if (c === 'Own classes' && SEE_ONLY_OWN.includes(subject)) return false;
  return EDIT_CELLS.includes(c);
}

/**
 * The roles that may make someone an Admin, or change or archive an Admin's
 * record: Admin and Director (decision 0001, "Beyond the table"). A role
 * given "Staff and roles" later does not get this with it.
 */
export const ADMIN_MAKERS: readonly Role[] = ['admin', 'director'];

/**
 * May this role change a person's record from one role to another? "Staff and
 * roles" says who edits staff at all. Beyond the table, only an Admin or a
 * Director makes someone an Admin or changes an Admin's record. Nobody changes
 * their own role (the store refuses it with `OWN_ROLE_REFUSAL`), so a Director cannot hand themself
 * "Modules, import, export" and the QuickBooks connection.
 */
export function mayChangeStaff(role: Role, from: Role | undefined, to: Role | undefined): boolean {
  if (!can(role, 'staff', 'edit')) return false;
  return ADMIN_MAKERS.includes(role) || (from !== 'admin' && to !== 'admin');
}

/** What the store says when someone tries to change their own role, Admin included. */
export const OWN_ROLE_REFUSAL =
  "You can't change your own role. Ask someone else who manages staff.";

/** `can` for a `Requirement`. */
export function meets(role: Role, requirement: Requirement): boolean {
  return can(role, requirement.subject, requirement.need ?? 'open');
}

/** True when the role meets any one of them; an empty or missing list is open to all. */
export function meetsAny(
  role: Role,
  requirements: Requirement | readonly Requirement[] | undefined,
): boolean {
  if (!requirements) return true;
  const list = Array.isArray(requirements) ? requirements : [requirements as Requirement];
  return list.length === 0 || list.some(r => meets(role, r));
}
