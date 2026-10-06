import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Select,
} from '../../../../design-system';
import { dateShort, useStore } from '../../../../core';
import { isPostAward, isReportOpen } from '../../domain';
import type { Grant, Report, ReportStatus } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { AddButton, DeleteX, DialogFields, FieldRow, FooterBand } from './parts';
import { TableScroll } from '../../../../app/components/TableScroll';
import { LinkButton } from '../money/shared';
import { ReportReminders, dueDaysText, kindWord, reportUrgency } from '../deadlines/ReminderParts';

/** What the funder is owed and when, and who gets reminded before each report is due. */

const STATUS_LABEL: Record<ReportStatus, string> = {
  upcoming: 'Not started',
  drafting: 'Drafting',
  submitted: 'Submitted',
  accepted: 'Accepted',
};
const STATUS_TONE: Record<ReportStatus, 'neutral' | 'blue' | 'teal'> = {
  upcoming: 'neutral',
  drafting: 'blue',
  submitted: 'teal',
  accepted: 'teal',
};

type ReportKind = Report['kind'];

export function ReportsTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Report | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const rows = state.grants.reports
    .filter(r => r.grantId === grant.id)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!isPostAward(grant.phase)) {
    return (
      <EmptyState
        icon={<Icon name="file-text" size={22} />}
        title="No reports yet"
        message="Reports appear here once the funder tells us what they need and when."
      />
    );
  }

  const label = (r: Pick<Report, 'kind'>) => `${r.kind === 'final' ? 'Final' : 'Interim'} report`;

  const markSubmitted = (r: Report) => {
    actions.grants.markReportSubmitted(r.id, today);
    toast({
      tone: 'success',
      title: 'Report submitted',
      message: `${label(r)} · ${grant.title}. Its reminders have stopped.`,
    });
  };

  const remove = (r: Report) => {
    actions.grants.deleteReport(r.id);
    setDeleting(null);
    toast({
      tone: 'success',
      title: 'Report deleted',
      message: `${label(r)} due ${dateShort(r.dueDate)} is gone, and so are its reminders.`,
    });
  };

  return (
    <div>
      <TableScroll minWidth={640}>
        <DataTable
          columns={[
            {
              key: 'kind',
              label: 'Kind',
              width: '76px',
              render: (r: Report) => (
                <Badge tone={r.kind === 'final' ? 'gold' : 'neutral'}>{kindWord(r)}</Badge>
              ),
            },
            {
              key: 'dueDate',
              label: 'Due',
              width: '116px',
              render: (r: Report) => {
                const open = isReportOpen(r);
                const urgency = reportUrgency(r, today);
                return (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ font: 'var(--type-numeric)', color: 'var(--text-strong)' }}>
                      {dateShort(r.dueDate)}
                    </span>
                    <span
                      style={{
                        font: 'var(--weight-regular) var(--text-2xs)/1.3 var(--font-sans)',
                        color: !open
                          ? 'var(--text-muted)'
                          : urgency === 'overdue'
                            ? 'var(--danger-500)'
                            : urgency === 'due-soon'
                              ? 'var(--gold-600)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {open
                        ? dueDaysText(r.dueDate, today, true)
                        : r.submittedDate
                          ? `Submitted ${dateShort(r.submittedDate)}`
                          : 'Submitted'}
                    </span>
                  </span>
                );
              },
            },
            {
              key: 'status',
              label: 'Status',
              width: '112px',
              render: (r: Report) => (
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                  }}
                >
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  {isReportOpen(r) && (
                    <LinkButton
                      onClick={e => {
                        e.stopPropagation();
                        markSubmitted(r);
                      }}
                    >
                      Mark submitted
                    </LinkButton>
                  )}
                </span>
              ),
            },
            {
              key: 'reminders',
              label: 'Reminders',
              width: '1fr',
              wrap: true,
              render: (r: Report) => {
                if (deleting === r.id) {
                  return (
                    <span
                      style={{
                        font: 'var(--type-body-sm)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      Delete this report and its reminders?
                    </span>
                  );
                }
                return isReportOpen(r) ? (
                  <ReportReminders report={r} />
                ) : (
                  <span
                    style={{
                      font: 'var(--type-body-sm)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Reminders stopped
                  </span>
                );
              },
            },
            {
              key: 'actions',
              label: '',
              width: '120px',
              align: 'right',
              render: (r: Report) =>
                deleting === r.id ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <Button variant="danger" size="sm" onClick={() => remove(r)}>
                      Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                    }}
                  >
                    {isReportOpen(r) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        iconLeft={<Icon name="bell" size={13} />}
                        onClick={() => nav(`/deadlines?kind=report&report=${r.id}`)}
                      >
                        Reminders
                      </Button>
                    )}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <IconButton
                        label={`Edit the ${label(r).toLowerCase()}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(r)}
                      >
                        <Icon name="pencil" size={14} />
                      </IconButton>
                      <DeleteX
                        label={`Delete the ${label(r).toLowerCase()}`}
                        onClick={() => setDeleting(r.id)}
                      />
                    </span>
                  </span>
                ),
            },
          ]}
          rows={rows}
          emptyLabel="No reports scheduled yet. Add the ones the award letter asks for."
        />
      </TableScroll>

      <FooterBand>
        <AddButton label="Add report" onClick={() => setAdding(true)} />
      </FooterBand>

      {adding && (
        <ReportDialog
          today={today}
          onClose={() => setAdding(false)}
          onSave={v => {
            actions.grants.addReport({
              grantId: grant.id,
              kind: v.kind,
              dueDate: v.dueDate,
              status: v.status,
              submittedDate: v.submittedDate,
            });
            toast({
              tone: 'success',
              title: 'Report added',
              message: `${label(v)} due ${dateShort(v.dueDate)}. It follows the office reminder defaults.`,
            });
            setAdding(false);
          }}
        />
      )}

      {editing && (
        <ReportDialog
          today={today}
          report={editing}
          onClose={() => setEditing(null)}
          onSave={v => {
            actions.grants.updateReport(editing.id, v);
            toast({
              tone: 'success',
              title: 'Report updated',
              message: `${label(v)} due ${dateShort(v.dueDate)}, ${STATUS_LABEL[v.status].toLowerCase()}.`,
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface ReportValues {
  kind: ReportKind;
  dueDate: string;
  status: ReportStatus;
  submittedDate?: string;
}

/** Add a report, or change one: its kind, due date and where it stands. */
function ReportDialog({
  today,
  report,
  onClose,
  onSave,
}: {
  today: string;
  report?: Report;
  onClose: () => void;
  onSave: (v: ReportValues) => void;
}) {
  const [kind, setKind] = React.useState<ReportKind>(report?.kind ?? 'interim');
  const [dueDate, setDueDate] = React.useState(report?.dueDate ?? today);
  const [status, setStatus] = React.useState<ReportStatus>(report?.status ?? 'upcoming');
  const [submittedDate, setSubmittedDate] = React.useState(report?.submittedDate ?? today);
  const done = status === 'submitted' || status === 'accepted';
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && (!done || /^\d{4}-\d{2}-\d{2}$/.test(submittedDate));

  const save = () =>
    onSave({ kind, dueDate, status, submittedDate: done ? submittedDate : undefined });

  return (
    <Dialog
      open
      title={report ? 'Edit report' : 'Add report'}
      width={460}
      onClose={onClose}
      description={
        report
          ? 'Reminders move with the due date.'
          : 'What the funder expects, and the date it is due. Reminders follow the office defaults.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {report ? 'Save report' : 'Add report'}
          </Button>
        </>
      }
    >
      <DialogFields>
        <FieldRow>
          <Field label="Kind">
            <Select
              value={kind}
              onChange={e => setKind(e.target.value as ReportKind)}
              options={[
                { value: 'interim', label: 'Interim' },
                { value: 'final', label: 'Final' },
              ]}
            />
          </Field>
          <Field
            label="Due date"
            error={/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? undefined : 'Pick a date.'}
          >
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Status">
            <Select
              value={status}
              onChange={e => setStatus(e.target.value as ReportStatus)}
              options={(Object.keys(STATUS_LABEL) as ReportStatus[]).map(s => ({
                value: s,
                label: STATUS_LABEL[s],
              }))}
            />
          </Field>
          {done && (
            <Field label="Submitted on">
              <Input
                type="date"
                value={submittedDate}
                onChange={e => setSubmittedDate(e.target.value)}
              />
            </Field>
          )}
        </FieldRow>
      </DialogFields>
    </Dialog>
  );
}
