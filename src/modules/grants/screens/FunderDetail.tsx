import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../../app/Shell';
import { useToast } from '../../../app/ToastHost';
import { PhaseBadge } from './badges';
import { KV } from '../../../app/components/badges';
import {
  ArchiveButton,
  ArchiveDialog,
  ArchivedName,
  ArchivedNotice,
} from '../../../app/components/archive';
import { FunderFields, capitalise, type FunderDraft } from './Funders';
import { TableScroll } from '../../../app/components/TableScroll';
import { Card, DataTable, Button, Icon, Dialog, EmptyState } from '../../../design-system';
import { isArchived, useStore, useCan, money } from '../../../core';
import { funderById, funderTotals, grantsByFunder } from '../domain';
import type { Grant } from '../domain';

export default function FunderDetail() {
  const { id = '' } = useParams();
  const { state, actions } = useStore();
  const mayEdit = useCan()('grants', 'edit');
  const nav = useNavigate();
  const toast = useToast();

  const funder = funderById(state, id);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<FunderDraft | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  usePageHeader({
    title: funder ? funder.name : 'Funder not found',
    subtitle: funder
      ? [capitalise(funder.type), funder.contactName].filter(Boolean).join(' · ')
      : undefined,
    crumbs: [{ label: 'Funders', href: '/funders' }, { label: funder ? funder.name : 'Not found' }],
    actions:
      funder && mayEdit ? (
        <div className="ja-actions">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name="pencil" size={15} />}
            onClick={() => {
              const { id: _id, archivedAt: _at, archivedById: _by, ...rest } = funder;
              setDraft(rest);
              setShowErrors(false);
              setEditing(true);
            }}
          >
            Edit funder
          </Button>
          {!isArchived(funder) && <ArchiveButton onClick={() => setArchiving(true)} />}
        </div>
      ) : undefined,
  });

  if (!funder) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="building-2" size={22} />}
          title="This funder doesn't exist"
          message="The link may be out of date, or the funder was never added. Every funder we track is on the Funders list."
          action={
            <Button variant="primary" size="sm" onClick={() => nav('/funders')}>
              Back to funders
            </Button>
          }
        />
      </Card>
    );
  }

  const grants = grantsByFunder(state, funder.id);
  const totals = funderTotals(state, funder.id);

  function save() {
    if (!draft || !draft.name.trim()) {
      setShowErrors(true);
      return;
    }
    actions.grants.updateFunder(id, { ...draft, name: draft.name.trim() });
    toast({ tone: 'success', title: 'Funder updated', message: draft.name.trim() });
    setEditing(false);
  }

  return (
    <>
      <ArchivedNotice
        record={funder}
        detail="It is off the Funders list and the Add grant picker. Its grants are as they were."
        style={{ marginBottom: 'var(--space-4)' }}
        onRestore={
          mayEdit
            ? () => {
                actions.grants.restoreFunder(funder.id);
                toast({
                  tone: 'success',
                  title: 'Funder restored',
                  message: `${funder.name} is back on the Funders list.`,
                });
              }
            : undefined
        }
      />
      <div className="ja-split ja-split--aside-left">
        <Card title="Contact">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <KV k="Type" v={capitalise(funder.type)} />
            <KV k="Contact" v={funder.contactName || '—'} />
            <KV
              k="Email"
              v={
                funder.contactEmail ? (
                  <a href={`mailto:${funder.contactEmail}`}>{funder.contactEmail}</a>
                ) : (
                  '—'
                )
              }
            />
            <KV k="Phone" v={funder.contactPhone || '—'} />
            <KV
              k="Website"
              v={
                funder.website ? (
                  <a href={href(funder.website)} target="_blank" rel="noreferrer">
                    {funder.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <KV k="Cycle notes" v={funder.cycleNotes || '—'} />
            <KV k="Notes" v={funder.notes || '—'} />
          </div>
        </Card>

        <Card title="Grant history" padding="0">
          {grants.length === 0 ? (
            <EmptyState
              icon={<Icon name="landmark" size={22} />}
              title="No grants with this funder yet"
              message={
                mayEdit
                  ? `Every grant we ask ${funder.name} for shows up here, with its phase and what was awarded. Add a grant and choose this funder.`
                  : `Every grant we ask ${funder.name} for shows up here, with its phase and what was awarded.`
              }
              action={
                mayEdit && (
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Icon name="plus" size={15} />}
                    onClick={() => nav('/grants?add=1')}
                  >
                    Add grant
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div
                style={{
                  padding: 'var(--space-4) var(--space-5)',
                  borderBottom: 'var(--border-width) solid var(--border-subtle)',
                  font: 'var(--type-body-sm)',
                  color: 'var(--text-muted)',
                }}
              >
                {totals.grants} {totals.grants === 1 ? 'grant' : 'grants'} ·{' '}
                {money(totals.requested)} requested · {money(totals.awarded)} awarded
              </div>
              <TableScroll minWidth={640}>
                <DataTable
                  rows={grants.map(g => ({ id: g.id, grant: g }))}
                  onRowClick={(r: { id: string }) => nav(`/grants/${r.id}`)}
                  columns={[
                    {
                      key: 'title',
                      label: 'Grant',
                      width: '2fr',
                      strong: true,
                      wrap: true,
                      render: (r: { grant: Grant }) => (
                        <ArchivedName name={r.grant.title} record={r.grant} />
                      ),
                    },
                    {
                      key: 'year',
                      label: 'Year',
                      width: '70px',
                      mono: true,
                      render: (r: { grant: Grant }) =>
                        (r.grant.dates.applicationDue ?? r.grant.createdAt).slice(0, 4),
                    },
                    {
                      key: 'phase',
                      label: 'Phase',
                      width: '120px',
                      render: (r: { grant: Grant }) => <PhaseBadge phase={r.grant.phase} />,
                    },
                    {
                      key: 'requested',
                      label: 'Requested',
                      width: '110px',
                      align: 'right',
                      mono: true,
                      render: (r: { grant: Grant }) =>
                        r.grant.amountRequested ? money(r.grant.amountRequested) : <Dash />,
                    },
                    {
                      key: 'awarded',
                      label: 'Awarded',
                      width: '110px',
                      align: 'right',
                      mono: true,
                      render: (r: { grant: Grant }) =>
                        r.grant.amountAwarded ? money(r.grant.amountAwarded) : <Dash />,
                    },
                  ]}
                />
              </TableScroll>
            </>
          )}
        </Card>
      </div>

      {archiving && mayEdit && (
        <ArchiveDialog
          title="Archive this funder?"
          message="It leaves the Funders list and the Add grant picker. Its grants are not archived, and its grant history stays here. You can restore it."
          onConfirm={() => {
            actions.grants.archiveFunder(funder.id);
            toast({
              tone: 'success',
              title: 'Funder archived',
              message: `${funder.name} is off the Funders list. Restore it from this page.`,
            });
          }}
          onClose={() => setArchiving(false)}
        />
      )}
      {editing && draft && mayEdit && (
        <Dialog
          open
          width={560}
          title="Edit funder"
          description="Keep the contact and cycle notes current so the next application is easier."
          onClose={() => setEditing(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save}>
                Save changes
              </Button>
            </>
          }
        >
          <FunderFields
            draft={draft}
            showErrors={showErrors}
            onChange={patch => setDraft(d => (d ? { ...d, ...patch } : d))}
          />
        </Dialog>
      )}
    </>
  );
}

function href(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function Dash() {
  return <span style={{ color: 'var(--text-faint)' }}>—</span>;
}
