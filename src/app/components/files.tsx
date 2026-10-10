import React from 'react';
import { Button, Dialog, Icon, IconButton } from '../../design-system';
import { dateLong, fileSize, staffById, useStore } from '../../core';
import type { FileFacts, FileFormat } from '../../core';
import { KV } from './badges';
import './files.css';

/**
 * Stored files, for any screen that keeps them: a grant's award letter and
 * receipts, an office document's versions. The portal keeps what describes a
 * file (core's `FileFacts`) in the store; the bytes of a file added in this
 * session are held in memory, so it opens and downloads until the page is
 * reloaded. A seeded file has no bytes, so the portal draws a page instead:
 * `PlainPaper` here, or a richer one a module draws from its own records
 * (the grants module's `FilePaper`).
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

function formatOf(file: File): FileFormat | undefined {
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
): { format: FileFormat; sizeKb: number; name: string } | { error: string } {
  const format = formatOf(file);
  if (!format) return { error: `${file.name} is not a PDF, JPG, PNG or HEIC.` };
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    return { error: `${file.name} is over ${MAX_FILE_MB} MB.` };
  return { format, sizeKb: Math.max(1, Math.round(file.size / 1024)), name: file.name };
}

/** Count the pages of a PDF by its page objects. Good enough for a POC; undefined when unsure. */
export async function countPdfPages(file: File): Promise<number | undefined> {
  try {
    const text = await file.text();
    const n = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    return n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** "PDF · 412 KB · 3 pages" */
export function fileFacts(file: FileFacts): string {
  return [
    file.format.toUpperCase(),
    fileSize(file.sizeKb),
    file.pages ? `${file.pages} ${file.pages === 1 ? 'page' : 'pages'}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Uploaded by Denise Moreno on May 26, 2026", naming them as they are now. */
export function useAddedLine(byId: string | undefined, on: string, verb = 'Uploaded'): string {
  const { state } = useStore();
  const who = staffById(state, byId)?.name ?? 'someone';
  return `${verb} by ${who} on ${dateLong(on)}`;
}

// ---------------------------------------------------------------------------
// The drawn page
// ---------------------------------------------------------------------------

/** Grey lines standing in for text on a drawn page. */
export function PaperRules({ widths }: { widths: Array<'full' | 'mid' | 'short'> }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className={'ja-paper__rule' + (w === 'full' ? '' : ` ja-paper__rule--${w}`)} />
      ))}
    </>
  );
}

/**
 * A small picture of a stored file that knows nothing about where it belongs:
 * the file itself when it is an image added in this session, else a page with
 * its title and lines of text.
 */
export function PlainPaper({
  id,
  file,
  title,
  page = 1,
  style,
}: {
  id: string;
  file: FileFacts;
  /** The heading drawn on the first page; the file name when unset. */
  title?: string;
  page?: number;
  style?: React.CSSProperties;
}) {
  const url = fileUrl(id);
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
  return (
    <div className="ja-paper" style={style}>
      <div className="ja-paper__sheet">
        {page === 1 ? (
          <>
            <div className="ja-paper__head">
              <span className="ja-paper__mark">
                <i />
                Jazz Angels
              </span>
            </div>
            <span className="ja-paper__strong">{title ?? file.name}</span>
            <PaperRules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'mid']} />
          </>
        ) : (
          <PaperRules widths={['full', 'full', 'mid', 'full', 'short', 'full', 'full', 'mid']} />
        )}
      </div>
      <span className="ja-paper__format" data-format={file.format}>
        {file.format}
      </span>
    </div>
  );
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

/** Hand the browser a file to save. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a stored file. A file added in this session downloads as itself; a
 * seeded one has no bytes, so what downloads is a plain-text note of what the
 * portal holds about it.
 */
export function downloadStoredFile(id: string, file: FileFacts, storedOn: string) {
  const url = fileUrl(id);
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
      `Stored ${dateLong(storedOn)}`,
      '',
      'This is a demo file. The portal holds its details, not its contents.',
    ].join('\n'),
    'text/plain;charset=utf-8',
  );
}

/**
 * The file, a page at a time, with what the portal knows about it alongside.
 * `paper` draws one page of a file with no bytes; `PlainPaper` when unset.
 */
export function StoredFileDialog({
  id,
  file,
  kindLabel,
  addedLine,
  storedOn,
  details,
  paper,
  startPage = 1,
  onClose,
}: {
  id: string;
  file: FileFacts;
  /** "Award letter", "Insurance certificate". */
  kindLabel: string;
  /** "Uploaded by Denise Moreno on May 26, 2026", from `useAddedLine`. */
  addedLine: string;
  /** The day it was stored, for the note a seeded file downloads as. */
  storedOn: string;
  /** More rows under Kind, Format, Size and Pages: an expiry. */
  details?: React.ReactNode;
  paper?: (page: number) => React.ReactNode;
  startPage?: number;
  onClose: () => void;
}) {
  const [page, setPage] = React.useState(Math.min(startPage, file.pages ?? 1));
  const url = fileUrl(id);
  const pages = file.pages ?? 1;

  return (
    <Dialog
      open
      title={file.name}
      description={`${kindLabel} · ${fileFacts(file)}`}
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
            onClick={() => downloadStoredFile(id, file, storedOn)}
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
          ) : paper ? (
            paper(page)
          ) : (
            <PlainPaper id={id} file={file} page={page} />
          )}
          {!url && pages > 1 && <PageTurner page={page} pages={pages} onChange={setPage} />}
        </div>
        <div>
          <KV k="Kind" v={kindLabel} />
          <KV k="Format" v={file.format.toUpperCase()} />
          <KV k="Size" v={fileSize(file.sizeKb)} />
          {file.pages && <KV k="Pages" v={file.pages} />}
          {details}
          <p
            style={{
              margin: 'var(--space-4) 0 0',
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {addedLine}.
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
