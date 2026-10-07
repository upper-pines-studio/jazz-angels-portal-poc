import React from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  ProgressBar,
  Select,
} from '../../../../design-system';
import { dateShort, pickable, useCan, useStore } from '../../../../core';
import { PHASES, PHASE_ORDER, checklistProgress } from '../../domain';
import type { Grant, Phase, Task } from '../../domain';
import { PhaseBadge } from '../badges';
import { OwnerAvatar } from '../../../../app/components/badges';
import { useToast } from '../../../../app/ToastHost';
import { AddButton, DeleteX, DialogFields, FooterBand, InlineConfirm } from './parts';

/** The checklist that came from the playbook template, grouped by phase. */
export function ChecklistTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const mayEdit = useCan()('grants', 'edit');
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);

  const tasks = state.grants.tasks.filter(t => t.grantId === grant.id);
  const progress = checklistProgress(state, grant.id);
  const groups = PHASE_ORDER.map(phase => ({
    phase,
    rows: tasks.filter(t => t.phase === phase).sort((a, b) => a.order - b.order),
  })).filter(g => g.rows.length > 0);

  return (
    <div>
      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="list-checks" size={22} />}
          title="No tasks yet"
          message={
            mayEdit
              ? 'The steps for this grant show up here, grouped by phase, with who does each one and by when. Add the first task.'
              : 'The steps for this grant show up here, grouped by phase, once someone adds them.'
          }
          action={
            mayEdit && (
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Icon name="plus" size={15} />}
                onClick={() => setAdding(true)}
              >
                Add task
              </Button>
            )
          }
        />
      ) : (
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            borderBottom: 'var(--border-width) solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              font: 'var(--type-body-sm)',
              color: 'var(--text-body)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <span>Tasks</span>
            <span
              style={{
                font: 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)',
                color: 'var(--text-strong)',
              }}
            >
              {progress.done} of {progress.total} done
            </span>
          </div>
          <ProgressBar
            value={progress.done}
            max={Math.max(progress.total, 1)}
            color="var(--teal-500)"
          />
        </div>
      )}

      {groups.map(group => (
        <React.Fragment key={group.phase}>
          <GroupHeader phase={group.phase} rows={group.rows} />
          {group.rows.map(task => (
            <TaskRow key={task.id} task={task} grant={grant} today={today} mayEdit={mayEdit} />
          ))}
        </React.Fragment>
      ))}

      {mayEdit && groups.length > 0 && (
        <FooterBand>
          <AddButton label="Add task" onClick={() => setAdding(true)} />
        </FooterBand>
      )}

      {adding && mayEdit && (
        <AddTaskDialog
          grant={grant}
          onClose={() => setAdding(false)}
          onSave={input => {
            actions.grants.addTask({
              ...input,
              grantId: grant.id,
              done: false,
              order: tasks.length + 1,
            });
            toast({ tone: 'success', title: 'Task added', message: input.title });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function GroupHeader({ phase, rows }: { phase: Phase; rows: Task[] }) {
  const done = rows.filter(r => r.done).length;
  const badge =
    done === rows.length ? (
      <Badge tone="teal">Complete</Badge>
    ) : done > 0 ? (
      <Badge tone="blue">In progress</Badge>
    ) : (
      <Badge tone="neutral">Not started</Badge>
    );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        height: 40,
        padding: '0 var(--space-6)',
        background: 'var(--surface-sunken)',
        borderBottom: 'var(--border-width) solid var(--border-subtle)',
      }}
    >
      <PhaseBadge phase={phase} />
      {badge}
      <span
        style={{
          marginLeft: 'auto',
          font: 'var(--weight-medium) var(--text-3xs)/1.3 var(--font-mono)',
          color: 'var(--text-muted)',
        }}
      >
        {done} of {rows.length}
      </span>
    </div>
  );
}

function TaskRow({
  task,
  grant,
  today,
  mayEdit,
}: {
  task: Task;
  grant: Grant;
  today: string;
  mayEdit: boolean;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const [hover, setHover] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const overdue = !task.done && !!task.dueDate && task.dueDate < today;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setConfirming(false);
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr 90px 28px',
        gap: 'var(--space-4)',
        alignItems: 'center',
        minHeight: 'var(--row-h)',
        padding: '0 var(--space-6)',
        borderBottom: 'var(--border-width) solid var(--border-subtle)',
        background: hover ? 'var(--blue-50)' : 'var(--neutral-0)',
        font: 'var(--type-body-sm)',
        color: 'var(--text-body)',
        transition: 'background-color var(--duration-fast) var(--ease-standard)',
      }}
    >
      {mayEdit ? (
        <Checkbox checked={task.done} onChange={() => actions.grants.toggleTask(task.id)} />
      ) : (
        <span />
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: task.done ? 'var(--text-faint)' : 'var(--text-body)',
            textDecoration: task.done ? 'line-through' : undefined,
          }}
        >
          {task.title}
        </span>
        {confirming ? (
          <InlineConfirm
            question="Delete this task?"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              actions.grants.deleteTask(task.id);
              toast({ tone: 'info', title: 'Task deleted', message: task.title });
            }}
          />
        ) : (
          hover &&
          mayEdit && (
            <span style={{ marginLeft: 'auto', display: 'flex' }}>
              <DeleteX label="Delete task" onClick={() => setConfirming(true)} />
            </span>
          )
        )}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          font: 'var(--weight-medium) var(--text-2xs)/1.3 var(--font-mono)',
          color: overdue ? 'var(--danger-500)' : 'var(--text-muted)',
        }}
      >
        {task.done ? (
          <>
            <Icon name="check" size={11} color="var(--teal-500)" />
            {task.doneAt ? dateShort(task.doneAt) : ''}
          </>
        ) : task.dueDate ? (
          dateShort(task.dueDate)
        ) : (
          '—'
        )}
      </span>
      <OwnerAvatar staffId={task.assigneeId ?? grant.ownerId} size={28} />
    </div>
  );
}

function AddTaskDialog({
  grant,
  onClose,
  onSave,
}: {
  grant: Grant;
  onClose: () => void;
  onSave: (input: { title: string; phase: Phase; dueDate?: string; assigneeId?: string }) => void;
}) {
  const { state } = useStore();
  const startPhase: Phase = PHASE_ORDER.includes(grant.phase) ? grant.phase : 'prospect';
  const [title, setTitle] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>(startPhase);
  const [dueDate, setDueDate] = React.useState('');
  const [assigneeId, setAssigneeId] = React.useState(grant.ownerId);

  return (
    <Dialog
      open
      title="Add task"
      description="One thing that has to happen on this grant."
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() =>
              onSave({ title: title.trim(), phase, dueDate: dueDate || undefined, assigneeId })
            }
          >
            Add task
          </Button>
        </>
      }
    >
      <DialogFields>
        <Field label="Task" required>
          <Input
            value={title}
            placeholder="Gather board list"
            onChange={e => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Phase">
          <Select
            value={phase}
            onChange={e => setPhase(e.target.value as Phase)}
            options={PHASE_ORDER.map(p => ({ value: p, label: PHASES[p].label }))}
          />
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
        <Field label="Assignee">
          <Select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            options={pickable(state.core.staff, assigneeId).map(s => ({
              value: s.id,
              label: s.name,
            }))}
          />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
