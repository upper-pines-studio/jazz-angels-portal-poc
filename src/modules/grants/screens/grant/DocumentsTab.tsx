import React from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Field,
  Icon,
  Input,
  Select,
  EmptyState,
} from '../../../../design-system';
import { dateLong, dateShort, isArchived, useCan, useStore } from '../../../../core';
import type { OfficeDocument } from '../../../../core';
import { kindsMatch, linkedOfficeDocument, officeDocumentsFor } from '../../domain';
import type {
  DocumentKind,
  DocumentStatus,
  Grant,
  GrantDocument,
  LinkedOfficeDocument,
} from '../../domain';
import { OfficeDocumentStatusBadge } from '../../../../app/components/badges';
import { useToast } from '../../../../app/ToastHost';
import { AddButton, DialogFields, FooterBand, SectionBand } from './parts';
import { TableScroll } from '../../../../app/components/TableScroll';
import { StoredFiles } from './AwardStoredFiles';
import './award.css';

/**
 * Two lists: the files stored with the grant (award letter, agreement, anything
 * the funder sent), and the register of what each application still needs,
 * which links to where each document lives, or uses the organization's own
 * copy from Office › Documents (#68).
 */

const KIND_LABEL: Record<DocumentKind, string> = {
  narrative: 'Narrative',
  budget: 'Project budget',
  'irs-letter': 'IRS letter',
  'board-list': 'Board list',
  financials: 'Financials',
  'insurance-certificate': 'Insurance',
  w9: 'W-9',
  'organization-budget': 'Organization budget',
  'award-letter': 'Award letter',
  agreement: 'Agreement',
  report: 'Report',
  other: 'Other',
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  needed: 'Needed',
  drafting: 'Drafting',
  final: 'Final',
  submitted: 'Submitted',
};
const STATUS_TONE: Record<DocumentStatus, 'neutral' | 'blue' | 'teal'> = {
  needed: 'neutral',
  drafting: 'blue',
  final: 'teal',
  submitted: 'teal',
};

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as DocumentKind[]).map(k => ({
  value: k,
  label: KIND_LABEL[k],
}));
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as DocumentStatus[]).map(s => ({
  value: s,
  label: STATUS_LABEL[s],
}));

export function DocumentsTab({ grant }: { grant: Grant }) {
  const { state, actions, today } = useStore();
  const can = useCan();
  const mayEdit = can('grants', 'edit');
  const mayOpenOffice = can('office-documents', 'view');
  const toast = useToast();
  const [editing, setEditing] = React.useState<GrantDocument | null>(null);
  const [adding, setAdding] = React.useState(false);

  const rows = state.grants.documents.filter(d => d.grantId === grant.id);

  return (
    <div className="ja-docs">
      <p
        style={{
          margin: 0,
          padding: 'var(--space-4) var(--space-6)',
          font: 'var(--type-body-sm)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        Files kept with this grant are stored here, so anyone in the office can open them. The
        register below tracks what each application still needs, with a link to where each document
        lives or the organization's own copy from Office › Documents.
      </p>

      <StoredFiles grant={grant} />

      <SectionBand title="Application register" />

      {rows.length === 0 ? (
        <EmptyState
          style={{ padding: 'var(--space-6)' }}
          title="No documents listed yet"
          message={
            mayEdit
              ? 'The narrative, budget, IRS letter and the rest of what an application needs show up here, each with its status and a link to where it lives. Add the first document.'
              : 'The narrative, budget, IRS letter and the rest of what an application needs show up here, each with its status, once someone lists them.'
          }
          action={
            mayEdit && (
              <Button
                variant="secondary"
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
        <TableScroll minWidth={680}>
          <DataTable
            columns={[
              {
                key: 'name',
                label: 'Name',
                strong: true,
                wrap: true,
                width: '2.4fr',
                render: (r: GrantDocument) => {
                  const linked = linkedOfficeDocument(state, r, grant, today);
                  return (
                    <>
                      <span>{r.name}</span>
                      {linked && <OfficeCopyLine linked={linked} mayOpen={mayOpenOffice} />}
                    </>
                  );
                },
              },
              {
                key: 'kind',
                label: 'Kind',
                width: '150px',
                render: (r: GrantDocument) => <Badge tone="neutral">{KIND_LABEL[r.kind]}</Badge>,
              },
              {
                key: 'status',
                label: 'Status',
                width: '120px',
                render: (r: GrantDocument) => (
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                ),
              },
              {
                key: 'updatedAt',
                label: 'Updated',
                width: '90px',
                mono: true,
                render: (r: GrantDocument) => dateShort(r.updatedAt),
              },
              {
                key: 'url',
                label: '',
                width: '32px',
                render: (r: GrantDocument) =>
                  r.url && !linkedOfficeDocument(state, r, grant, today) ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the file"
                      onClick={e => e.stopPropagation()}
                      style={{ display: 'inline-flex', color: 'var(--text-muted)' }}
                    >
                      <Icon name="external-link" size={15} />
                    </a>
                  ) : null,
              },
            ]}
            rows={rows}
            onRowClick={mayEdit ? (r: GrantDocument) => setEditing(r) : undefined}
          />
        </TableScroll>
      )}

      {mayEdit && rows.length > 0 && (
        <FooterBand>
          <AddButton label="Add document" onClick={() => setAdding(true)} />
        </FooterBand>
      )}

      {adding && mayEdit && (
        <DocumentDialog
          title="Add document"
          grant={grant}
          onClose={() => setAdding(false)}
          onSave={values => {
            actions.grants.addDocument({ grantId: grant.id, ...values });
            toast({ tone: 'success', title: 'Document added', message: values.name });
            setAdding(false);
          }}
        />
      )}
      {editing && mayEdit && (
        <DocumentDialog
          title="Edit document"
          grant={grant}
          doc={editing}
          onClose={() => setEditing(null)}
          onDelete={() => {
            actions.grants.deleteDocument(editing.id);
            toast({ tone: 'info', title: 'Document removed', message: editing.name });
            setEditing(null);
          }}
          onSave={values => {
            actions.grants.updateDocument(editing.id, values);
            toast({ tone: 'success', title: 'Document saved', message: values.name });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Under a linked row's name: the organization's document (a link to it), the
 * version the row shows and any warning. Before the grant is submitted that is
 * the current version; after, the one current on the submitted date.
 */
function OfficeCopyLine({ linked, mayOpen }: { linked: LinkedOfficeDocument; mayOpen: boolean }) {
  const { document, version, submittedOn, isCurrent, warning, archived } = linked;
  let line = '';
  if (!submittedOn) line = version ? `Current version, added ${dateLong(version.addedAt)}` : '';
  else if (!version) line = `No version on file when it went in on ${dateLong(submittedOn)}`;
  else line = `Added ${dateLong(version.addedAt)} · went in on ${dateLong(submittedOn)}`;
  const small: React.CSSProperties = {
    font: 'var(--type-body-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-regular)' as any,
    color: 'var(--text-muted)',
  };
  return (
    <>
      <span
        style={{
          ...small,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-1) var(--space-2)',
          marginTop: 'var(--space-1)',
        }}
      >
        <Icon name="file-text" size={13} />
        {mayOpen ? (
          <Link
            to={`/documents/${document.id}`}
            title="Open it on Office › Documents"
            onClick={e => e.stopPropagation()}
          >
            {document.name}
          </Link>
        ) : (
          <span style={{ color: 'var(--text-body)' }}>{document.name}</span>
        )}
        {warning === 'out-of-date' && submittedOn ? (
          <Badge tone="danger">Out of date when submitted</Badge>
        ) : (
          warning && <OfficeDocumentStatusBadge status={warning} />
        )}
        {submittedOn && version && !isCurrent && <Badge tone="neutral">Older version</Badge>}
        {archived && <Badge tone="neutral">Archived</Badge>}
      </span>
      {line && <span style={{ ...small, display: 'block' }}>{line}</span>}
    </>
  );
}

interface DocValues {
  name: string;
  kind: DocumentKind;
  status: DocumentStatus;
  url?: string;
  /** Present on every save: undefined unlinks the row. */
  officeDocumentId: string | undefined;
}

function DocumentDialog({
  title,
  grant,
  doc,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  grant: Grant;
  doc?: GrantDocument;
  onClose: () => void;
  onSave: (values: DocValues) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = React.useState(doc?.name ?? '');
  const [kind, setKind] = React.useState<DocumentKind>(doc?.kind ?? 'other');
  const [status, setStatus] = React.useState<DocumentStatus>(doc?.status ?? 'needed');
  const [url, setUrl] = React.useState(doc?.url ?? '');
  const [officeId, setOfficeId] = React.useState(doc?.officeDocumentId ?? '');

  // What "Use the organization's" may point at: the office documents of this
  // kind (any, on Other), plus the one the row already uses if archived since.
  const { state } = useStore();
  const kept = officeId
    ? state.core.officeDocuments.find(d => d.id === officeId && kindsMatch(kind, d))
    : undefined;
  const choices: OfficeDocument[] = officeDocumentsFor(state, kind);
  if (kept && !choices.includes(kept)) choices.push(kept);
  const linked = kept?.id ?? '';

  const changeKind = (next: DocumentKind) => {
    setKind(next);
    const current = state.core.officeDocuments.find(d => d.id === officeId);
    if (current && !kindsMatch(next, current)) setOfficeId('');
  };

  return (
    <Dialog
      open
      title={title}
      description={
        linked
          ? "A row in the register. It uses the organization's copy from Office\u00a0›\u00a0Documents."
          : 'A row in the register. The file itself stays in the grant folder.'
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          {onDelete && (
            <Button
              variant="secondary"
              style={{ marginRight: 'auto', color: 'var(--danger-500)' }}
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                kind,
                status,
                url: url.trim() || undefined,
                officeDocumentId: linked || undefined,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <DialogFields>
        <Field label="Name" required>
          <Input
            value={name}
            placeholder="Project narrative"
            onChange={e => setName(e.target.value)}
          />
        </Field>
        <Field label="Kind">
          <Select
            value={kind}
            options={KIND_OPTIONS}
            onChange={e => changeKind(e.target.value as DocumentKind)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            options={STATUS_OPTIONS}
            onChange={e => setStatus(e.target.value as DocumentStatus)}
          />
        </Field>
        {linked ? (
          <Field
            label="Organization's copy"
            hint={
              grant.dates.submitted
                ? `Shows the version current when the grant was submitted on ${dateLong(grant.dates.submitted)}.`
                : 'Shows the current version, and keeps the one that went in once the grant is submitted.'
            }
          >
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Select
                  value={linked}
                  options={choices.map(d => ({
                    value: d.id,
                    label: isArchived(d) ? `${d.name} (archived)` : d.name,
                  }))}
                  onChange={e => setOfficeId(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOfficeId('')}>
                Use its own link
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <Field label="Link" hint="Paste the Drive or Dropbox link.">
              <Input value={url} placeholder="https://" onChange={e => setUrl(e.target.value)} />
            </Field>
            {choices.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: 'var(--border-width) solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-sunken)',
                  font: 'var(--type-body-sm)',
                  color: 'var(--text-body)',
                }}
              >
                <span>
                  {choices.length === 1
                    ? `Office\u00a0›\u00a0Documents keeps the organization's ${choices[0].name}, with its versions.`
                    : "Office\u00a0›\u00a0Documents keeps the organization's documents, with their versions."}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ flex: '0 0 auto' }}
                  onClick={() => setOfficeId(choices[0].id)}
                >
                  Use the organization's
                </Button>
              </div>
            )}
          </>
        )}
      </DialogFields>
    </Dialog>
  );
}
