import React from 'react';
import { Button, Dialog, Field, Input } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import { dateRange, useStore } from '../../../../core';
import { termProblems, weeksBetween } from '../../domain';
import type { Term } from '../../domain';

/**
 * Add a session, or change one: its name, the day it starts and ends, and how
 * many classes each ensemble meets for. The screens call a term a session.
 * Until the office types a number, the classes planned follow the weeks
 * between the dates.
 */
export default function TermDialog({ term, onClose }: { term?: Term; onClose: () => void }) {
  const { actions } = useStore();
  const toast = useToast();

  const [name, setName] = React.useState(term?.name ?? '');
  const [start, setStart] = React.useState(term?.start ?? '');
  const [end, setEnd] = React.useState(term?.end ?? '');
  // Unset until typed: then it follows the dates.
  const [planned, setPlanned] = React.useState<string | undefined>(
    term ? String(term.meetingsPlanned) : undefined,
  );
  const [showErrors, setShowErrors] = React.useState(false);

  const meetingsPlanned = planned === undefined ? weeksBetween(start, end) : Number(planned);
  const input = { name, start, end, meetingsPlanned };
  const problems = termProblems(input);
  const valid = Object.keys(problems).length === 0;
  const error = (key: keyof typeof problems) => (showErrors ? problems[key] : undefined);

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const message = `${name.trim()} · ${dateRange(start, end)}`;
    if (term) {
      actions.teaching.updateTerm(term.id, input);
      toast({ tone: 'success', title: 'Session updated', message });
    } else {
      actions.teaching.addTerm(input);
      toast({ tone: 'success', title: 'Session added', message });
    }
    onClose();
  };

  return (
    <Dialog
      open
      title={term ? 'Edit session' : 'Add session'}
      description={
        term
          ? 'Change the name, the dates or the classes planned. Its classes stay as they are.'
          : 'The weeks the office plans and reports on. Put classes in it with Add class.'
      }
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {term ? 'Save session' : 'Add session'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Name" required error={error('name')}>
          <Input
            value={name}
            placeholder="Winter 2027 session"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>

        <div className="ja-grid-2">
          <Field label="Starts" required error={error('start')}>
            <Input
              type="date"
              value={start}
              onChange={e => setStart(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Ends" required error={error('end')}>
            <Input
              type="date"
              value={end}
              onChange={e => setEnd(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
        </div>

        <Field
          label="Classes planned"
          required
          error={error('meetingsPlanned')}
          hint="How many times each ensemble meets. It follows the weeks between the dates until you change it."
        >
          <Input
            type="number"
            mono
            value={planned ?? String(meetingsPlanned)}
            onChange={e => setPlanned(e.target.value)}
            style={{ width: 120 }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
