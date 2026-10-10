/**
 * Office documents (decision 0005): the papers every funder asks for, kept
 * once for the office, each with its versions and an optional expiry. The
 * newest version added is the current one; older ones stay, read-only.
 *
 * In code these are "office documents", never "organization documents":
 * an `Organization` is a partner. Screen copy may say "the organization's
 * documents".
 */

import { isArchived, normaliseArchived, withArchived } from './archive';
import { daysUntil } from './format';
import type {
  FileFacts,
  FileFormat,
  OfficeDocument,
  OfficeDocumentInput,
  OfficeDocumentKind,
  OfficeDocumentVersion,
  OfficeDocumentVersionInput,
  PortalState,
} from './types';

/** The kinds, in the order the screens offer and list them, with their words. */
export const OFFICE_DOCUMENT_KINDS: ReadonlyArray<{ value: OfficeDocumentKind; label: string }> = [
  { value: 'irs-letter', label: 'IRS determination letter' },
  { value: 'financials', label: 'Audit or financials' },
  { value: 'board-list', label: 'Board list' },
  { value: 'insurance-certificate', label: 'Insurance certificate' },
  { value: 'w9', label: 'W-9' },
  { value: 'organization-budget', label: 'Organization budget' },
  { value: 'other', label: 'Other' },
];

const KIND_ORDER = OFFICE_DOCUMENT_KINDS.map(k => k.value);
const FORMATS: readonly FileFormat[] = ['pdf', 'jpg', 'png', 'heic'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isOfficeDocumentKind(value: unknown): value is OfficeDocumentKind {
  return typeof value === 'string' && (KIND_ORDER as string[]).includes(value);
}

/** "IRS determination letter" */
export function officeDocumentKindLabel(kind: OfficeDocumentKind): string {
  return OFFICE_DOCUMENT_KINDS.find(k => k.value === kind)?.label ?? 'Other';
}

/** A document expires soon when it runs out within this many days of today. */
export const EXPIRES_SOON_DAYS = 30;

/**
 * - `out-of-date`: the current version's expiry day has come (it is out of
 *   date on the day itself), or there is no version at all.
 * - `expires-soon`: it expires within `EXPIRES_SOON_DAYS` days of today.
 * - `current`: anything else, and always when it has no expiry.
 */
export type OfficeDocumentStatus = 'out-of-date' | 'expires-soon' | 'current';

/**
 * The version that is current: the newest added (a later one in the list wins
 * a tie). Given `on`, an ISO date, the version that was current that day: the
 * newest added on or before it, so a grant submitted earlier can name what it
 * sent (#68). Undefined when there is none.
 */
export function currentVersion(
  doc: OfficeDocument,
  on?: string,
): OfficeDocumentVersion | undefined {
  let best: OfficeDocumentVersion | undefined;
  for (const v of doc.versions) {
    if (on && v.addedAt > on) continue;
    if (!best || v.addedAt >= best.addedAt) best = v;
  }
  return best;
}

/** The versions newest first, the current one at the top. */
export function versionsNewestFirst(doc: OfficeDocument): OfficeDocumentVersion[] {
  return doc.versions
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v.addedAt.localeCompare(a.v.addedAt) || b.i - a.i)
    .map(x => x.v);
}

/** One version's status against `today` (the store's today, which follows the demo date). */
export function versionStatus(
  version: OfficeDocumentVersion | undefined,
  today: string,
): OfficeDocumentStatus {
  if (!version) return 'out-of-date';
  if (!version.expires) return 'current';
  const days = daysUntil(version.expires, today);
  if (days <= 0) return 'out-of-date';
  return days <= EXPIRES_SOON_DAYS ? 'expires-soon' : 'current';
}

/** A document's status: its current version's. */
export function officeDocumentStatus(doc: OfficeDocument, today: string): OfficeDocumentStatus {
  return versionStatus(currentVersion(doc), today);
}

export function officeDocumentById(
  state: PortalState,
  id: string | undefined,
): OfficeDocument | undefined {
  return id ? state.core.officeDocuments.find(d => d.id === id) : undefined;
}

/**
 * The documents as the list shows them: by kind in the order of
 * `OFFICE_DOCUMENT_KINDS`, then by name; archived ones after, when asked for.
 */
export function officeDocumentsList(state: PortalState, includeArchived = false): OfficeDocument[] {
  const sorted = [...state.core.officeDocuments].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name),
  );
  return withArchived(sorted, includeArchived);
}

/**
 * The current documents that are out of date or expire soon, out of date
 * first, then by expiry. What the dashboard lists.
 */
export function officeDocumentsNeedingAttention(
  state: PortalState,
  today: string,
): Array<{
  document: OfficeDocument;
  version?: OfficeDocumentVersion;
  status: OfficeDocumentStatus;
}> {
  const rank = { 'out-of-date': 0, 'expires-soon': 1, current: 2 };
  return state.core.officeDocuments
    .filter(d => !isArchived(d))
    .map(document => {
      const version = currentVersion(document);
      return { document, version, status: versionStatus(version, today) };
    })
    .filter(x => x.status !== 'current')
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.version?.expires ?? '').localeCompare(b.version?.expires ?? '') ||
        a.document.name.localeCompare(b.document.name),
    );
}

// ---------------------------------------------------------------------------
// The rules the store checks
// ---------------------------------------------------------------------------

/** Why a file cannot be stored as a version, or undefined when it can. */
function fileProblem(file: FileFacts | undefined): string | undefined {
  if (!file || typeof file.name !== 'string' || !file.name.trim()) return 'Choose a file to add.';
  if (!FORMATS.includes(file.format)) return `${file.name} is not a PDF, JPG, PNG or HEIC.`;
  if (typeof file.sizeKb !== 'number' || !(file.sizeKb > 0)) return 'Choose a file to add.';
  return undefined;
}

function expiresProblem(expires: string | undefined): string | undefined {
  if (expires === undefined || expires === '') return undefined;
  return ISO_DATE.test(expires) ? undefined : 'Give the expiry as a date, or leave it blank.';
}

/** Why a document cannot be added this way, or undefined when it can. */
export function officeDocumentProblem(
  input: Partial<Pick<OfficeDocument, 'name' | 'kind'>>,
): string | undefined {
  if (!input.name?.trim()) return 'Give the document a name.';
  if (!isOfficeDocumentKind(input.kind)) return 'Choose what kind of document it is.';
  return undefined;
}

/** Why a version cannot be added this way, or undefined when it can. */
export function officeDocumentVersionProblem(
  input: OfficeDocumentVersionInput,
): string | undefined {
  return fileProblem(input.file) ?? expiresProblem(input.expires);
}

/** Why Add document would be refused, or undefined. */
export function newOfficeDocumentProblem(input: OfficeDocumentInput): string | undefined {
  return officeDocumentProblem(input) ?? officeDocumentVersionProblem(input);
}

/** A version as stored: the file's facts, the day, who, and the expiry when there is one. */
export function versionFields(
  id: string,
  input: OfficeDocumentVersionInput,
  addedAt: string,
  addedById: string,
): OfficeDocumentVersion {
  const { name, format, sizeKb, pages } = input.file;
  return {
    id,
    name: name.trim(),
    format,
    sizeKb: Math.round(sizeKb),
    ...(pages ? { pages } : {}),
    addedAt,
    addedById,
    ...(input.expires ? { expires: input.expires } : {}),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function normaliseVersion(raw: Partial<OfficeDocumentVersion>): OfficeDocumentVersion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.id !== 'string' || typeof raw.addedAt !== 'string') return undefined;
  if (typeof raw.name !== 'string' || !FORMATS.includes(raw.format as FileFormat)) return undefined;
  return {
    id: raw.id,
    name: raw.name,
    format: raw.format as FileFormat,
    sizeKb: typeof raw.sizeKb === 'number' ? raw.sizeKb : 0,
    ...(typeof raw.pages === 'number' ? { pages: raw.pages } : {}),
    addedAt: raw.addedAt,
    addedById: typeof raw.addedById === 'string' ? raw.addedById : '',
    ...(typeof raw.expires === 'string' && raw.expires ? { expires: raw.expires } : {}),
  };
}

/** An office document as saved, or undefined when it is not one. A version it cannot read is dropped. */
export function normaliseOfficeDocument(raw: Partial<OfficeDocument>): OfficeDocument | undefined {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return undefined;
  const versions = Array.isArray(raw.versions)
    ? raw.versions.flatMap(v => normaliseVersion(v) ?? [])
    : [];
  return normaliseArchived({
    ...raw,
    id: raw.id,
    kind: isOfficeDocumentKind(raw.kind) ? raw.kind : 'other',
    name: typeof raw.name === 'string' ? raw.name : '',
    versions,
  } as OfficeDocument);
}
