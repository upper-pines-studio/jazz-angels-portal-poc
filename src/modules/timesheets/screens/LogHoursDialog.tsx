import React from 'react';
import { Button, Field, Input, Select } from '../../../design-system';
import { AppDialog } from '../../../app/components/AppDialog';
import type { InputProps } from '../../../design-system';
import { programOptions, useStore } from '../../../core';
import type { ProgramId } from '../../../core';
import { ensembleOptions } from '../../teaching';
import { formatHours, isSentBack } from '../domain';
import type { NewTimeEntryInput, TimeEntry } from '../domain';
import { SentBackNote } from './SentBack';

/**
 * The design-system Input forwards anything it does not recognise to the native
 * input; its types stop at the styled props, so widen it here for the step.
 */
const NumberInput = Input as React.ComponentType<InputProps & { step?: string; min?: string }>;

/**
 * Log hours: who, when, which program, what it was, how long. Given `entry`,
 * the same fields change one of your own drafts instead (a sent-back one too).
 */
export default function LogHoursDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry?: TimeEntry;
  onClose: () => void;
  onSaved: (entry: { staffId: string; hours: number }) => void;
}) {
  const { state, today, user, actions } = useStore();

  // Everyone logs their own hours and nobody else's (decision 0001), so the
  // only name on offer is the signed-in person's.
  const staffId = user.id;
  const [date, setDate] = React.useState(entry?.date ?? today);
  const [programId, setProgramId] = React.useState<string>(
    entry?.programId ?? programOptions(state)[0]?.id ?? '',
  );
  const [ensembleId, setEnsembleId] = React.useState(entry?.ensembleId ?? '');
  const [activity, setActivity] = React.useState(entry?.activity ?? '');
  const [hours, setHours] = React.useState(entry ? formatHours(entry.hours) : '2.00');

  // Only the groups that meet inside the chosen program, so an entry never
  // names a combo the program does not run.
  const ensembles = state.core.settings.enabledModules.includes('teaching')
    ? ensembleOptions(state, programId ? (programId as ProgramId) : undefined)
    : [];
  const ensemble = ensembles.some(e => e.id === ensembleId) ? ensembleId : '';

  const parsed = Number(hours);
  const valid = activity.trim().length > 0 && Number.isFinite(parsed) && parsed > 0 && !!programId;

  const save = () => {
    if (!valid) return;
    const input: NewTimeEntryInput = {
      staffId,
      date,
      programId: programId as ProgramId,
      ensembleId: ensemble || undefined,
      activity: activity.trim(),
      hours: parsed,
    };
    if (entry) {
      actions.timesheets.changeEntry(entry.id, input);
    } else {
      actions.timesheets.logHours(input);
    }
    onSaved({ staffId, hours: parsed });
  };

  const title = entry ? 'Edit hours' : 'Log hours';
  const description = !entry
    ? 'Hours go in as a draft. Submit them when the week is done.'
    : isSentBack(entry)
      ? 'Fix what the office asked, then submit the week again.'
      : 'This is still a draft. Submit it with the rest of the week.';

  return (
    <AppDialog
      open
      title={title}
      description={description}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {entry ? 'Save changes' : 'Log hours'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {entry && <SentBackNote entry={entry} block />}
        <Field label="Teacher" required hint="You log your own hours.">
          <Select value={staffId} disabled options={[{ value: user.id, label: user.name }]} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Program" required>
          <Select
            value={programId}
            onChange={e => setProgramId(e.target.value)}
            options={programOptions(state).map(p => ({ value: p.id, label: p.name }))}
          />
        </Field>
        {ensembles.length > 0 && (
          <Field label="Ensemble" hint="Leave it blank for prep, planning and office work.">
            <Select
              value={ensemble}
              onChange={e => setEnsembleId(e.target.value)}
              options={[
                { value: '', label: 'No ensemble' },
                ...ensembles.map(e => ({ value: e.id, label: e.name })),
              ]}
            />
          </Field>
        )}
        <Field label="Activity" required>
          <Input
            value={activity}
            placeholder="Combo A rehearsal, Studio 1"
            onChange={e => setActivity(e.target.value)}
          />
        </Field>
        <Field label="Hours" required hint="Quarter hours: 0.25, 0.50, 0.75.">
          <NumberInput
            type="number"
            mono
            step="0.25"
            min="0.25"
            style={{ width: 120 }}
            value={hours}
            onChange={e => setHours(e.target.value)}
          />
        </Field>
      </div>
    </AppDialog>
  );
}
