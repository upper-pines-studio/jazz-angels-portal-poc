import React from 'react';
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
import { dateShort, useCan, useStore } from '../../../../core';
import type { DocumentKind, DocumentStatus, Grant, GrantDocument } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { AddButton, DialogFields, FooterBand, SectionBand } from './parts';
import { TableScroll } from '../../../../app/components/TableScroll';
import { StoredFiles } from './AwardStoredFiles';
import './award.css';

/**
 * Two lists: the files stored with the grant (award letter, agreement, anything
 * the funder sent), and the register of what each application still needs,
 * which links to where each document lives.
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
  const { state, actions } = useStore();
  const mayEdit = useCan()('grants', 'edit');
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
        lives.
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
        <TableScroll minWidth={620}>
          <DataTable
            columns={[
              { key: 'name', label: 'Name', strong: true, width: '1.6fr' },
              {
                key: 'kind',
                label: 'Kind',
                width: '130px',
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
                  r.url ? (
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

interface DocValues {
  name: string;
  kind: DocumentKind;
  status: DocumentStatus;
  url?: string;
}

function DocumentDialog({
  title,
  doc,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  doc?: GrantDocument;
  onClose: () => void;
  onSave: (values: DocValues) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = React.useState(doc?.name ?? '');
  const [kind, setKind] = React.useState<DocumentKind>(doc?.kind ?? 'other');
  const [status, setStatus] = React.useState<DocumentStatus>(doc?.status ?? 'needed');
  const [url, setUrl] = React.useState(doc?.url ?? '');

  return (
    <Dialog
      open
      title={title}
      description="A row in the register. The file itself stays in the grant folder."
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
              onSave({ name: name.trim(), kind, status, url: url.trim() || undefined })
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
            onChange={e => setKind(e.target.value as DocumentKind)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            options={STATUS_OPTIONS}
            onChange={e => setStatus(e.target.value as DocumentStatus)}
          />
        </Field>
        <Field label="Link" hint="Paste the Drive or Dropbox link.">
          <Input value={url} placeholder="https://" onChange={e => setUrl(e.target.value)} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
