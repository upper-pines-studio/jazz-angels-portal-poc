import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import { dateLong, useStore } from '../../../../core';
import { ensembleById, timeLabel } from '../../domain';

/**
 * Add one class to the schedule: which ensemble, which date, the hour and the
 * room. The ensemble's usual room is filled in and can be typed over.
 */
export default function AddClassDialog({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
}) {
  const { state, actions, today } = useStore();
  const toast = useToast();

  const first = state.teaching.ensembles[0];
  const [ensembleId, setEnsembleId] = React.useState(first?.id ?? '');
  const [date, setDate] = React.useState(defaultDate || today);
  const [start, setStart] = React.useState('16:00');
  const [end, setEnd] = React.useState('17:00');
  const [room, setRoom] = React.useState(first?.room ?? '');
  const [roomTouched, setRoomTouched] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const ensemble = ensembleById(state, ensembleId);
  const roomValue = roomTouched ? room : ensemble?.room ?? '';

  const dateError = !date ? 'Pick the date the class meets.' : undefined;
  const timeError = start && end && end <= start ? 'The class has to end after it starts.' : undefined;
  const valid = !dateError && !timeError && Boolean(ensembleId) && Boolean(roomValue.trim());

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    actions.teaching.addMeeting({ ensembleId, date, start, end, room: roomValue.trim() });
    toast({
      title: 'Class added',
      message: `${ensemble?.name ?? 'Class'} · ${dateLong(date)} · ${timeLabel(start)}`,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="Add class"
      description="One class on one date. The roll call opens as soon as it has happened."
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Add class</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Ensemble" required>
          <Select
            value={ensembleId}
            onChange={(e) => setEnsembleId(e.target.value)}
            options={state.teaching.ensembles.map((en) => ({ value: en.id, label: en.name }))}
            style={{ width: '100%' }}
          />
        </Field>

        <Field label="Date" required error={showErrors ? dateError : undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%' }} />
        </Field>

        <div className="ja-grid-2">
          <Field label="Start time" required>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="End time" required error={showErrors ? timeError : undefined}>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: '100%' }} />
          </Field>
        </div>

        <Field label="Room" required hint="Where the ensemble usually meets.">
          <Input
            value={roomValue}
            onChange={(e) => { setRoomTouched(true); setRoom(e.target.value); }}
            placeholder="Studio 1"
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
