import React from 'react';
import { Field, Input, RadioGroup } from '../../../../design-system';
import { PHOTO_RELEASE_LABEL, PHOTO_RELEASE_STATUSES } from '../../domain';
import type { PhotoReleaseInput, PhotoReleaseStatus } from '../../domain';

/**
 * The guardian's answer on photos and the day they gave it, as Enroll and the
 * student's Photo release card ask for it. The date shows only for Given or
 * Not given, and starts on today. Who recorded it is never asked: the store
 * takes the signed-in person.
 */
export default function PhotoReleaseFields({
  label = 'Photo release',
  value,
  onChange,
  today,
  error,
  hint,
}: {
  /** The radios' label; the student's card, already titled Photo release, asks for the answer. */
  label?: string;
  value: PhotoReleaseInput;
  onChange: (next: PhotoReleaseInput) => void;
  today: string;
  /** What is wrong with the date, from `photoReleaseRefusal`. */
  error?: string;
  hint?: string;
}) {
  const answered = value.status !== 'not-asked';
  // Enroll can open over the student's card, so each group of radios gets its own name.
  const name = React.useId();
  return (
    <>
      <Field label={label} hint={hint}>
        <RadioGroup
          name={name}
          direction="row"
          value={value.status}
          onChange={status =>
            onChange({
              status: status as PhotoReleaseStatus,
              date: status === 'not-asked' ? undefined : (value.date ?? today),
            })
          }
          options={PHOTO_RELEASE_STATUSES.map(s => ({ value: s, label: PHOTO_RELEASE_LABEL[s] }))}
          style={{ minHeight: 'var(--control-h)', alignItems: 'center' }}
        />
      </Field>
      {answered && (
        <Field label={value.status === 'given' ? 'Date given' : 'Date refused'} error={error}>
          <Input
            type="date"
            value={value.date ?? today}
            onChange={e => onChange({ ...value, date: e.target.value })}
            invalid={!!error}
            style={{ width: '100%' }}
          />
        </Field>
      )}
    </>
  );
}
