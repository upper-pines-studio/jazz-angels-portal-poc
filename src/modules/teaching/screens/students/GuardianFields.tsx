import { Field, Input } from '../../../../design-system';
import type { Address } from '../../../../core';
import {
  guardianAddressRefusal,
  guardianEmailRefusal,
  missingAddressParts,
  tidyAddress,
} from '../../domain';
import type { Student } from '../../domain';

/** The guardian as a form holds them: every field a string, the address in its four parts. */
export interface GuardianDraft {
  name: string;
  phone: string;
  email: string;
  address: Address;
}

type GuardianFieldsOf = Pick<
  Student,
  'guardianName' | 'guardianPhone' | 'guardianEmail' | 'guardianAddress'
>;

const NO_ADDRESS: Address = { street: '', city: '', state: '', zip: '' };

/** A draft of the student's guardian, or a blank one for a new student. */
export function guardianDraft(student?: Partial<GuardianFieldsOf>): GuardianDraft {
  return {
    name: student?.guardianName ?? '',
    phone: student?.guardianPhone ?? '',
    email: student?.guardianEmail ?? '',
    address: { ...NO_ADDRESS, ...student?.guardianAddress },
  };
}

/** What is wrong with the draft, field by field. Phone, email and address may be blank. */
export function guardianErrors(draft: GuardianDraft) {
  return {
    name: !draft.name.trim() ? 'Name the guardian we call.' : undefined,
    email: guardianEmailRefusal(draft.email),
    address: guardianAddressRefusal(draft.address),
  };
}

/** The draft as a student's fields: trimmed, and a blank one left unset. */
export function guardianFields(draft: GuardianDraft): GuardianFieldsOf {
  return {
    guardianName: draft.name.trim(),
    guardianPhone: draft.phone.trim() || undefined,
    guardianEmail: draft.email.trim() || undefined,
    guardianAddress: tidyAddress(draft.address),
  };
}

/**
 * The guardian's name, phone, email and address, as Enroll and the student's
 * Guardian card ask for them. Only the name is needed; the address is all
 * four parts or none. Shown only to whoever may see guardian contacts.
 */
export default function GuardianFields({
  value,
  onChange,
  showErrors,
}: {
  value: GuardianDraft;
  onChange: (next: GuardianDraft) => void;
  /** Show what is wrong: after a first try at saving. */
  showErrors: boolean;
}) {
  const errors = guardianErrors(value);
  const patch = (p: Partial<GuardianDraft>) => onChange({ ...value, ...p });
  const patchAddress = (p: Partial<Address>) =>
    onChange({ ...value, address: { ...value.address, ...p } });
  // Mark the parts a half-filled address is missing.
  const missing = showErrors && errors.address ? missingAddressParts(value.address) : [];

  return (
    <>
      <div className="ja-grid-2">
        <Field label="Guardian" required error={showErrors ? errors.name : undefined}>
          <Input
            value={value.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="Lorraine Robinson"
            invalid={showErrors && !!errors.name}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Guardian phone">
          <Input
            value={value.phone}
            onChange={e => patch({ phone: e.target.value })}
            placeholder="(562) 555-0148"
            style={{ width: '100%' }}
          />
        </Field>
      </div>

      <Field label="Guardian email" error={showErrors ? errors.email : undefined}>
        <Input
          type="email"
          value={value.email}
          onChange={e => patch({ email: e.target.value })}
          placeholder="lorraine.robinson@example.com"
          invalid={showErrors && !!errors.email}
          style={{ width: '100%' }}
        />
      </Field>

      <Field label="Guardian address">
        <Input
          value={value.address.street}
          onChange={e => patchAddress({ street: e.target.value })}
          placeholder="1520 E 7th St"
          invalid={missing.includes('street')}
          style={{ width: '100%' }}
        />
      </Field>
      <Field
        error={showErrors ? errors.address : undefined}
        hint="Street, city, state and ZIP, or leave all four blank."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--space-3)',
          }}
        >
          <Field label="City">
            <Input
              value={value.address.city}
              onChange={e => patchAddress({ city: e.target.value })}
              placeholder="Long Beach"
              invalid={missing.includes('city')}
            />
          </Field>
          <Field label="State">
            <Input
              value={value.address.state}
              onChange={e => patchAddress({ state: e.target.value })}
              placeholder="CA"
              invalid={missing.includes('state')}
            />
          </Field>
          <Field label="ZIP">
            <Input
              value={value.address.zip}
              onChange={e => patchAddress({ zip: e.target.value })}
              placeholder="90813"
              invalid={missing.includes('ZIP')}
            />
          </Field>
        </div>
      </Field>
    </>
  );
}
