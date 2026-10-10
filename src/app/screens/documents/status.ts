import {
  dateLong,
  officeDocumentsNeedingAttention,
  relativeDays,
  versionStatus,
} from '../../../core';
import type {
  AttentionItem,
  OfficeDocumentStatus,
  OfficeDocumentVersion,
  PortalState,
} from '../../../core';

/**
 * The words and tones for an office document's status, and the dashboard's
 * rows for the ones that need a new version. Core decides the status
 * (`versionStatus`); this is how the screens say it.
 */

export const STATUS_LABEL: Record<OfficeDocumentStatus, string> = {
  'out-of-date': 'Out of date',
  'expires-soon': 'Expires soon',
  current: 'Current',
};

/** Danger for out of date, gold (the attention colour) for expiring soon, teal for current. */
export const STATUS_TONE: Record<OfficeDocumentStatus, 'danger' | 'gold' | 'teal'> = {
  'out-of-date': 'danger',
  'expires-soon': 'gold',
  current: 'teal',
};

/**
 * One line on when a version runs out: "Expired on Oct 1, 2026", "Expires Oct
 * 1, 2026, in 18 days", "Expires Dec 31, 2026", "Never expires".
 */
export function expiryLine(version: OfficeDocumentVersion | undefined, today: string): string {
  if (!version) return 'No version yet';
  if (!version.expires) return 'Never expires';
  const status = versionStatus(version, today);
  if (status === 'out-of-date') return `Expired on ${dateLong(version.expires)}`;
  if (status === 'expires-soon')
    return `Expires ${dateLong(version.expires)}, ${relativeDays(version.expires, today)}`;
  return `Expires ${dateLong(version.expires)}`;
}

/** An earlier version's expiry, plainly: it is not the one that counts any more. */
export function earlierExpiryLine(version: OfficeDocumentVersion): string {
  return version.expires ? `Expiry: ${dateLong(version.expires)}` : 'No expiry';
}

/**
 * The dashboard's rows for the office's documents (decision 0005): each
 * current document that is out of date or expires within 30 days, dated by
 * its expiry. The dashboard adds them itself, since core has no module
 * contribution, and only for a role that may open Office › Documents.
 */
export function officeDocumentAttention(state: PortalState, today: string): AttentionItem[] {
  return officeDocumentsNeedingAttention(state, today).map(({ document, version, status }) => ({
    id: `office-document:${document.id}`,
    date: version?.expires ?? today,
    label: document.name,
    detail:
      status === 'out-of-date'
        ? `${expiryLine(version, today)}. Add the new version before it goes to a funder.`
        : `${expiryLine(version, today)}. Add the new version when it comes.`,
    status: status === 'out-of-date' ? 'overdue' : 'due-soon',
    statusLabel: STATUS_LABEL[status],
    href: `/documents/${document.id}`,
    ownerId: version?.addedById,
    source: 'Office',
    requires: { subject: 'office-documents' },
  }));
}
