import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import { TableScroll } from '../../components/TableScroll';
import { KV, OwnerAvatar } from '../../components/badges';
import { Button, Card, DataTable, EmptyState, Icon } from '../../../design-system';
import { addressLine, organizationById, programName, staffById, useStore, venueById } from '../../../core';
import { classesAtVenue } from '../../../modules/teaching';
import type { VenueClass } from '../../../modules/teaching';
import { VENUE_KINDS, VenueDialog, kindLabel } from './dialogs';

/**
 * One venue: where it is, who meets the teaching artist at the door, and the
 * classes that meet there. The classes come from the teaching module through
 * its public index, and only when that module is switched on.
 */
export default function VenueDetail() {
  const { id = '' } = useParams();
  const { state, today } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = React.useState(false);

  const venue = venueById(state, id);
  const organization = organizationById(state, venue?.organizationId);
  const teachingOn = state.core.settings.enabledModules.includes('teaching');
  const classes = venue && teachingOn ? classesAtVenue(state, venue.id, today) : [];

  usePageHeader({
    title: venue ? venue.name : 'Venue not found',
    subtitle: venue ? [kindLabel(VENUE_KINDS, venue.kind), organization?.name].filter(Boolean).join(' · ') : undefined,
    crumbs: [
      { label: 'Partners', href: '/partners' },
      ...(organization ? [{ label: organization.name, href: `/partners/organizations/${organization.id}` }] : []),
      { label: venue ? venue.name : 'Not found' },
    ],
    actions: venue
      ? (
        <Button variant="secondary" size="sm" iconLeft={<Icon name="pencil" size={15} />} onClick={() => setEditing(true)}>
          Edit venue
        </Button>
      )
      : undefined,
  });

  if (!venue) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="map-pin" size={22} />}
          title="This venue doesn't exist"
          message="The link may be out of date, or the place was never added. Every venue we teach at is on the Partners list."
          action={<Button variant="primary" size="sm" onClick={() => nav('/partners')}>Back to partners</Button>}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="ja-split ja-split--aside-left">
        <Card title="Details">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <KV k="Kind" v={kindLabel(VENUE_KINDS, venue.kind)} />
            <KV k="Organization" v={organization
              ? <Link to={`/partners/organizations/${organization.id}`}>{organization.name}</Link>
              : '—'} />
            <KV k="Address" v={addressLine(venue.address) || '—'} />
            <KV k="On-site contact" v={venue.contactName || '—'} />
            <KV k="Phone" v={venue.contactPhone || '—'} />
            <KV k="Email" v={venue.contactEmail
              ? <a href={`mailto:${venue.contactEmail}`}>{venue.contactEmail}</a>
              : '—'} />
            <KV k="Notes" v={venue.notes || '—'} />
          </div>
        </Card>

        <Card
          title="Classes here"
          subtitle={teachingOn ? `${classes.length} ${classes.length === 1 ? 'ensemble meets' : 'ensembles meet'} at ${venue.name}` : undefined}
          padding="0"
        >
          {teachingOn ? (
            <TableScroll minWidth={680}>
              <DataTable
                rows={classes.map((c) => ({ id: c.ensembleId, ...c }))}
                emptyLabel="No classes meet here yet. Add one from the Schedule."
                columns={[
                  { key: 'name', label: 'Ensemble', strong: true, width: '1.3fr' },
                  {
                    key: 'program', label: 'Program', width: '1.3fr',
                    render: (r: VenueClass) => <span style={{ color: 'var(--text-muted)' }}>{programName(state, r.programId)}</span>,
                  },
                  { key: 'when', label: 'When', width: '1.5fr', render: (r: VenueClass) => r.when ?? <span style={{ color: 'var(--text-faint)' }}>—</span> },
                  { key: 'room', label: 'Room', width: '1fr', render: (r: VenueClass) => r.room || '—' },
                  {
                    key: 'lead', label: 'Lead', width: '1.2fr',
                    render: (r: VenueClass) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <OwnerAvatar staffId={r.leadStaffId} size={22} />
                        <span style={{ color: 'var(--text-muted)' }}>{staffById(state, r.leadStaffId)?.name ?? '—'}</span>
                      </span>
                    ),
                  },
                  { key: 'enrolled', label: 'Students', width: '90px', align: 'right', mono: true, render: (r: VenueClass) => String(r.enrolled) },
                ]}
              />
            </TableScroll>
          ) : (
            <p style={{ margin: 0, padding: 'var(--space-5)', font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
              Turn the Teaching module on in Settings to see which classes meet here.
            </p>
          )}
        </Card>
      </div>

      {editing && <VenueDialog venue={venue} onClose={() => setEditing(false)} />}
    </>
  );
}
