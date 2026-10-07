import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import { TableScroll } from '../../components/TableScroll';
import { KV } from '../../components/badges';
import { Button, Card, DataTable, EmptyState, Icon } from '../../../design-system';
import {
  addressLine,
  organizationById,
  useCan,
  useStore,
  venuesForOrganization,
} from '../../../core';
import type { Venue } from '../../../core';
import {
  ORGANIZATION_KINDS,
  OrganizationDialog,
  VENUE_KINDS,
  VenueDialog,
  contactLine,
  kindLabel,
} from './dialogs';

/** One partner: who to call, what was agreed, and the venues that belong to it. */
export default function OrganizationDetail() {
  const { id = '' } = useParams();
  const { state } = useStore();
  const mayEdit = useCan()('partners', 'edit');
  const nav = useNavigate();
  const [editing, setEditing] = React.useState(false);
  const [addingVenue, setAddingVenue] = React.useState(false);

  const organization = organizationById(state, id);
  const venues = organization ? venuesForOrganization(state, organization.id) : [];

  usePageHeader({
    title: organization ? organization.name : 'Organization not found',
    subtitle: organization
      ? [kindLabel(ORGANIZATION_KINDS, organization.kind), organization.contactName]
          .filter(Boolean)
          .join(' · ')
      : undefined,
    crumbs: [
      { label: 'Partners', href: '/partners' },
      { label: organization ? organization.name : 'Not found' },
    ],
    actions:
      organization && mayEdit ? (
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="pencil" size={15} />}
          onClick={() => setEditing(true)}
        >
          Edit organization
        </Button>
      ) : undefined,
  });

  if (!organization) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="building-2" size={22} />}
          title="This organization doesn't exist"
          message="The link may be out of date, or the partner was never added. Every partner we work with is on the Partners list."
          action={
            <Button variant="primary" size="sm" onClick={() => nav('/partners')}>
              Back to partners
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <div className="ja-split ja-split--aside-left">
        <Card title="Contact">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <KV k="Kind" v={kindLabel(ORGANIZATION_KINDS, organization.kind)} />
            <KV k="Contact" v={organization.contactName || '—'} />
            <KV
              k="Email"
              v={
                organization.contactEmail ? (
                  <a href={`mailto:${organization.contactEmail}`}>{organization.contactEmail}</a>
                ) : (
                  '—'
                )
              }
            />
            <KV k="Phone" v={organization.contactPhone || '—'} />
            <KV
              k="Website"
              v={
                organization.website ? (
                  <a href={href(organization.website)} target="_blank" rel="noreferrer">
                    {organization.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <KV k="Notes" v={organization.notes || '—'} />
          </div>
        </Card>

        <Card
          title="Venues"
          subtitle={`${venues.length} ${venues.length === 1 ? 'place' : 'places'} under ${organization.name}`}
          padding="0"
        >
          {venues.length === 0 ? (
            <EmptyState
              icon={<Icon name="map-pin" size={22} />}
              title="No venues yet"
              message={
                mayEdit
                  ? `Each school or site where ${organization.name} hosts a class shows up here. Add a venue for each one.`
                  : `Each school or site where ${organization.name} hosts a class shows up here once someone adds it.`
              }
              action={
                mayEdit && (
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Icon name="plus" size={15} />}
                    onClick={() => setAddingVenue(true)}
                  >
                    Add venue
                  </Button>
                )
              }
            />
          ) : (
            <TableScroll minWidth={600}>
              <DataTable
                rows={venues}
                onRowClick={(row: Venue) => nav(`/partners/venues/${row.id}`)}
                columns={[
                  { key: 'name', label: 'Name', strong: true, width: '1.4fr' },
                  {
                    key: 'kind',
                    label: 'Kind',
                    width: '1fr',
                    render: (row: Venue) => kindLabel(VENUE_KINDS, row.kind),
                  },
                  {
                    key: 'address',
                    label: 'Address',
                    width: '1.6fr',
                    wrap: true,
                    render: (row: Venue) => addressLine(row.address) || '—',
                  },
                  {
                    key: 'contact',
                    label: 'On-site contact',
                    width: '1.4fr',
                    wrap: true,
                    render: (row: Venue) => contactLine(row) || '—',
                  },
                ]}
              />
            </TableScroll>
          )}
          {mayEdit && venues.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '0 var(--space-4)',
                background: 'var(--surface-sunken)',
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Icon name="plus" size={15} />}
                onClick={() => setAddingVenue(true)}
              >
                Add venue
              </Button>
            </div>
          )}
        </Card>
      </div>

      {editing && mayEdit && (
        <OrganizationDialog organization={organization} onClose={() => setEditing(false)} />
      )}
      {addingVenue && mayEdit && (
        <VenueDialog
          organizationId={organization.id}
          onClose={() => setAddingVenue(false)}
          onSaved={vid => nav(`/partners/venues/${vid}`)}
        />
      )}
    </>
  );
}

function href(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
