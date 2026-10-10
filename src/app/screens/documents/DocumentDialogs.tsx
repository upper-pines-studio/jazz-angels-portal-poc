import React from 'react';
import { Button, Dialog, Field, Icon, Input, Select } from '../../../design-system';
import { useToast } from '../../ToastHost';
import { countPdfPages, describeFile, fileFacts, FileDrop } from '../../components/files';
import {
  OFFICE_DOCUMENT_KINDS,
  officeDocumentKindLabel,
  newOfficeDocumentProblem,
  officeDocumentProblem,
  officeDocumentVersionProblem,
  useStore,
} from '../../../core';
import type { FileFacts, OfficeDocument, OfficeDocumentKind } from '../../../core';

/**
 * The dialogs of Office › Documents: Add document (the document and its first
 * version), Add version, and Edit document (its name and kind). Each checks
 * its draft with the same problem functions the store's rules use, so the
 * button is off for exactly what the store would refuse.
 */

const COLUMN: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const KIND_OPTIONS = OFFICE_DOCUMENT_KINDS.map(k => ({ value: k.value, label: k.label }));

/** A picked file, its facts, and its bytes to keep for this session. */
export interface PickedFile {
  file: File;
  facts: FileFacts;
}

/**
 * The file and the expiry, the two things every version has. Picking a file
 * checks it (`describeFile`) and, for a PDF, counts its pages.
 */
function VersionFields({
  picked,
  onPick,
  expires,
  onExpires,
}: {
  picked: PickedFile | null;
  onPick: (picked: PickedFile | null) => void;
  expires: string;
  onExpires: (iso: string) => void;
}) {
  const [error, setError] = React.useState<string>();
  // The page count arrives later; it belongs only to the file still picked.
  const latest = React.useRef<File | null>(null);

  function take(files: File[]) {
    const file = files[0];
    if (!file) return;
    latest.current = file;
    const described = describeFile(file);
    if ('error' in described) {
      setError(described.error);
      return;
    }
    setError(undefined);
    const facts: FileFacts = { ...described, pages: described.format === 'pdf' ? undefined : 1 };
    onPick({ file, facts });
    if (described.format === 'pdf') {
      void countPdfPages(file).then(pages => {
        if (pages && latest.current === file) onPick({ file, facts: { ...facts, pages } });
      });
    }
  }

  return (
    <>
      <Field label="File" required error={error}>
        {picked ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              border: 'var(--border-width) solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)',
            }}
          >
            <Icon name="file-text" size={18} color="var(--text-muted)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-sans)',
                  color: 'var(--text-strong)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {picked.facts.name}
              </div>
              <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
                {fileFacts(picked.facts)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
              Choose another
            </Button>
          </div>
        ) : (
          <FileDrop multiple={false} onFiles={take} hint="PDF, JPG, PNG or HEIC, up to 20 MB" />
        )}
      </Field>
      <Field label="Expires" hint="Leave it blank if this version never expires.">
        <Input type="date" value={expires} onChange={e => onExpires(e.target.value)} />
      </Field>
    </>
  );
}

/** Add document: what it is, its name, and its first version. */
export function AddDocumentDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  /** The new document's id, and the file whose bytes to keep for this session. */
  onAdded: (id: string, file: File) => void;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const [kind, setKind] = React.useState<OfficeDocumentKind>('irs-letter');
  // The name follows the kind until someone types their own.
  const [name, setName] = React.useState<string>();
  const [picked, setPicked] = React.useState<PickedFile | null>(null);
  const [expires, setExpires] = React.useState('');
  const shownName = name ?? (kind === 'other' ? '' : officeDocumentKindLabel(kind));

  const input = picked && { kind, name: shownName, file: picked.facts, expires };
  const ready = !!input && !newOfficeDocumentProblem(input);

  function save() {
    if (!input || !picked || !ready) return;
    const id = actions.core.addOfficeDocument(input);
    if (!id) return;
    toast({ tone: 'success', title: 'Document added', message: input.name.trim() });
    onAdded(id, picked.file);
    onClose();
  }

  return (
    <Dialog
      open
      width={520}
      title="Add document"
      description="One of the papers funders ask for, kept once for the whole office. Its file becomes the first version."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={save}>
            Add document
          </Button>
        </>
      }
    >
      <div style={COLUMN}>
        <Field label="Kind">
          <Select
            value={kind}
            options={KIND_OPTIONS}
            onChange={e => setKind(e.target.value as OfficeDocumentKind)}
          />
        </Field>
        <Field label="Name" required>
          <Input value={shownName} onChange={e => setName(e.target.value)} />
        </Field>
        <VersionFields
          picked={picked}
          onPick={setPicked}
          expires={expires}
          onExpires={setExpires}
        />
      </div>
    </Dialog>
  );
}

/** Add version: a new file, which becomes the current one; the one before stays. */
export function AddVersionDialog({
  document,
  onClose,
  onAdded,
}: {
  document: OfficeDocument;
  onClose: () => void;
  /** The new version's id, and the file whose bytes to keep for this session. */
  onAdded: (versionId: string, file: File) => void;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const [picked, setPicked] = React.useState<PickedFile | null>(null);
  const [expires, setExpires] = React.useState('');

  const input = picked && { file: picked.facts, expires };
  const ready = !!input && !officeDocumentVersionProblem(input);

  function save() {
    if (!input || !picked || !ready) return;
    const versionId = actions.core.addOfficeDocumentVersion(document.id, input);
    if (!versionId) return;
    toast({
      tone: 'success',
      title: 'Version added',
      message: `${document.name} now shows the version added today.`,
    });
    onAdded(versionId, picked.file);
    onClose();
  }

  return (
    <Dialog
      open
      width={520}
      title="Add version"
      description={`A new ${document.name} becomes the current one. The version before it stays in the list, read-only.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={save}>
            Add version
          </Button>
        </>
      }
    >
      <div style={COLUMN}>
        <VersionFields
          picked={picked}
          onPick={setPicked}
          expires={expires}
          onExpires={setExpires}
        />
      </div>
    </Dialog>
  );
}

/** Edit document: its name and kind. Its versions stay as they are. */
export function EditDocumentDialog({
  document,
  onClose,
}: {
  document: OfficeDocument;
  onClose: () => void;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const [kind, setKind] = React.useState<OfficeDocumentKind>(document.kind);
  const [name, setName] = React.useState(document.name);
  const ready = !officeDocumentProblem({ name, kind });

  function save() {
    if (!ready) return;
    actions.core.updateOfficeDocument(document.id, { name, kind });
    toast({ tone: 'success', title: 'Document updated', message: name.trim() });
    onClose();
  }

  return (
    <Dialog
      open
      width={480}
      title="Edit document"
      description="Change its name or kind. Its versions stay as they are."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={save}>
            Save document
          </Button>
        </>
      }
    >
      <div style={COLUMN}>
        <Field label="Kind">
          <Select
            value={kind}
            options={KIND_OPTIONS}
            onChange={e => setKind(e.target.value as OfficeDocumentKind)}
          />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
