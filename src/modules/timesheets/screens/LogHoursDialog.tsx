import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../design-system';
import type { InputProps } from '../../../design-system';
import { CURRENT_USER, useStore } from '../../../core';
import type { ProgramId } from '../../../core';
import { ensembleOptions } from '../../teaching';
import type { NewTimeEntryInput } from '../domain';

/**
 * The design-system Input forwards anything it does not recognise to the native
 * input; its types stop at the styled props, so widen it here for the step.
 */
const NumberInput = Input as React.ComponentType<InputProps & { step?: string; min?: string }>;

/** Log hours: who, when, which program, what it was, how long. */
export default function LogHoursDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (entry: { staffId: string; hours: number }) => void;
}) {
  const { state, today, actions } = useStore();

  const teachers = state.core.staff.filter((s) => s.teaches);
  const fallback = teachers[0]?.id ?? CURRENT_USER.id;
  const defaultTeacher = teachers.some((s) => s.id === CURRENT_USER.id) ? CURRENT_USER.id : fallback;

  const [staffId, setStaffId] = React.useState(defaultTeacher);
  const [date, setDate] = React.useState(today);
  const [programId, setProgramId] = React.useState<string>(state.core.programs[0]?.id ?? '');
  const [ensembleId, setEnsembleId] = React.useState('');
  const [activity, setActivity] = React.useState('');
  const [hours, setHours] = React.useState('2.00');

  // Only the groups that meet inside the chosen program, so an entry never
  // names a combo the program does not run.
  const ensembles = state.core.settings.enabledModules.includes('teaching')
    ? ensembleOptions(state, programId ? (programId as ProgramId) : undefined)
    : [];
  const ensemble = ensembles.some((e) => e.id === ensembleId) ? ensembleId : '';

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
    actions.timesheets.logHours(input);
    onSaved({ staffId, hours: parsed });
  };

  return (
    <Dialog
      open
      title="Log hours"
      description="Hours go in as a draft. Submit them when the week is done."
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            Log hours
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Teacher" required>
          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            options={teachers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Program" required>
          <Select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            options={state.core.programs.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        {ensembles.length > 0 && (
          <Field label="Ensemble" hint="Leave it blank for prep, planning and office work.">
            <Select
              value={ensemble}
              onChange={(e) => setEnsembleId(e.target.value)}
              options={[
                { value: '', label: 'No ensemble' },
                ...ensembles.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
          </Field>
        )}
        <Field label="Activity" required>
          <Input
            value={activity}
            placeholder="Combo A rehearsal, Studio 1"
            onChange={(e) => setActivity(e.target.value)}
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
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
