import React from 'react';
import { Button, Dialog, Field, Input } from '../../../design-system';
import { useToast } from '../../ToastHost';
import { programProblem, useStore } from '../../../core';

export interface ProgramDraft {
  id?: string;
  name: string;
  short: string;
}

/** Add program or Edit program: the name, and the short name a tab or a narrow column uses. */
export function ProgramDialog({
  draft,
  onClose,
  onAdded,
}: {
  draft: ProgramDraft;
  onClose: () => void;
  /** A new program was added: the page selects it. */
  onAdded?: (id: string) => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [name, setName] = React.useState(draft.name);
  const [short, setShort] = React.useState(draft.short);
  const [showErrors, setShowErrors] = React.useState(false);

  const problem = programProblem(state.core.programs, { name, short }, draft.id);

  const save = () => {
    if (problem) {
      setShowErrors(true);
      return;
    }
    if (draft.id) {
      actions.core.updateProgram(draft.id, { name, short });
      toast({ tone: 'success', title: 'Program updated', message: name.trim() });
    } else {
      const id = actions.core.addProgram({ name, short });
      if (id) onAdded?.(id);
      toast({ tone: 'success', title: 'Program added', message: name.trim() });
    }
    onClose();
  };

  return (
    <Dialog
      open
      width={460}
      title={draft.id ? 'Edit program' : 'Add program'}
      description={
        draft.id
          ? 'Every grant, student and ensemble that names it shows the new name.'
          : 'What a grant, a student, an ensemble or an hour of teaching is for.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {draft.id ? 'Save program' : 'Add program'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Name" required error={showErrors ? problem : undefined}>
          <Input
            value={name}
            placeholder="Summer Jazz Camp"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
        <Field
          label="Short name"
          hint="The word a tab or a narrow column uses. Left blank, it is the name."
        >
          <Input
            value={short}
            placeholder="Camp"
            onChange={e => setShort(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
