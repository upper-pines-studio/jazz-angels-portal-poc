import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import { useToast } from '../../ToastHost';
import { TableScroll } from '../../components/TableScroll';
import { KV } from '../../components/badges';
import { PanelSection, SidePanel, WithPanel } from '../../components/SidePanel';
import {
  ArchiveDialog,
  ArchivedName,
  ArchivedNotice,
  ShowArchivedSwitch,
} from '../../components/archive';
import {
  PlainPaper,
  StoredFileDialog,
  downloadStoredFile,
  fileFacts,
  rememberFile,
  useAddedLine,
} from '../../components/files';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
} from '../../../design-system';
import {
  archivedOnly,
  currentVersion,
  dateLong,
  isArchived,
  officeDocumentById,
  officeDocumentKindLabel,
  officeDocumentStatus,
  officeDocumentsList,
  useCan,
  useStore,
  versionStatus,
  versionsNewestFirst,
} from '../../../core';
import type { OfficeDocument, OfficeDocumentVersion } from '../../../core';
import { AddDocumentDialog, AddVersionDialog, EditDocumentDialog } from './DocumentDialogs';
import { STATUS_LABEL, STATUS_TONE, earlierExpiryLine, expiryLine } from './status';

/**
 * Office › Documents: the papers every funder asks for (the IRS determination
 * letter, the audit, the board list, the insurance certificate, the W-9, the
 * organization budget), kept once for the office with their versions and
 * expiry (decision 0005). The list shows each document's current version and
 * status; a row opens the document in a docked panel (`/documents/:id`) with
 * its versions, newest first. Show archived is local state, as on Partners.
 *
 * Who does what (decision 0001, "Office documents"): Admin, Director, Office
 * manager and Bookkeeper add documents and versions, edit, archive and
 * restore; Office assistant and Read-only open and download them; a Teacher
 * does not see the page. A core screen, since the documents are the office's,
 * not the grants module's.
 */
export default function Documents() {
  const { state, today, actions } = useStore();
  const mayEdit = useCan()('office-documents', 'edit');
  const nav = useNavigate();
  const toast = useToast();
  const { id } = useParams();
  const [showArchived, setShowArchived] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addingVersion, setAddingVersion] = React.useState<OfficeDocument | null>(null);
  const [editing, setEditing] = React.useState<OfficeDocument | null>(null);
  const [archiving, setArchiving] = React.useState<OfficeDocument | null>(null);
  const [viewing, setViewing] = React.useState<OfficeDocumentVersion | null>(null);
  // A new document's first version gets its id in the store; its bytes are
  // kept for this session once the document is there.
  const [pending, setPending] = React.useState<{ id: string; file: File } | null>(null);

  const all = state.core.officeDocuments;
  const rows = officeDocumentsList(state, showArchived);
  const current = officeDocumentsList(state);
  const expiring = current.filter(d => officeDocumentStatus(d, today) !== 'current').length;
  // An archived document still opens from a link: it is history.
  const open = officeDocumentById(state, id);

  React.useEffect(() => {
    if (!pending) return;
    const added = officeDocumentById(state, pending.id);
    const first = added && currentVersion(added);
    if (first) {
      rememberFile(first.id, pending.file);
      setPending(null);
    }
  }, [pending, state]);

  usePageHeader({
    title: 'Documents',
    subtitle:
      current.length === 0
        ? all.length > 0
          ? 'No current documents'
          : 'No documents yet'
        : [
            `${current.length} ${current.length === 1 ? 'document' : 'documents'}`,
            expiring > 0 ? `${expiring} to renew` : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
    actions: mayEdit ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setAdding(true)}
      >
        Add document
      </Button>
    ) : undefined,
  });

  const close = () => nav('/documents');

  const panel = open && (
    <DocumentPanel
      key={open.id}
      document={open}
      mayEdit={mayEdit}
      onClose={close}
      onOpenVersion={setViewing}
      onAddVersion={() => setAddingVersion(open)}
      onEdit={() => setEditing(open)}
      onArchive={() => setArchiving(open)}
      onRestore={() => {
        actions.core.restoreOfficeDocument(open.id);
        toast({
          tone: 'success',
          title: 'Document restored',
          message: `${open.name} is back on the list.`,
        });
      }}
    />
  );

  return (
    <WithPanel panel={panel}>
      <Card
        title="The organization's documents"
        subtitle="The papers every funder asks for, kept once. When one is renewed, add the new version; the older ones stay."
        padding="0"
        action={
          <ShowArchivedSwitch
            count={archivedOnly(all).length}
            checked={showArchived}
            onChange={setShowArchived}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="file-text" size={22} />}
            title={all.length > 0 ? 'Every document is archived' : 'No documents yet'}
            message={
              all.length > 0
                ? 'Show archived lists them, and each one can be restored from its panel.'
                : mayEdit
                  ? 'The IRS determination letter, the latest audit or financials, the board list, the insurance certificate, the W-9 and the organization budget show up here, each with its current version and when it expires. Add the first one.'
                  : 'The IRS determination letter, the latest audit or financials, the board list, the insurance certificate, the W-9 and the organization budget show up here once someone adds them.'
            }
            action={
              mayEdit &&
              all.length === 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() => setAdding(true)}
                >
                  Add document
                </Button>
              )
            }
          />
        ) : (
          <TableScroll minWidth={open ? 480 : 760}>
            <DataTable
              rows={rows}
              onRowClick={(row: OfficeDocument) => nav(`/documents/${row.id}`)}
              // With a document open beside the list, the list keeps what tells
              // documents apart: the name, the expiry and the status.
              columns={[
                {
                  key: 'name',
                  label: 'Document',
                  strong: true,
                  width: '1.5fr',
                  render: (row: OfficeDocument) => <ArchivedName name={row.name} record={row} />,
                },
                ...(open ? [] : wideColumns),
                {
                  key: 'expires',
                  label: 'Expires',
                  width: '110px',
                  mono: true,
                  render: (row: OfficeDocument) => {
                    const v = currentVersion(row);
                    return v?.expires ? (
                      dateLong(v.expires)
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>Never</span>
                    );
                  },
                },
                {
                  key: 'status',
                  label: 'Status',
                  width: '130px',
                  render: (row: OfficeDocument) => {
                    const status = officeDocumentStatus(row, today);
                    return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
                  },
                },
              ]}
            />
          </TableScroll>
        )}
      </Card>

      {/* Outside the panel, so the viewer covers the page and not just the panel. */}
      {viewing && open && (
        <VersionViewer
          documentName={open.name}
          kindLabel={officeDocumentKindLabel(open.kind)}
          version={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      {adding && mayEdit && (
        <AddDocumentDialog
          onClose={() => setAdding(false)}
          onAdded={(docId, file) => {
            setPending({ id: docId, file });
            nav(`/documents/${docId}`);
          }}
        />
      )}
      {addingVersion && mayEdit && (
        <AddVersionDialog
          document={addingVersion}
          onClose={() => setAddingVersion(null)}
          onAdded={(versionId, file) => rememberFile(versionId, file)}
        />
      )}
      {editing && mayEdit && (
        <EditDocumentDialog document={editing} onClose={() => setEditing(null)} />
      )}
      {archiving && mayEdit && (
        <ArchiveDialog
          title={`Archive ${archiving.name}?`}
          message="It leaves the list and the dashboard. Its versions stay, and you can restore it."
          onConfirm={() => {
            actions.core.archiveOfficeDocument(archiving.id);
            toast({
              tone: 'success',
              title: 'Document archived',
              message: `${archiving.name} is off the list. Restore it from Show archived.`,
            });
            if (!showArchived) close();
          }}
          onClose={() => setArchiving(null)}
        />
      )}
    </WithPanel>
  );
}

/** One document: its status, its current version, the earlier ones, and what may be done. */
function DocumentPanel({
  document,
  mayEdit,
  onClose,
  onOpenVersion,
  onAddVersion,
  onEdit,
  onArchive,
  onRestore,
}: {
  document: OfficeDocument;
  mayEdit: boolean;
  onClose: () => void;
  onOpenVersion: (version: OfficeDocumentVersion) => void;
  onAddVersion: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const { today } = useStore();
  const [current, ...earlier] = versionsNewestFirst(document);
  const status = officeDocumentStatus(document, today);
  const archived = isArchived(document);

  return (
    <SidePanel
      eyebrow={officeDocumentKindLabel(document.kind)}
      title={document.name}
      subtitle={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          {expiryLine(current, today)}
        </span>
      }
      onClose={onClose}
      footer={
        mayEdit && !archived ? (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name="archive" size={15} />}
              onClick={onArchive}
            >
              Archive
            </Button>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Icon name="plus" size={15} />}
              onClick={onAddVersion}
            >
              Add version
            </Button>
          </>
        ) : undefined
      }
    >
      {archived && (
        <PanelSection>
          <ArchivedNotice
            record={document}
            detail="It is off the list and the dashboard. Its versions are kept."
            onRestore={mayEdit ? onRestore : undefined}
          />
        </PanelSection>
      )}

      <PanelSection title="Current version">
        {current ? (
          <VersionRow
            documentName={document.name}
            version={current}
            large
            onOpen={() => onOpenVersion(current)}
          />
        ) : (
          <p style={MUTED}>No version yet.</p>
        )}
      </PanelSection>

      <PanelSection title="Earlier versions">
        {earlier.length === 0 ? (
          <p style={MUTED}>
            None yet. When you add a new version, the one before it stays here, read-only.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {earlier.map(v => (
              <VersionRow
                key={v.id}
                documentName={document.name}
                version={v}
                onOpen={() => onOpenVersion(v)}
              />
            ))}
          </div>
        )}
      </PanelSection>
    </SidePanel>
  );
}

const MUTED: React.CSSProperties = {
  margin: 0,
  font: 'var(--type-body-sm)',
  color: 'var(--text-muted)',
};

/** A version: its drawn page, its file, who added it and when, its expiry, Open and Download. */
function VersionRow({
  documentName,
  version,
  large = false,
  onOpen,
}: {
  documentName: string;
  version: OfficeDocumentVersion;
  large?: boolean;
  onOpen: () => void;
}) {
  const { today } = useStore();
  const added = useAddedLine(version.addedById, version.addedAt, 'Added');
  const status = versionStatus(version, today);
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${version.name}`}
        style={{
          flex: '0 0 auto',
          width: large ? 96 : 56,
          padding: 0,
          border: 0,
          background: 'none',
          cursor: 'pointer',
        }}
      >
        <PlainPaper id={version.id} file={version} title={documentName} />
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-sans)',
            color: 'var(--text-strong)',
            overflowWrap: 'anywhere',
          }}
        >
          {version.name}
        </div>
        <div style={{ ...MUTED, fontSize: 'var(--text-xs)' }}>{fileFacts(version)}</div>
        <div style={{ ...MUTED, fontSize: 'var(--text-xs)' }}>{added}</div>
        <div
          style={{
            ...MUTED,
            fontSize: 'var(--text-xs)',
            color: large && status !== 'current' ? 'var(--text-strong)' : 'var(--text-muted)',
          }}
        >
          {large ? expiryLine(version, today) : earlierExpiryLine(version)}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            Open
          </Button>
          <IconButton
            label={`Download ${version.name}`}
            variant="ghost"
            size="sm"
            onClick={() => downloadStoredFile(version.id, version, version.addedAt)}
          >
            <Icon name="download" size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function VersionViewer({
  documentName,
  kindLabel,
  version,
  onClose,
}: {
  documentName: string;
  kindLabel: string;
  version: OfficeDocumentVersion;
  onClose: () => void;
}) {
  const added = useAddedLine(version.addedById, version.addedAt, 'Added');
  return (
    <StoredFileDialog
      id={version.id}
      file={version}
      kindLabel={kindLabel}
      addedLine={added}
      storedOn={version.addedAt}
      details={<KV k="Expires" v={version.expires ? dateLong(version.expires) : 'Never'} />}
      paper={page => <PlainPaper id={version.id} file={version} title={documentName} page={page} />}
      onClose={onClose}
    />
  );
}

/** The columns the list drops while a document is open beside it. */
const wideColumns = [
  {
    key: 'kind',
    label: 'Kind',
    width: '1.2fr',
    render: (row: OfficeDocument) => officeDocumentKindLabel(row.kind),
  },
  {
    key: 'version',
    label: 'Current version',
    width: '1.8fr',
    render: (row: OfficeDocument) => currentVersion(row)?.name ?? <Dash />,
  },
  {
    key: 'added',
    label: 'Added',
    width: '110px',
    mono: true,
    render: (row: OfficeDocument) => dateLong(currentVersion(row)?.addedAt),
  },
];

function Dash() {
  return <span style={{ color: 'var(--text-faint)' }}>—</span>;
}
