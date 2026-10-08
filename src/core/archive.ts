/**
 * Archiving (decision 0002). A grant, a funder, a staff member, a student, a
 * partner, a venue, a class (an ensemble), a session or a program that is no
 * longer current is archived: it
 * leaves the everyday lists and pickers, stays in history and reports, and can
 * be restored. Nothing is deleted, and nothing cascades.
 *
 * Every module reads archived-ness through these helpers, so the nine record
 * types behave the same way. Archiving is an ordinary update that sets the two
 * fields; restoring is one that clears them.
 */

/** The two fields each of the nine record types carries. Both unset means current. */
export interface Archivable {
  /** ISO `YYYY-MM-DD`: the day it was archived. */
  archivedAt?: string;
  /** The staff id of whoever archived it. */
  archivedById?: string;
}

/** True when the record is archived. A missing record is not. */
export function isArchived(record: Archivable | undefined | null): boolean {
  return !!record?.archivedAt;
}

/**
 * True when the record was archived on or before `dateISO`: an archived class
 * still meets on the days before its archive date, and not from it on.
 */
export function archivedBy(record: Archivable | undefined | null, dateISO: string): boolean {
  return !!record?.archivedAt && record.archivedAt <= dateISO;
}

/** The current records only, in their order. What every everyday list shows. */
export function activeOnly<T extends Archivable>(rows: readonly T[]): T[] {
  return rows.filter(row => !isArchived(row));
}

/** The archived records only, in their order. */
export function archivedOnly<T extends Archivable>(rows: readonly T[]): T[] {
  return rows.filter(isArchived);
}

/**
 * A list as the screens show it: the current records, then, when `include` is
 * set, the archived ones after them. Each group keeps the order it came in.
 */
export function withArchived<T extends Archivable>(rows: readonly T[], include: boolean): T[] {
  return include ? [...activeOnly(rows), ...archivedOnly(rows)] : activeOnly(rows);
}

/**
 * The records a picker offers: the current ones, plus the one already chosen
 * when it has since been archived, so an existing choice still reads right.
 */
export function pickable<T extends Archivable & { id: string }>(
  rows: readonly T[],
  keepId?: string,
): T[] {
  return rows.filter(row => !isArchived(row) || row.id === keepId);
}

/** The patch that archives a record today, credited to the signed-in person. */
export function archiveFields(user: { id: string }, today: string): Required<Archivable> {
  return { archivedAt: today, archivedById: user.id };
}

/** The patch that restores a record: both fields cleared. */
export function restoreFields(): Archivable {
  return { archivedAt: undefined, archivedById: undefined };
}

/**
 * A record as loaded, with the archive fields checked: a field that is not a
 * string (a `null` from an older export, say) is dropped, and so is a stray
 * `archivedById` without a date. Every slice's `normalise` runs its archivable
 * rows through this.
 */
export function normaliseArchived<T extends object>(row: T): T {
  const r = row as T & { archivedAt?: unknown; archivedById?: unknown };
  const at = typeof r.archivedAt === 'string' && r.archivedAt ? r.archivedAt : undefined;
  const by = at && typeof r.archivedById === 'string' ? r.archivedById : undefined;
  if (r.archivedAt === at && r.archivedById === by) return row;
  const { archivedAt: _at, archivedById: _by, ...rest } = r;
  return { ...rest, ...(at ? { archivedAt: at } : {}), ...(by ? { archivedById: by } : {}) } as T;
}
