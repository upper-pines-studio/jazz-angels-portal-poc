import React from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '../../../design-system';
import { useToast } from '../../ToastHost';
import { useStore } from '../../../core';
import type { Address, Organization, OrganizationKind, Venue, VenueKind } from '../../../core';

/**
 * The Add / Edit dialogs the Partners screens share, and the small vocabulary
 * that goes with them. Each dialog owns its draft and saves through
 * `actions.core`, so a screen only has to say which row, or none for "add".
 */

export const ORGANIZATION_KINDS: Array<{ value: OrganizationKind; label: string }> = [
  { value: 'school-district', label: 'School district' },
  { value: 'school', label: 'School' },
  { value: 'community', label: 'Community organization' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

export const VENUE_KINDS: Array<{ value: VenueKind; label: string }> = [
  { value: 'studio', label: 'Our studio' },
  { value: 'school', label: 'School' },
  { value: 'community', label: 'Community space' },
  { value: 'performance', label: 'Performance venue' },
  { value: 'other', label: 'Other' },
];

export function kindLabel<K extends string>(kinds: Array<{ value: K; label: string }>, value: K): string {
  return kinds.find((k) => k.value === value)?.label ?? value;
}

export function contactLine(row: { contactName?: string; contactPhone?: string; contactEmail?: string }): string {
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

const NO_ORGANIZATION = '';
const EMPTY_ADDRESS: Address = { street: '', city: '', state: 'CA', zip: '' };
const COLUMN: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

type OrganizationDraft = Omit<Organization, 'id'>;

/** `organization` set means edit; absent means add. */
export function OrganizationDialog({ organization, onClose, onSaved }: {
  organization?: Organization;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const [draft, setDraft] = React.useState<OrganizationDraft>(() => {
    if (!organization) return { name: '', kind: 'school-district' };
    const { id: _id, ...rest } = organization;
    return rest;
  });
  const patch = (p: Partial<OrganizationDraft>) => setDraft((d) => ({ ...d, ...p }));

  function save() {
    if (!draft.name.trim()) return;
    const input = tidy(draft);
    if (organization) {
      actions.core.updateOrganization(organization.id, input);
      toast({ tone: 'success', title: 'Organization updated', message: input.name });
      onSaved?.(organization.id);
    } else {
      const id = actions.core.addOrganization(input);
      toast({ tone: 'success', title: 'Organization added', message: input.name });
      onSaved?.(id);
    }
    onClose();
  }

  return (
    <Dialog
      open
      width={520}
      title={organization ? 'Edit organization' : 'Add organization'}
      description={organization ? 'Change the name, the kind or who to call.' : 'A district, a school or a partner you work with. Its venues come next.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>
            {organization ? 'Save organization' : 'Add organization'}
          </Button>
        </>
      }
    >
      <div style={COLUMN}>
        <Field label="Name" required>
          <Input value={draft.name} placeholder="Paramount Unified School District" onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <Select value={draft.kind} options={ORGANIZATION_KINDS}
            onChange={(e) => patch({ kind: e.target.value as OrganizationKind })} style={{ width: '100%' }} />
        </Field>
        <Field label="Contact" hint="The person the office actually calls.">
          <Input value={draft.contactName ?? ''} placeholder="Lorena Castillo, VAPA coordinator" onChange={(e) => patch({ contactName: e.target.value })} />
        </Field>
        <div className="ja-grid-2">
          <Field label="Phone">
            <Input value={draft.contactPhone ?? ''} placeholder="(562) 555-0180" onChange={(e) => patch({ contactPhone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={draft.contactEmail ?? ''} placeholder="lcastillo@example.org" onChange={(e) => patch({ contactEmail: e.target.value })} />
          </Field>
        </div>
        <Field label="Website">
          <Input value={draft.website ?? ''} placeholder="https://" onChange={(e) => patch({ website: e.target.value })} />
        </Field>
        <Field label="Notes" hint="What was agreed, when it renews, who to invoice.">
          <Textarea rows={3} value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Venue
// ---------------------------------------------------------------------------

type VenueDraft = Omit<Venue, 'id' | 'address'> & { address: Address };

/** `venue` set means edit; absent means add, under `organizationId` if given. */
export function VenueDialog({ venue, organizationId, onClose, onSaved }: {
  venue?: Venue;
  organizationId?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [draft, setDraft] = React.useState<VenueDraft>(() => {
    if (!venue) {
      return { name: '', kind: 'school', organizationId: organizationId ?? NO_ORGANIZATION, address: { ...EMPTY_ADDRESS } };
    }
    return { ...venue, address: { ...EMPTY_ADDRESS, ...venue.address } };
  });
  const patch = (p: Partial<VenueDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchAddress = (p: Partial<Address>) => setDraft((d) => ({ ...d, address: { ...d.address, ...p } }));

  function save() {
    if (!draft.name.trim()) return;
    const { address, organizationId: org, ...rest } = draft;
    const tidyAddress = tidy(address);
    const input: Omit<Venue, 'id'> = {
      ...tidy(rest),
      organizationId: org || undefined,
      address: tidyAddress.street || tidyAddress.city ? tidyAddress : undefined,
    };
    if (venue) {
      actions.core.updateVenue(venue.id, input);
      toast({ tone: 'success', title: 'Venue updated', message: input.name });
      onSaved?.(venue.id);
    } else {
      const id = actions.core.addVenue(input);
      toast({ tone: 'success', title: 'Venue added', message: input.name });
      onSaved?.(id);
    }
    onClose();
  }

  return (
    <Dialog
      open
      width={520}
      title={venue ? 'Edit venue' : 'Add venue'}
      description={venue ? 'Change where it is or who to ask for.' : 'A place a class or a performance happens.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>
            {venue ? 'Save venue' : 'Add venue'}
          </Button>
        </>
      }
    >
      <div style={COLUMN}>
        <Field label="Name" required>
          <Input value={draft.name} placeholder="Paramount Middle School" onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <div className="ja-grid-2">
          <Field label="Kind" hint="Our studio names only the room on the schedule.">
            <Select value={draft.kind} options={VENUE_KINDS}
              onChange={(e) => patch({ kind: e.target.value as VenueKind })} style={{ width: '100%' }} />
          </Field>
          <Field label="Organization" hint="The district or partner it belongs to.">
            <Select
              value={draft.organizationId ?? NO_ORGANIZATION}
              options={[
                { value: NO_ORGANIZATION, label: 'None' },
                ...state.core.organizations.map((o) => ({ value: o.id, label: o.name })),
              ]}
              onChange={(e) => patch({ organizationId: e.target.value })}
              style={{ width: '100%' }}
            />
          </Field>
        </div>
        <Field label="Street">
          <Input value={draft.address.street} placeholder="8500 Contreras St" onChange={(e) => patchAddress({ street: e.target.value })} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--space-3)' }}>
          <Field label="City">
            <Input value={draft.address.city} placeholder="Paramount" onChange={(e) => patchAddress({ city: e.target.value })} />
          </Field>
          <Field label="State">
            <Input value={draft.address.state} placeholder="CA" onChange={(e) => patchAddress({ state: e.target.value })} />
          </Field>
          <Field label="ZIP">
            <Input value={draft.address.zip} placeholder="90723" onChange={(e) => patchAddress({ zip: e.target.value })} />
          </Field>
        </div>
        <Field label="On-site contact" hint="Who meets the teaching artist at the door.">
          <Input value={draft.contactName ?? ''} placeholder="Marcus Reyes, band director" onChange={(e) => patch({ contactName: e.target.value })} />
        </Field>
        <div className="ja-grid-2">
          <Field label="Phone">
            <Input value={draft.contactPhone ?? ''} placeholder="(562) 555-0142" onChange={(e) => patch({ contactPhone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={draft.contactEmail ?? ''} placeholder="mreyes@example.org" onChange={(e) => patch({ contactEmail: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" hint="Parking, sign-in, which door.">
          <Textarea rows={3} value={draft.notes ?? ''} placeholder="Sign in at the front office. The band room is B-12, behind the gym."
            onChange={(e) => patch({ notes: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}
