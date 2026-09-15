import React from 'react';
import { TableScroll } from '../../components/TableScroll';
import { Button, Card, DataTable, Dialog, Field, Icon, Input, Select, Textarea } from '../../../design-system';
import { useToast } from '../../ToastHost';
import { addressLine, organizationById, useStore, venuesForOrganization } from '../../../core';
import type { Address, Organization, OrganizationKind, Venue, VenueKind } from '../../../core';

/**
 * The Places half of Settings: the organizations Jazz Angels partners with
 * (a school district, a community centre) and the venues classes meet at (the
 * studio, each school). A district has many schools, so venues hang off an
 * organization; the studio hangs off nothing.
 */

const MUTED_SM: React.CSSProperties = { font: 'var(--weight-regular) 13px/1.6 var(--font-sans)', color: 'var(--text-muted)' };
const COLUMN: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };
const FOOT: React.CSSProperties = {
  display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 var(--space-4)', background: 'var(--surface-sunken)',
};

const ORGANIZATION_KINDS: Array<{ value: OrganizationKind; label: string }> = [
  { value: 'school-district', label: 'School district' },
  { value: 'school', label: 'School' },
  { value: 'community', label: 'Community organization' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const VENUE_KINDS: Array<{ value: VenueKind; label: string }> = [
  { value: 'studio', label: 'Our studio' },
  { value: 'school', label: 'School' },
  { value: 'community', label: 'Community space' },
  { value: 'performance', label: 'Performance venue' },
  { value: 'other', label: 'Other' },
];

const NO_ORGANIZATION = '';

function kindLabel<K extends string>(kinds: Array<{ value: K; label: string }>, value: K): string {
  return kinds.find((k) => k.value === value)?.label ?? value;
}

function contactLine(row: { contactName?: string; contactPhone?: string; contactEmail?: string }): string {
  return [row.contactName, row.contactPhone ?? row.contactEmail].filter(Boolean).join(' · ');
}

/** Trim every string field and drop the empty ones, so a blank input stays absent. */
function tidy<T extends object>(draft: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

const EMPTY_ADDRESS: Address = { street: '', city: '', state: 'CA', zip: '' };

type OrganizationDraft = Omit<Organization, 'id'> & { id?: string };
type VenueDraft = Omit<Venue, 'id' | 'address'> & { id?: string; address: Address };

export default function Places() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [organization, setOrganization] = React.useState<OrganizationDraft | null>(null);
  const [venue, setVenue] = React.useState<VenueDraft | null>(null);

  function saveOrganization() {
    if (!organization || !organization.name.trim()) return;
    const { id, ...rest } = organization;
    const input = tidy(rest);
    if (id) {
      actions.core.updateOrganization(id, input);
      toast({ tone: 'success', title: 'Organization updated', message: input.name });
    } else {
      actions.core.addOrganization(input);
      toast({ tone: 'success', title: 'Organization added', message: input.name });
    }
    setOrganization(null);
  }

  function saveVenue() {
    if (!venue || !venue.name.trim()) return;
    const { id, address, organizationId, ...rest } = venue;
    const tidyAddress = tidy(address);
    const input: Omit<Venue, 'id'> = {
      ...tidy(rest),
      organizationId: organizationId || undefined,
      address: tidyAddress.street || tidyAddress.city ? tidyAddress : undefined,
    };
    if (id) {
      actions.core.updateVenue(id, input);
      toast({ tone: 'success', title: 'Venue updated', message: input.name });
    } else {
      actions.core.addVenue(input);
      toast({ tone: 'success', title: 'Venue added', message: input.name });
    }
    setVenue(null);
  }

  const editOrganization = (row: Organization) => setOrganization({ ...row });
  const editVenue = (row: Venue) => setVenue({ ...row, address: { ...EMPTY_ADDRESS, ...row.address } });

  return (
    <>
      <Card title="Venues" subtitle="Where classes and performances happen: the studio, each school, a hall." padding="0">
        <TableScroll minWidth={720}>
          <DataTable
            rows={state.core.venues}
            columns={[
              { key: 'name', label: 'Name', strong: true, width: '1.4fr' },
              { key: 'kind', label: 'Kind', width: '1fr', render: (row: Venue) => kindLabel(VENUE_KINDS, row.kind) },
              {
                key: 'organization', label: 'Organization', width: '1.4fr',
                render: (row: Venue) => organizationById(state, row.organizationId)?.name
                  ?? <span style={{ color: 'var(--text-faint)' }}>—</span>,
              },
              { key: 'address', label: 'Address', width: '1.6fr', wrap: true, render: (row: Venue) => addressLine(row.address) || '—' },
              { key: 'contact', label: 'On-site contact', width: '1.4fr', wrap: true, render: (row: Venue) => contactLine(row) || '—' },
              {
                key: 'edit', label: '', width: '80px', align: 'right',
                render: (row: Venue) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); editVenue(row); }}>Edit</a>
                ),
              },
            ]}
            emptyLabel="No venues yet. Add the studio and every school you teach at."
          />
        </TableScroll>
        <div style={FOOT}>
          <Button
            variant="ghost" size="sm" iconLeft={<Icon name="plus" size={15} />}
            onClick={() => setVenue({ name: '', kind: 'school', organizationId: NO_ORGANIZATION, address: { ...EMPTY_ADDRESS } })}
          >
            Add venue
          </Button>
          <span style={{ ...MUTED_SM, marginLeft: 'auto' }}>
            Ensembles point at a venue, so renaming a school here renames it on every schedule.
          </span>
        </div>
      </Card>

      <Card title="Organizations" subtitle="The partners behind the venues: a district and its schools, a community centre." padding="0">
        <TableScroll minWidth={640}>
          <DataTable
            rows={state.core.organizations}
            columns={[
              { key: 'name', label: 'Name', strong: true, width: '1.6fr' },
              { key: 'kind', label: 'Kind', width: '1fr', render: (row: Organization) => kindLabel(ORGANIZATION_KINDS, row.kind) },
              { key: 'contact', label: 'Contact', width: '1.6fr', wrap: true, render: (row: Organization) => contactLine(row) || '—' },
              {
                key: 'venues', label: 'Venues', width: '1.4fr', wrap: true,
                render: (row: Organization) => {
                  const names = venuesForOrganization(state, row.id).map((v) => v.name);
                  return names.length ? names.join(', ') : <span style={{ color: 'var(--text-faint)' }}>None yet</span>;
                },
              },
              {
                key: 'edit', label: '', width: '80px', align: 'right',
                render: (row: Organization) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); editOrganization(row); }}>Edit</a>
                ),
              },
            ]}
            emptyLabel="No organizations yet. Add the districts and partners you work with."
          />
        </TableScroll>
        <div style={FOOT}>
          <Button
            variant="ghost" size="sm" iconLeft={<Icon name="plus" size={15} />}
            onClick={() => setOrganization({ name: '', kind: 'school-district' })}
          >
            Add organization
          </Button>
        </div>
      </Card>

      {venue && (
        <Dialog
          open
          title={venue.id ? 'Edit venue' : 'Add venue'}
          description={venue.id ? 'Change where it is or who to ask for.' : 'A place a class or a performance happens.'}
          onClose={() => setVenue(null)}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setVenue(null)}>Cancel</Button>
              <Button variant="primary" disabled={!venue.name.trim()} onClick={saveVenue}>
                {venue.id ? 'Save venue' : 'Add venue'}
              </Button>
            </>
          }
        >
          <div style={COLUMN}>
            <Field label="Name" required>
              <Input value={venue.name} placeholder="Paramount Middle School" onChange={(e) => setVenue({ ...venue, name: e.target.value })} />
            </Field>
            <div className="ja-grid-2">
              <Field label="Kind" hint="Our studio names only the room on the schedule.">
                <Select
                  value={venue.kind}
                  options={VENUE_KINDS}
                  onChange={(e) => setVenue({ ...venue, kind: e.target.value as VenueKind })}
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label="Organization" hint="The district or partner it belongs to.">
                <Select
                  value={venue.organizationId ?? NO_ORGANIZATION}
                  options={[
                    { value: NO_ORGANIZATION, label: 'None' },
                    ...state.core.organizations.map((o) => ({ value: o.id, label: o.name })),
                  ]}
                  onChange={(e) => setVenue({ ...venue, organizationId: e.target.value })}
                  style={{ width: '100%' }}
                />
              </Field>
            </div>
            <Field label="Street">
              <Input value={venue.address.street} placeholder="8500 Contreras St"
                onChange={(e) => setVenue({ ...venue, address: { ...venue.address, street: e.target.value } })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-3)' }}>
              <Field label="City">
                <Input value={venue.address.city} placeholder="Paramount"
                  onChange={(e) => setVenue({ ...venue, address: { ...venue.address, city: e.target.value } })} />
              </Field>
              <Field label="State">
                <Input value={venue.address.state} placeholder="CA"
                  onChange={(e) => setVenue({ ...venue, address: { ...venue.address, state: e.target.value } })} />
              </Field>
              <Field label="ZIP">
                <Input value={venue.address.zip} placeholder="90723"
                  onChange={(e) => setVenue({ ...venue, address: { ...venue.address, zip: e.target.value } })} />
              </Field>
            </div>
            <Field label="On-site contact" hint="Who meets the teaching artist at the door.">
              <Input value={venue.contactName ?? ''} placeholder="Marcus Reyes, band director"
                onChange={(e) => setVenue({ ...venue, contactName: e.target.value })} />
            </Field>
            <div className="ja-grid-2">
              <Field label="Phone">
                <Input value={venue.contactPhone ?? ''} placeholder="(562) 555-0142"
                  onChange={(e) => setVenue({ ...venue, contactPhone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input value={venue.contactEmail ?? ''} placeholder="mreyes@example.org"
                  onChange={(e) => setVenue({ ...venue, contactEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" hint="Parking, sign-in, which door.">
              <Textarea rows={3} value={venue.notes ?? ''} placeholder="Sign in at the front office. The band room is B-12, behind the gym."
                onChange={(e) => setVenue({ ...venue, notes: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      )}

      {organization && (
        <Dialog
          open
          title={organization.id ? 'Edit organization' : 'Add organization'}
          description={organization.id ? 'Change the name, the kind or who to call.' : 'A district, a school or a partner you work with.'}
          onClose={() => setOrganization(null)}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOrganization(null)}>Cancel</Button>
              <Button variant="primary" disabled={!organization.name.trim()} onClick={saveOrganization}>
                {organization.id ? 'Save organization' : 'Add organization'}
              </Button>
            </>
          }
        >
          <div style={COLUMN}>
            <Field label="Name" required>
              <Input value={organization.name} placeholder="Paramount Unified School District"
                onChange={(e) => setOrganization({ ...organization, name: e.target.value })} />
            </Field>
            <Field label="Kind">
              <Select
                value={organization.kind}
                options={ORGANIZATION_KINDS}
                onChange={(e) => setOrganization({ ...organization, kind: e.target.value as OrganizationKind })}
                style={{ width: '100%' }}
              />
            </Field>
            <Field label="Contact" hint="The person the office actually calls.">
              <Input value={organization.contactName ?? ''} placeholder="Lorena Castillo, VAPA coordinator"
                onChange={(e) => setOrganization({ ...organization, contactName: e.target.value })} />
            </Field>
            <div className="ja-grid-2">
              <Field label="Phone">
                <Input value={organization.contactPhone ?? ''} placeholder="(562) 555-0180"
                  onChange={(e) => setOrganization({ ...organization, contactPhone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input value={organization.contactEmail ?? ''} placeholder="lcastillo@example.org"
                  onChange={(e) => setOrganization({ ...organization, contactEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="Website">
              <Input value={organization.website ?? ''} placeholder="https://"
                onChange={(e) => setOrganization({ ...organization, website: e.target.value })} />
            </Field>
            <Field label="Notes" hint="What was agreed, when it renews, who to invoice.">
              <Textarea rows={3} value={organization.notes ?? ''}
                onChange={(e) => setOrganization({ ...organization, notes: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
