import React from 'react';
import { dateLong, money, staffById, useStore } from '../../../../core';
import {
  PaperRules,
  StoredFileDialog,
  downloadStoredFile,
  fileUrl,
  useAddedLine,
} from '../../../../app/components/files';
import { funderById, grantById } from '../../domain';
import type { GrantFile, GrantFileFormat, GrantFileKind } from '../../domain';

/**
 * A grant's stored files. The file pieces that are not about grants (the
 * bytes for this session, the drop zone, the viewer, the plain drawn page)
 * are shared in `app/components/files.tsx` and re-exported here, so the
 * grant screens keep one place to import from. What stays is the grants
 * module's own: the kinds a grant file can be, and the page drawn from the
 * grant or the expense a seeded file belongs to.
 */

export {
  ACCEPTED_FILES,
  FileDrop,
  MAX_FILE_MB,
  PageTurner,
  describeFile,
  fileFacts,
  fileUrl,
  forgetFile,
  rememberFile,
} from '../../../../app/components/files';

export const FILE_KIND_LABEL: Record<GrantFileKind, string> = {
  'award-letter': 'Award letter',
  agreement: 'Signed agreement',
  receipt: 'Receipt',
  invoice: 'Invoice',
  timesheet: 'Timesheet',
  other: 'Backup',
};

/** A receipt is a photo, anything else with pages is an invoice. A starting guess the office can change. */
export function guessKind(format: GrantFileFormat): GrantFileKind {
  return format === 'pdf' ? 'invoice' : 'receipt';
}

// ---------------------------------------------------------------------------
// The drawn page
// ---------------------------------------------------------------------------

/**
 * A small picture of a stored file. A file added in this session shows itself
 * when it is an image; everything else is drawn from the grant or the expense
 * it belongs to, so the page says something true.
 */
export function FilePaper({
  file,
  page = 1,
  style,
}: {
  file: GrantFile;
  page?: number;
  style?: React.CSSProperties;
}) {
  const { state } = useStore();
  const url = fileUrl(file.id);
  const grant = grantById(state, file.grantId);
  const funder = grant && funderById(state, grant.funderId);
  const expense = file.expenseId
    ? state.grants.expenses.find(e => e.id === file.expenseId)
    : undefined;
  const owner = grant && staffById(state, grant.ownerId);

  if (url && file.format !== 'pdf' && file.format !== 'heic') {
    return (
      <div className="ja-paper" style={style}>
        <img src={url} alt={file.name} />
        <span className="ja-paper__format" data-format={file.format}>
          {file.format}
        </span>
      </div>
    );
  }

  const photo = file.format !== 'pdf';
  let sheet: React.ReactNode;

  if (file.kind === 'award-letter' || file.kind === 'agreement') {
    const terms = state.grants.terms.filter(t => t.grantId === file.grantId && t.page === page);
    sheet =
      page === 1 ? (
        <>
          <div className="ja-paper__head">
            <span className="ja-paper__mark">
              <i />
              {funder?.name ?? 'Funder'}
            </span>
          </div>
          <span>{dateLong(grant?.dates.decided)}</span>
          <PaperRules widths={['short', 'mid']} />
          <span>Dear {owner?.name ?? 'Jazz Angels'},</span>
          <PaperRules widths={['full', 'full', 'mid']} />
          <span className="ja-paper__strong">
            {file.kind === 'agreement' ? 'Grant agreement' : 'Grant amount'}:{' '}
            {money(grant?.amountAwarded)}
          </span>
          <PaperRules widths={['full', 'full', 'full', 'short']} />
          <span style={{ marginTop: 'auto' }}>With warm regards,</span>
          <span className="ja-paper__sign">{funder?.contactName ?? funder?.name}</span>
          <PaperRules widths={['short']} />
        </>
      ) : (
        <>
          <span className="ja-paper__strong">
            {file.kind === 'agreement' ? 'Agreement' : 'Terms of the award'}, page {page}
          </span>
          {terms.length === 0 && (
            <PaperRules widths={['full', 'full', 'mid', 'full', 'full', 'short', 'full', 'mid']} />
          )}
          {terms.map(t => (
            <React.Fragment key={t.id}>
              <span className="ja-paper__strong" style={{ marginTop: '2cqw' }}>
                {t.label}
              </span>
              <span>{t.text}</span>
            </React.Fragment>
          ))}
        </>
      );
  } else if (expense) {
    const title =
      file.kind === 'timesheet'
        ? 'Timesheet'
        : file.kind === 'invoice'
          ? 'Invoice'
          : file.kind === 'receipt'
            ? 'Receipt'
            : 'Backup';
    sheet = (
      <>
        <div className="ja-paper__head">
          <span className="ja-paper__mark">
            {!photo && <i />}
            {expense.payee}
          </span>
          {!photo && (
            <span className="ja-paper__strong" style={{ color: 'var(--blue-600)' }}>
              {title.toUpperCase()}
            </span>
          )}
        </div>
        <span className="ja-paper__mono">{dateLong(expense.date)}</span>
        {page === 1 ? (
          <>
            <PaperRules widths={photo ? ['mid'] : ['short', 'mid']} />
            <div className="ja-paper__row">
              <span>{expense.note ?? title}</span>
              <span className="ja-paper__mono">{money(expense.amount)}</span>
            </div>
            <PaperRules widths={photo ? ['full', 'short'] : ['full', 'mid', 'full', 'short']} />
            <div className="ja-paper__row ja-paper__total">
              <span>Total</span>
              <span className="ja-paper__mono">{money(expense.amount)}</span>
            </div>
          </>
        ) : (
          <PaperRules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'full', 'mid']} />
        )}
      </>
    );
  } else {
    sheet = (
      <>
        <span className="ja-paper__strong">{file.name}</span>
        <PaperRules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'mid']} />
      </>
    );
  }

  return (
    <div className={'ja-paper' + (photo ? ' ja-paper--photo' : '')} style={style}>
      <div className="ja-paper__sheet">{sheet}</div>
      <span className="ja-paper__format" data-format={file.format}>
        {file.format}
      </span>
    </div>
  );
}

/** "Uploaded by Denise Moreno on May 26, 2026" */
export function useUploadedLine(file: GrantFile, verb = 'Uploaded'): string {
  return useAddedLine(file.uploadedById, file.uploadedAt, verb);
}

// ---------------------------------------------------------------------------
// Open and download
// ---------------------------------------------------------------------------

/** Save a stored file: itself when added this session, else a note of what the portal holds. */
export function downloadFile(file: GrantFile) {
  downloadStoredFile(file.id, file, file.uploadedAt);
}

/** The file, a page at a time, with what the portal knows about it alongside. */
export function FileViewerDialog({
  file,
  startPage = 1,
  onClose,
}: {
  file: GrantFile;
  startPage?: number;
  onClose: () => void;
}) {
  const uploaded = useUploadedLine(file);
  return (
    <StoredFileDialog
      id={file.id}
      file={file}
      kindLabel={FILE_KIND_LABEL[file.kind]}
      addedLine={uploaded}
      storedOn={file.uploadedAt}
      paper={page => <FilePaper file={file} page={page} />}
      startPage={startPage}
      onClose={onClose}
    />
  );
}
