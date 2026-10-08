import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import {
  pickable,
  programName,
  programOptions,
  useCan,
  useStore,
  venueById,
} from '../../../../core';
import { ENSEMBLE_TONES, ensembleProblems, leadOptions, nextTone } from '../../domain';
import type { Ensemble, EnsembleTone } from '../../domain';
import { TONE_COLOR, TONE_LABEL } from '../parts';

/**
 * Add an ensemble, or change one: its name, the program it belongs to, the
 * teaching artist who leads it, where it meets and the colour it carries on
 * the week grid. The pickers offer what is current, plus whatever an
 * ensemble being edited already names.
 */
export default function EnsembleDialog({
  ensemble,
  onClose,
}: {
  ensemble?: Ensemble;
  onClose: () => void;
}) {
  const { state, actions } = useStore();
  const mayPartners = useCan()('partners', 'edit');
  const toast = useToast();
  const nav = useNavigate();

  const programs = programOptions(state, ensemble?.programId);
  const leads = leadOptions(state, ensemble?.leadStaffId);
  const venues = pickable(state.core.venues, ensemble?.venueId);

  const [name, setName] = React.useState(ensemble?.name ?? '');
  const [programId, setProgramId] = React.useState(ensemble?.programId ?? programs[0]?.id ?? '');
  const [leadStaffId, setLeadStaffId] = React.useState(ensemble?.leadStaffId ?? leads[0]?.id ?? '');
  const [venueId, setVenueId] = React.useState(ensemble?.venueId ?? venues[0]?.id ?? '');
  const [room, setRoom] = React.useState(ensemble?.room ?? '');
  const [tone, setTone] = React.useState<EnsembleTone>(ensemble?.tone ?? nextTone(state));
  const [showErrors, setShowErrors] = React.useState(false);

  const venue = venueById(state, venueId);
  const input = { name, programId, leadStaffId, venueId, room, tone };
  const problems = ensembleProblems(state, input, ensemble?.id);
  const valid = Object.keys(problems).length === 0;
  const error = (key: keyof typeof problems) => (showErrors ? problems[key] : undefined);
  const moved = ensemble && (venueId !== ensemble.venueId || room.trim() !== ensemble.room);

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const message = `${name.trim()} · ${programName(state, programId)}`;
    if (ensemble) {
      actions.teaching.updateEnsemble(ensemble.id, input);
      toast({
        tone: 'success',
        title: 'Ensemble updated',
        message: moved ? `${message}. Its classes from today on meet at the new place.` : message,
      });
    } else {
      actions.teaching.addEnsemble(input);
      toast({
        tone: 'success',
        title: 'Ensemble added',
        message: `${message}. Put its classes on the schedule with Add class.`,
      });
    }
    onClose();
  };

  return (
    <Dialog
      open
      title={ensemble ? 'Edit ensemble' : 'Add ensemble'}
      description={
        ensemble
          ? 'Change its name, program, lead, place or colour. Past classes keep the place they met.'
          : 'A standing group: the same students, the same place, the same hour each week.'
      }
      onClose={onClose}
      width={500}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {ensemble ? 'Save ensemble' : 'Add ensemble'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Name" required error={error('name')}>
          <Input
            value={name}
            placeholder="Combo C"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>

        <Field
          label="Program"
          required
          error={error('programId')}
          hint={programs.length === 0 ? 'No programs yet. Add one in Settings.' : undefined}
        >
          <Select
            value={programId}
            onChange={e => setProgramId(e.target.value)}
            options={programs.map(p => ({ value: p.id, label: p.name }))}
            style={{ width: '100%' }}
          />
        </Field>

        <Field
          label="Lead teacher"
          required
          error={error('leadStaffId')}
          hint={
            leads.length === 0
              ? 'Nobody on the staff teaches yet. Turn on Teaches for them in Settings.'
              : 'They take roll for its classes and see its students.'
          }
        >
          <Select
            value={leadStaffId}
            onChange={e => setLeadStaffId(e.target.value)}
            options={leads.map(s => ({ value: s.id, label: s.name }))}
            style={{ width: '100%' }}
          />
        </Field>

        <div className="ja-grid-2">
          <Field
            label="Venue"
            required
            error={error('venueId')}
            hint={venues.length === 0 ? 'No venues yet.' : undefined}
          >
            {venues.length === 0 && mayPartners ? (
              <Button variant="secondary" size="sm" onClick={() => nav('/partners')}>
                Add a venue on Partners
              </Button>
            ) : (
              <Select
                value={venueId}
                onChange={e => setVenueId(e.target.value)}
                options={venues.map(v => ({ value: v.id, label: v.name }))}
                style={{ width: '100%' }}
              />
            )}
          </Field>
          <Field label="Room">
            <Input
              value={room}
              onChange={e => setRoom(e.target.value)}
              placeholder={venue?.kind === 'studio' ? 'Studio 1' : 'Band room'}
              style={{ width: '100%' }}
            />
          </Field>
        </div>

        <Field label="Colour" hint="The rule down the side of its classes on the week grid.">
          <div className="ja-tone-picker" role="radiogroup" aria-label="Colour">
            {ENSEMBLE_TONES.map(t => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                className={'ja-tone-picker__option' + (tone === t ? ' is-selected' : '')}
                onClick={() => setTone(t)}
              >
                <span
                  className="ja-tone-picker__swatch"
                  style={{ background: TONE_COLOR[t] }}
                  aria-hidden
                />
                {TONE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
