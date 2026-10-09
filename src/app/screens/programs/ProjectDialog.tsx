import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../design-system';
import { useToast } from '../../ToastHost';
import {
  isOperations,
  money,
  programBudget,
  programBudgetProblem,
  programName,
  programOptions,
  projectProblem,
  useStore,
} from '../../../core';
import type { FiscalYear, ProgramId, ProjectInput } from '../../../core';

/** A whole-dollar amount typed into a field, or NaN when it is not one. */
export function dollars(text: string): number {
  const clean = text.replace(/[$,\s]/g, '');
  return clean === '' ? NaN : Number(clean);
}

const STACK: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

/** What a program costs in one fiscal year: Set budget or Change budget on its sheet. */
export function BudgetDialog({
  programId,
  fy,
  onClose,
}: {
  programId: ProgramId;
  fy: FiscalYear;
  onClose: () => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const was = programBudget(state, programId, fy.label);
  const [text, setText] = React.useState(was === undefined ? '' : String(was));
  const [showErrors, setShowErrors] = React.useState(false);
  const amount = dollars(text);
  const problem = programBudgetProblem(state, programId, fy.label, amount);
  const name = programName(state, programId);

  const save = () => {
    if (problem) {
      setShowErrors(true);
      return;
    }
    actions.core.setProgramBudget(programId, fy.label, amount);
    toast({
      tone: 'success',
      title: 'Budget saved',
      message: `${name}, ${fy.label}: ${money(amount)}`,
    });
    onClose();
  };

  return (
    <Dialog
      open
      width={420}
      title={`${name} budget, ${fy.label}`}
      description={
        isOperations(programId)
          ? `What the office's running costs come to from ${fy.label}'s first day to its last: rent, salaries, insurance, the office. The grants paying for it are measured against it.`
          : `What the program costs from ${fy.label}'s first day to its last. The grants paying for it are measured against it.`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save budget
          </Button>
        </>
      }
    >
      <Field label="Budget" required error={showErrors ? problem : undefined}>
        <Input
          value={text}
          prefix="$"
          placeholder="18000"
          onChange={e => setText(e.target.value)}
          style={{ width: '100%' }}
        />
      </Field>
    </Dialog>
  );
}

export interface ProjectDraft extends Omit<ProjectInput, 'budget'> {
  id?: string;
  budget: string;
}

/** Add a project or Edit project: its name, its program, its dates and its budget. */
export function ProjectDialog({
  draft,
  onClose,
  onAdded,
}: {
  draft: ProjectDraft;
  onClose: () => void;
  /** A new project was added: the page opens it. */
  onAdded?: (id: string) => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [name, setName] = React.useState(draft.name);
  const [programId, setProgramId] = React.useState(draft.programId);
  const [start, setStart] = React.useState(draft.start);
  const [end, setEnd] = React.useState(draft.end);
  const [budget, setBudget] = React.useState(draft.budget);
  const [showErrors, setShowErrors] = React.useState(false);

  const input: ProjectInput = { name, programId, start, end, budget: dollars(budget) };
  const problem = projectProblem(state, input);
  const error = (match: RegExp) =>
    showErrors && problem && match.test(problem) ? problem : undefined;

  const save = () => {
    if (problem) {
      setShowErrors(true);
      return;
    }
    if (draft.id) {
      actions.core.updateProject(draft.id, input);
      toast({ tone: 'success', title: 'Project updated', message: name.trim() });
    } else {
      const id = actions.core.addProject(input);
      if (id) onAdded?.(id);
      toast({ tone: 'success', title: 'Project added', message: name.trim() });
    }
    onClose();
  };

  return (
    <Dialog
      open
      width={520}
      title={draft.id ? 'Edit project' : 'Add a project'}
      description={
        draft.id
          ? 'The grants giving to it keep their shares.'
          : isOperations(draft.programId)
            ? 'One-off work for the office, like an office move or a new laptop, with its own dates and budget. Grants give to it directly.'
            : 'One-off work under a program, like a spring showcase or an instrument refresh, with its own dates and budget. Grants give to it directly.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {draft.id ? 'Save project' : 'Add project'}
          </Button>
        </>
      }
    >
      <div style={STACK}>
        <Field label="Name" required error={error(/name/)}>
          <Input
            value={name}
            placeholder="Spring Showcase 2027"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Part of" required error={error(/program/)}>
          <Select
            value={programId}
            options={programOptions(state, draft.programId).map(p => ({
              value: p.id,
              label: p.name,
            }))}
            onChange={e => setProgramId(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
        <div className="ja-grid-2">
          <Field label="Starts" required error={error(/date|starts/)}>
            <Input
              type="date"
              value={start}
              onChange={e => setStart(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Ends" required>
            <Input
              type="date"
              value={end}
              onChange={e => setEnd(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
        </div>
        <Field
          label="Budget"
          required
          hint="What it costs across all its dates."
          error={error(/budget/)}
        >
          <Input
            value={budget}
            prefix="$"
            placeholder="9000"
            onChange={e => setBudget(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
