import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import { activeOnly, classProgramOptions, placeLabel, useStore } from '../../../../core';
import type { ProgramId } from '../../../../core';
import { ensembleById } from '../../domain';

const WAITLIST = '__waitlist__';

/**
 * Enroll a student. Leaving the ensemble unset puts them on the waitlist,
 * which is where most people start.
 */
export default function EnrollStudentDialog({
  open,
  onClose,
  defaultProgramId,
  defaultEnsembleId,
  onEnrolled,
}: {
  open: boolean;
  onClose: () => void;
  defaultProgramId?: ProgramId;
  defaultEnsembleId?: string;
  onEnrolled?: (id: string) => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [name, setName] = React.useState('');
  const [instrument, setInstrument] = React.useState('');
  const [guardianName, setGuardianName] = React.useState('');
  const [guardianPhone, setGuardianPhone] = React.useState('');
  // A new student is offered the current programs only, not Operations; an archived program's
  // tab still opens this, and it starts on the first current one instead.
  const programs = classProgramOptions(state);
  const [programId, setProgramId] = React.useState<ProgramId>(
    programs.find(p => p.id === defaultProgramId)?.id ?? programs[0]?.id ?? '',
  );
  const [ensembleId, setEnsembleId] = React.useState(defaultEnsembleId ?? WAITLIST);
  const [showErrors, setShowErrors] = React.useState(false);

  const nameError = !name.trim() ? 'Give the student a name.' : undefined;
  const instrumentError = !instrument.trim() ? 'Name the instrument they play.' : undefined;
  const guardianError = !guardianName.trim() ? 'Name the guardian we call.' : undefined;
  const valid = !nameError && !instrumentError && !guardianError;

  // The ensembles that belong to the chosen program, plus the waitlist.
  const ensembles = activeOnly(state.teaching.ensembles).filter(e => e.programId === programId);
  const chosen = ensembles.some(e => e.id === ensembleId) ? ensembleId : WAITLIST;

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const waiting = chosen === WAITLIST;
    const id = actions.teaching.enrollStudent({
      name: name.trim(),
      instrument: instrument.trim(),
      yearsIn: 1,
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim() || undefined,
      programId,
      ensembleId: waiting ? undefined : chosen,
      status: waiting ? 'waitlist' : 'enrolled',
    });
    toast({
      title: waiting ? 'Student added to the waitlist' : 'Student enrolled',
      message: waiting
        ? `${name.trim()} is waiting for a seat.`
        : `${name.trim()} joins ${ensembleById(state, chosen)?.name ?? 'the roster'}.`,
    });
    onEnrolled?.(id);
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="Enroll student"
      description="Name, instrument and a guardian we can reach. The rest can wait."
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Enroll student
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Student" required error={showErrors ? nameError : undefined}>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Maya Robinson"
            style={{ width: '100%' }}
          />
        </Field>

        <Field label="Instrument" required error={showErrors ? instrumentError : undefined}>
          <Input
            value={instrument}
            onChange={e => setInstrument(e.target.value)}
            placeholder="Trumpet"
            style={{ width: '100%' }}
          />
        </Field>

        <div className="ja-grid-2">
          <Field label="Guardian" required error={showErrors ? guardianError : undefined}>
            <Input
              value={guardianName}
              onChange={e => setGuardianName(e.target.value)}
              placeholder="Lorraine Robinson"
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Guardian phone">
            <Input
              value={guardianPhone}
              onChange={e => setGuardianPhone(e.target.value)}
              placeholder="(562) 555-0148"
              style={{ width: '100%' }}
            />
          </Field>
        </div>

        <Field label="Program" required>
          <Select
            value={programId}
            onChange={e => setProgramId(e.target.value as ProgramId)}
            options={programs.map(p => ({ value: p.id, label: p.name }))}
            style={{ width: '100%' }}
          />
        </Field>

        <Field label="Ensemble" hint="Leave this on the waitlist until a seat opens.">
          <Select
            value={chosen}
            onChange={e => setEnsembleId(e.target.value)}
            options={[
              { value: WAITLIST, label: 'Waitlist' },
              ...ensembles.map(e => ({
                value: e.id,
                label: `${e.name} · ${placeLabel(state, e.venueId, e.room)}`,
              })),
            ]}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
