import {
  dateLong,
  officeDocumentsNeedingAttention,
  relativeDays,
  versionStatus,
} from '../../../core';
import { OFFICE_DOCUMENT_STATUS_LABEL } from '../../components/badges';
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

/** The status words and tones, shared with a grant's register (`app/components/badges.tsx`). */
export {
  OFFICE_DOCUMENT_STATUS_LABEL as STATUS_LABEL,
  OFFICE_DOCUMENT_STATUS_TONE as STATUS_TONE,
} from '../../components/badges';

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
    statusLabel: OFFICE_DOCUMENT_STATUS_LABEL[status],
    href: `/documents/${document.id}`,
    ownerId: version?.addedById,
    source: 'Office',
    requires: { subject: 'office-documents' },
  }));
}
