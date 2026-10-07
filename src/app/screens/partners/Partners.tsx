import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import { TableScroll } from '../../components/TableScroll';
import { ArchivedName, ShowArchivedSwitch } from '../../components/archive';
import { Button, Card, DataTable, EmptyState, Icon } from '../../../design-system';
import {
  activeOnly,
  addressLine,
  archivedOnly,
  organizationById,
  useCan,
  useStore,
  venuesForOrganization,
  withArchived,
} from '../../../core';
import type { Organization, Venue } from '../../../core';
import {
  ORGANIZATION_KINDS,
  OrganizationDialog,
  VENUE_KINDS,
  VenueDialog,
  contactLine,
  kindLabel,
} from './dialogs';

/**
 * Partners: the organizations Jazz Angels works with and the venues classes
 * meet at. A core screen, because ensembles and meetings point at venues by
 * id, so the list has to exist whichever modules are switched on.
 */
export default function Partners() {
  const { state } = useStore();
  const mayEdit = useCan()('partners', 'edit');
  const nav = useNavigate();
  const [adding, setAdding] = React.useState<'organization' | 'venue' | null>(null);
  // Show archived, one switch per list. Nothing else on this page is in the URL.
  const [showArchivedVenues, setShowArchivedVenues] = React.useState(false);
  const [showArchivedOrgs, setShowArchivedOrgs] = React.useState(false);

  const organizations = withArchived(state.core.organizations, showArchivedOrgs);
  // Venues under their organization, alphabetical within; the studio and other
  // unattached places first, since they are ours. Archived ones come last.
  const venues = withArchived(
    [...state.core.venues].sort((a, b) => {
      const oa = organizationById(state, a.organizationId)?.name ?? '';
      const ob = organizationById(state, b.organizationId)?.name ?? '';
      return oa.localeCompare(ob) || a.name.localeCompare(b.name);
    }),
    showArchivedVenues,
  );
  const currentOrgs = activeOnly(state.core.organizations).length;
  const currentVenues = activeOnly(state.core.venues).length;

  usePageHeader({
    title: 'Partners',
    subtitle:
      currentOrgs + currentVenues === 0
        ? 'No organizations or venues yet'
        : `${currentOrgs} ${currentOrgs === 1 ? 'organization' : 'organizations'} · ${currentVenues} ${currentVenues === 1 ? 'venue' : 'venues'}`,
    actions: mayEdit ? (
      <>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="plus" size={15} />}
          onClick={() => setAdding('organization')}
        >
          Add organization
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="plus" size={15} />}
          onClick={() => setAdding('venue')}
        >
          Add venue
        </Button>
      </>
    ) : undefined,
  });

  return (
    <>
      <Card
        title="Venues"
        subtitle="Where classes and performances happen: the studio, each school, a hall."
        padding="0"
        action={
          <ShowArchivedSwitch
            count={archivedOnly(state.core.venues).length}
            checked={showArchivedVenues}
            onChange={setShowArchivedVenues}
          />
        }
      >
        {venues.length === 0 ? (
          <EmptyState
            icon={<Icon name="map-pin" size={22} />}
            title="No venues yet"
            message={
              mayEdit
                ? 'The studio, each school and every hall where a class meets show up here. Add a venue for each one, so the schedule knows where to send people.'
                : 'The studio, each school and every hall where a class meets show up here once someone adds them.'
            }
            action={
              mayEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() => setAdding('venue')}
                >
                  Add venue
                </Button>
              )
            }
          />
        ) : (
          <TableScroll minWidth={720}>
            <DataTable
              rows={venues}
              onRowClick={(row: Venue) => nav(`/partners/venues/${row.id}`)}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  strong: true,
                  width: '1.4fr',
                  render: (row: Venue) => <ArchivedName name={row.name} record={row} />,
                },
                {
                  key: 'kind',
                  label: 'Kind',
                  width: '1fr',
                  render: (row: Venue) => kindLabel(VENUE_KINDS, row.kind),
                },
                {
                  key: 'organization',
                  label: 'Organization',
                  width: '1.4fr',
                  render: (row: Venue) =>
                    organizationById(state, row.organizationId)?.name ?? <Dash />,
                },
                {
                  key: 'address',
                  label: 'Address',
                  width: '1.6fr',
                  wrap: true,
                  render: (row: Venue) => addressLine(row.address) || <Dash />,
                },
                {
                  key: 'contact',
                  label: 'On-site contact',
                  width: '1.4fr',
                  wrap: true,
                  render: (row: Venue) => contactLine(row) || <Dash />,
                },
              ]}
            />
          </TableScroll>
        )}
      </Card>

      <Card
        title="Organizations"
        subtitle="The partners behind the venues: a district and its schools, a community centre."
        padding="0"
        action={
          <ShowArchivedSwitch
            count={archivedOnly(state.core.organizations).length}
            checked={showArchivedOrgs}
            onChange={setShowArchivedOrgs}
          />
        }
      >
        {organizations.length === 0 ? (
          <EmptyState
            icon={<Icon name="building-2" size={22} />}
            title="No organizations yet"
            message={
              mayEdit
                ? 'The districts, schools and community partners you work with show up here, with who to call at each. Add an organization, then add its venues.'
                : 'The districts, schools and community partners you work with show up here once someone adds them.'
            }
            action={
              mayEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() => setAdding('organization')}
                >
                  Add organization
                </Button>
              )
            }
          />
        ) : (
          <TableScroll minWidth={640}>
            <DataTable
              rows={organizations}
              onRowClick={(row: Organization) => nav(`/partners/organizations/${row.id}`)}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  strong: true,
                  width: '1.6fr',
                  render: (row: Organization) => <ArchivedName name={row.name} record={row} />,
                },
                {
                  key: 'kind',
                  label: 'Kind',
                  width: '1fr',
                  render: (row: Organization) => kindLabel(ORGANIZATION_KINDS, row.kind),
                },
                {
                  key: 'contact',
                  label: 'Contact',
                  width: '1.6fr',
                  wrap: true,
                  render: (row: Organization) => contactLine(row) || <Dash />,
                },
                {
                  key: 'venues',
                  label: 'Venues',
                  width: '1.4fr',
                  wrap: true,
                  render: (row: Organization) => {
                    const names = venuesForOrganization(state, row.id).map(v => v.name);
                    return names.length ? (
                      names.join(', ')
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>None yet</span>
                    );
                  },
                },
              ]}
            />
          </TableScroll>
        )}
      </Card>

      {adding === 'organization' && mayEdit && (
        <OrganizationDialog
          onClose={() => setAdding(null)}
          onSaved={id => nav(`/partners/organizations/${id}`)}
        />
      )}
      {adding === 'venue' && mayEdit && (
        <VenueDialog
          onClose={() => setAdding(null)}
          onSaved={id => nav(`/partners/venues/${id}`)}
        />
      )}
    </>
  );
}

function Dash() {
  return <span style={{ color: 'var(--text-faint)' }}>—</span>;
}
