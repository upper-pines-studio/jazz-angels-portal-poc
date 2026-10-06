import React from 'react';
import { Button, Dialog, Icon, IconButton } from '../../../../design-system';
import { dateLong, money, staffById, useStore } from '../../../../core';
import { KV } from '../../../../app/components/badges';
import { fileSize, funderById, grantById } from '../../domain';
import type { GrantFile, GrantFileFormat, GrantFileKind } from '../../domain';
import { downloadText } from './shared';
import './files.css';

/**
 * Stored files. The portal keeps what describes a file in the store; the bytes
 * of a file added in this session are held in memory, so it opens and
 * downloads until the page is reloaded. A seeded file has no bytes, so the
 * portal draws a page from what it knows about the grant or the expense.
 */

// ---------------------------------------------------------------------------
// The bytes, for this session only
// ---------------------------------------------------------------------------

const BLOBS = new Map<string, { url: string; type: string }>();

/** Keep a picked file's bytes under the id the store gave it. */
export function rememberFile(id: string, file: File) {
  BLOBS.set(id, { url: URL.createObjectURL(file), type: file.type });
}

export function forgetFile(id: string) {
  const hit = BLOBS.get(id);
  if (hit) URL.revokeObjectURL(hit.url);
  BLOBS.delete(id);
}

/** The object URL of a file added in this session, or undefined for a seeded one. */
export function fileUrl(id: string): string | undefined {
  return BLOBS.get(id)?.url;
}

export const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*';
export const MAX_FILE_MB = 20;

export const FILE_KIND_LABEL: Record<GrantFileKind, string> = {
  'award-letter': 'Award letter',
  agreement: 'Signed agreement',
  receipt: 'Receipt',
  invoice: 'Invoice',
  timesheet: 'Timesheet',
  other: 'Backup',
};

function formatOf(file: File): GrantFileFormat | undefined {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'jpg' || ext === 'jpeg' || file.type === 'image/jpeg') return 'jpg';
  if (ext === 'png' || file.type === 'image/png') return 'png';
  if (ext === 'heic' || file.type === 'image/heic') return 'heic';
  return undefined;
}

/**
 * What the store needs to know about a picked file, or a plain sentence saying
 * why it cannot be taken.
 */
export function describeFile(
  file: File,
): { format: GrantFileFormat; sizeKb: number; name: string } | { error: string } {
  const format = formatOf(file);
  if (!format) return { error: `${file.name} is not a PDF, JPG, PNG or HEIC.` };
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    return { error: `${file.name} is over ${MAX_FILE_MB} MB.` };
  return { format, sizeKb: Math.max(1, Math.round(file.size / 1024)), name: file.name };
}

/** A receipt is a photo, anything else with pages is an invoice. A starting guess the office can change. */
export function guessKind(format: GrantFileFormat): GrantFileKind {
  return format === 'pdf' ? 'invoice' : 'receipt';
}

// ---------------------------------------------------------------------------
// The drawn page
// ---------------------------------------------------------------------------

function Rules({ widths }: { widths: Array<'full' | 'mid' | 'short'> }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className={'ja-paper__rule' + (w === 'full' ? '' : ` ja-paper__rule--${w}`)} />
      ))}
    </>
  );
}

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
          <Rules widths={['short', 'mid']} />
          <span>Dear {owner?.name ?? 'Jazz Angels'},</span>
          <Rules widths={['full', 'full', 'mid']} />
          <span className="ja-paper__strong">
            {file.kind === 'agreement' ? 'Grant agreement' : 'Grant amount'}:{' '}
            {money(grant?.amountAwarded)}
          </span>
          <Rules widths={['full', 'full', 'full', 'short']} />
          <span style={{ marginTop: 'auto' }}>With warm regards,</span>
          <span className="ja-paper__sign">{funder?.contactName ?? funder?.name}</span>
          <Rules widths={['short']} />
        </>
      ) : (
        <>
          <span className="ja-paper__strong">
            {file.kind === 'agreement' ? 'Agreement' : 'Terms of the award'}, page {page}
          </span>
          {terms.length === 0 && (
            <Rules widths={['full', 'full', 'mid', 'full', 'full', 'short', 'full', 'mid']} />
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
            <Rules widths={photo ? ['mid'] : ['short', 'mid']} />
            <div className="ja-paper__row">
              <span>{expense.note ?? title}</span>
              <span className="ja-paper__mono">{money(expense.amount)}</span>
            </div>
            <Rules widths={photo ? ['full', 'short'] : ['full', 'mid', 'full', 'short']} />
            <div className="ja-paper__row ja-paper__total">
              <span>Total</span>
              <span className="ja-paper__mono">{money(expense.amount)}</span>
            </div>
          </>
        ) : (
          <Rules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'full', 'mid']} />
        )}
      </>
    );
  } else {
    sheet = (
      <>
        <span className="ja-paper__strong">{file.name}</span>
        <Rules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'mid']} />
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

/** "PDF · 412 KB · 3 pages" */
export function fileFacts(file: GrantFile): string {
  return [
    file.format.toUpperCase(),
    fileSize(file.sizeKb),
    file.pages ? `${file.pages} ${file.pages === 1 ? 'page' : 'pages'}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Uploaded by Denise Moreno on May 26, 2026" */
export function useUploadedLine(file: GrantFile, verb = 'Uploaded'): string {
  const { state } = useStore();
  const who = staffById(state, file.uploadedById)?.name ?? 'someone';
  return `${verb} by ${who} on ${dateLong(file.uploadedAt)}`;
}

/** "Page 1 of 3", with the arrows either side. */
export function PageTurner({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        font: 'var(--weight-medium) var(--text-xs)/1 var(--font-mono)',
        color: 'var(--text-muted)',
      }}
    >
      <IconButton
        label="Previous page"
        size="sm"
        variant="ghost"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <Icon name="chevron-left" size={15} />
      </IconButton>
      <span>
        Page {page} of {pages}
      </span>
      <IconButton
        label="Next page"
        size="sm"
        variant="ghost"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        <Icon name="chevron-right" size={15} />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open and download
// ---------------------------------------------------------------------------

/**
 * Save a stored file. A file added in this session downloads as itself; a
 * seeded one has no bytes, so what downloads is a plain-text note of what the
 * portal holds about it.
 */
export function downloadFile(file: GrantFile) {
  const url = fileUrl(file.id);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  downloadText(
    `${file.name}.txt`,
    [
      file.name,
      fileFacts(file),
      `Stored ${dateLong(file.uploadedAt)}`,
      '',
      'This is a demo file. The portal holds its details, not its contents.',
    ].join('\n'),
    'text/plain;charset=utf-8',
  );
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
  const [page, setPage] = React.useState(Math.min(startPage, file.pages ?? 1));
  const uploaded = useUploadedLine(file);
  const url = fileUrl(file.id);
  const pages = file.pages ?? 1;

  return (
    <Dialog
      open
      title={file.name}
      description={`${FILE_KIND_LABEL[file.kind]} · ${fileFacts(file)}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            iconLeft={<Icon name="download" size={15} />}
            onClick={() => downloadFile(file)}
          >
            Download
          </Button>
        </>
      }
    >
      <div className="ja-file-viewer">
        <div className="ja-file-viewer__stage">
          {url && file.format === 'pdf' ? (
            <iframe
              title={file.name}
              src={url}
              style={{ width: '100%', height: 460, border: 0, background: 'var(--neutral-0)' }}
            />
          ) : (
            <FilePaper file={file} page={page} />
          )}
          {!url && pages > 1 && <PageTurner page={page} pages={pages} onChange={setPage} />}
        </div>
        <div>
          <KV k="Kind" v={FILE_KIND_LABEL[file.kind]} />
          <KV k="Format" v={file.format.toUpperCase()} />
          <KV k="Size" v={fileSize(file.sizeKb)} />
          {file.pages && <KV k="Pages" v={file.pages} />}
          <p
            style={{
              margin: 'var(--space-4) 0 0',
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {uploaded}.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Adding a file
// ---------------------------------------------------------------------------

/**
 * "Drop a file here or choose one". Calls `onFiles` with whatever was dropped
 * or picked; the caller checks each with `describeFile`, stores it, and keeps
 * the bytes with `rememberFile`.
 */
export function FileDrop({
  onFiles,
  multiple = true,
  title,
  hint,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  title?: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const input = React.useRef<HTMLInputElement | null>(null);
  const [over, setOver] = React.useState(false);

  const take = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <>
      <button
        type="button"
        className={'ja-file-drop' + (over ? ' is-over' : '')}
        onClick={() => input.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <span className="ja-file-drop__icon">
          <Icon name="upload" size={17} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-sans)',
              color: 'var(--text-strong)',
            }}
          >
            {title ?? (
              <>
                Drop a file here or <span style={{ color: 'var(--text-link)' }}>choose one</span>
              </>
            )}
          </span>
          <span
            style={{
              display: 'block',
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-muted)',
            }}
          >
            {hint ?? `PDF, JPG, PNG or HEIC, up to ${MAX_FILE_MB} MB each`}
          </span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={ACCEPTED_FILES}
        onChange={e => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
