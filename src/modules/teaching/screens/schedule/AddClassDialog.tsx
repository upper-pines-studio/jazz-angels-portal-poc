import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import { activeOnly, dateLong, pickable, useStore, venueById } from '../../../../core';
import { ensembleById, timeLabel } from '../../domain';

/**
 * Add one class to the schedule: which ensemble, which date, the hour, and
 * where. The ensemble's usual venue and room are filled in and can be changed,
 * so a one-off at a school or a different studio room is one dialog away.
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

  // An archived ensemble is not offered: its classes have stopped.
  const ensembles = activeOnly(state.teaching.ensembles);
  const first = ensembles[0];
  const [ensembleId, setEnsembleId] = React.useState(first?.id ?? '');
  const [date, setDate] = React.useState(defaultDate || today);
  const [start, setStart] = React.useState('16:00');
  const [end, setEnd] = React.useState('17:00');
  // Until the office touches them, the place follows the chosen ensemble.
  const [place, setPlace] = React.useState<{ venueId: string; room: string } | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);

  const ensemble = ensembleById(state, ensembleId);
  const venueId = place?.venueId ?? ensemble?.venueId ?? activeOnly(state.core.venues)[0]?.id ?? '';
  const room = place?.room ?? ensemble?.room ?? '';
  const venue = venueById(state, venueId);

  const dateError = !date ? 'Pick the date the class meets.' : undefined;
  const timeError =
    start && end && end <= start ? 'The class has to end after it starts.' : undefined;
  const valid = !dateError && !timeError && Boolean(ensembleId) && Boolean(venueId);

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    actions.teaching.addMeeting({ ensembleId, date, start, end, venueId, room: room.trim() });
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Add class
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Ensemble" required>
          <Select
            value={ensembleId}
            onChange={e => {
              setEnsembleId(e.target.value);
              setPlace(null);
            }}
            options={ensembles.map(en => ({ value: en.id, label: en.name }))}
            style={{ width: '100%' }}
          />
        </Field>

        <Field label="Date" required error={showErrors ? dateError : undefined}>
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>

        <div className="ja-grid-2">
          <Field label="Start time" required>
            <Input
              type="time"
              value={start}
              onChange={e => setStart(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="End time" required error={showErrors ? timeError : undefined}>
            <Input
              type="time"
              value={end}
              onChange={e => setEnd(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
        </div>

        <Field
          label="Venue"
          required
          hint="Where the ensemble usually meets. Add venues in Settings."
        >
          <Select
            value={venueId}
            onChange={e => setPlace({ venueId: e.target.value, room: '' })}
            options={pickable(state.core.venues, venueId).map(v => ({
              value: v.id,
              label: v.name,
            }))}
            style={{ width: '100%' }}
          />
        </Field>

        <Field
          label="Room"
          hint={
            venue?.kind === 'studio'
              ? 'Studio 1, Studio 2, Main room.'
              : 'The space inside the building, if it matters.'
          }
        >
          <Input
            value={room}
            onChange={e => setPlace({ venueId, room: e.target.value })}
            placeholder={venue?.kind === 'studio' ? 'Studio 1' : 'Band room'}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
