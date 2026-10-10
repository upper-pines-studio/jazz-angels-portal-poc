/**
 * A grant's register and the office's documents (#68, decision 0005). A
 * register row may use an office document instead of a file of its own; the
 * version it shows is worked out here, never stored: the current one until
 * the grant has a submitted date, then the newest added on or before that day.
 *
 * Office documents are core's; this reads them through core's public derives.
 */

import { isArchived } from '../../../core/archive';
import { currentVersion, officeDocumentsList, versionStatus } from '../../../core/documents';
import type {
  OfficeDocument,
  OfficeDocumentKind,
  OfficeDocumentVersion,
  PortalState,
} from '../../../core/types';
import type { DocumentKind, Grant, GrantDocument } from './types';

/** The register kinds the office also keeps once, with the same ids as `OfficeDocumentKind`. */
export const OFFICE_KINDS: readonly DocumentKind[] = [
  'irs-letter',
  'financials',
  'board-list',
  'insurance-certificate',
  'w9',
  'organization-budget',
];

/** The rows a new grant's register links to the office's copy when there is one. */
export const NEW_GRANT_LINKED_KINDS: readonly DocumentKind[] = [
  'irs-letter',
  'board-list',
  'financials',
];

function officeKindOf(kind: DocumentKind): OfficeDocumentKind | undefined {
  return OFFICE_KINDS.includes(kind) ? (kind as OfficeDocumentKind) : undefined;
}

/**
 * Whether a row of this kind may use this office document: the same kind, or
 * any document when the row is Other.
 */
export function kindsMatch(rowKind: DocumentKind, doc: OfficeDocument): boolean {
  return rowKind === 'other' || officeKindOf(rowKind) === doc.kind;
}

/**
 * The office documents a row of this kind may use, as Office › Documents
 * lists them; archived ones left out. Empty means "Use the organization's" is
 * not offered.
 */
export function officeDocumentsFor(state: PortalState, kind: DocumentKind): OfficeDocument[] {
  return officeDocumentsList(state).filter(d => kindsMatch(kind, d));
}

/**
 * The version a linked row shows: the current one, or, once the grant has a
 * submitted date, the newest added on or before it. Undefined when no version
 * had been added by then.
 */
export function versionShown(
  doc: OfficeDocument,
  grant: Pick<Grant, 'dates'>,
): OfficeDocumentVersion | undefined {
  return currentVersion(doc, grant.dates.submitted);
}

export interface LinkedOfficeDocument {
  document: OfficeDocument;
  /** The version the row shows; missing when none had been added by the submitted date. */
  version?: OfficeDocumentVersion;
  /** The grant's submitted date, when it has one: the version is the one current that day. */
  submittedOn?: string;
  /** The version shown is the document's current one. */
  isCurrent: boolean;
  /**
   * The warning to show. Before the grant is submitted, against today: Out of
   * date or Expires soon. After, the version is history, so only whether it
   * was already out of date on the day it went in.
   */
  warning?: 'out-of-date' | 'expires-soon';
  /** The office document has been archived since; the row still shows it. */
  archived: boolean;
}

/** What a register row's link to an office document shows, or undefined for an unlinked row. */
export function linkedOfficeDocument(
  state: PortalState,
  row: Pick<GrantDocument, 'officeDocumentId'>,
  grant: Pick<Grant, 'dates'>,
  today: string,
): LinkedOfficeDocument | undefined {
  if (!row.officeDocumentId) return undefined;
  const document = state.core.officeDocuments.find(d => d.id === row.officeDocumentId);
  if (!document) return undefined;
  const submittedOn = grant.dates.submitted;
  const version = versionShown(document, grant);
  const current = currentVersion(document);
  let warning: LinkedOfficeDocument['warning'];
  if (version) {
    const status = versionStatus(version, submittedOn ?? today);
    if (status === 'out-of-date' || (!submittedOn && status === 'expires-soon')) warning = status;
  }
  return {
    document,
    version,
    ...(submittedOn ? { submittedOn } : {}),
    isCurrent: !!version && version.id === current?.id,
    ...(warning ? { warning } : {}),
    archived: isArchived(document),
  };
}

/**
 * The office documents a new grant's register links to, by kind: for the IRS
 * letter, the board list and the financials, the first current office
 * document of that kind. A kind with none stays unlinked.
 */
export function newRegisterLinks(state: PortalState): Partial<Record<DocumentKind, string>> {
  const links: Partial<Record<DocumentKind, string>> = {};
  for (const kind of NEW_GRANT_LINKED_KINDS) {
    const doc = officeDocumentsList(state).find(d => d.kind === kind);
    if (doc) links[kind] = doc.id;
  }
  return links;
}

/**
 * Why a row of this kind may not use this office document, or undefined when
 * it may. `previousId` is the row's link before the change: keeping a link to
 * a document archived since is fine; choosing an archived one is not.
 */
export function officeLinkProblem(
  state: PortalState,
  kind: DocumentKind,
  officeDocumentId: string | undefined,
  previousId?: string,
): string | undefined {
  if (!officeDocumentId) return undefined;
  const doc = state.core.officeDocuments.find(d => d.id === officeDocumentId);
  if (!doc) return 'That office document is no longer in the portal.';
  if (isArchived(doc) && officeDocumentId !== previousId)
    return `${doc.name} is archived. Restore it on Office › Documents to use it here.`;
  if (!kindsMatch(kind, doc))
    return `${doc.name} is not this kind of document. Choose one that is, or set the row to Other.`;
  return undefined;
}
