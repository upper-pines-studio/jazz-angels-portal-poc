import React from 'react';
import { Badge, Button, DataTable, Dialog, EmptyState, Field, Icon, Input, Select } from '../../../design-system';
import { dateShort, isPostAward, useStore } from '../../../domain';
import type { Grant, Report, ReportStatus } from '../../../domain';
import { useToast } from '../../ToastHost';
import { AddButton, DialogFields, FooterBand } from './parts';
import { TableScroll } from '../../components/TableScroll';

/** What the funder is owed and when. */

const STATUS_LABEL: Record<ReportStatus, string> = {
  upcoming: 'Upcoming', drafting: 'Drafting', submitted: 'Submitted', accepted: 'Accepted',
};
const STATUS_TONE: Record<ReportStatus, 'neutral' | 'blue' | 'teal'> = {
  upcoming: 'neutral', drafting: 'blue', submitted: 'teal', accepted: 'teal',
};

export function ReportsTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);

  const rows = state.reports.filter(r => r.grantId === grant.id)
    .slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!isPostAward(grant.phase)) {
    return (
      <EmptyState icon={<Icon name="file-text" size={22} />} title="No reports yet"
        message="Reports appear here once the funder tells us what they need and when." />
    );
  }

  const unsubmitted = (r: Report) => !r.submittedDate && r.status !== 'submitted' && r.status !== 'accepted';

  return (
    <div>
      <TableScroll minWidth={620}>
      <DataTable
        columns={[
          {
            key: 'kind', label: 'Kind', width: '110px', render: (r: Report) =>
              <Badge tone={r.kind === 'final' ? 'gold' : 'neutral'}>{r.kind === 'final' ? 'Final' : 'Interim'}</Badge>,
          },
          {
            key: 'dueDate', label: 'Due', width: '100px', mono: true, render: (r: Report) => (
              <span style={{ color: unsubmitted(r) && r.dueDate < today ? 'var(--danger-500)' : undefined }}>
                {dateShort(r.dueDate)}
              </span>
            ),
          },
          { key: 'status', label: 'Status', width: '120px', render: (r: Report) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
          { key: 'submittedDate', label: 'Submitted', width: '110px', mono: true, render: (r: Report) => r.submittedDate ? dateShort(r.submittedDate) : '—' },
          {
            key: 'action', label: '', width: '1fr', render: (r: Report) => unsubmitted(r)
              ? <Button variant="secondary" size="sm" onClick={() => {
                actions.markReportSubmitted(r.id, today);
                toast({ tone: 'success', title: 'Report submitted', message: `${r.kind === 'final' ? 'Final' : 'Interim'} report · ${grant.title}` });
              }}>Mark submitted</Button>
              : null,
          },
        ]}
        rows={rows}
        emptyLabel="No reports scheduled yet."
      />
      </TableScroll>

      <FooterBand>
        <AddButton label="Add report" onClick={() => setAdding(true)} />
      </FooterBand>

      {adding && (
        <AddReportDialog today={today} onClose={() => setAdding(false)} onSave={v => {
          actions.addReport({ grantId: grant.id, kind: v.kind, dueDate: v.dueDate, status: 'upcoming' });
          toast({ tone: 'success', title: 'Report added', message: `${v.kind === 'final' ? 'Final' : 'Interim'} report due ${dateShort(v.dueDate)}` });
          setAdding(false);
        }} />
      )}
    </div>
  );
}

function AddReportDialog({ today, onClose, onSave }: {
  today: string;
  onClose: () => void;
  onSave: (v: { kind: 'interim' | 'final'; dueDate: string }) => void;
}) {
  const [kind, setKind] = React.useState<'interim' | 'final'>('interim');
  const [dueDate, setDueDate] = React.useState(today);
  return (
    <Dialog open title="Add report" description="What the funder expects, and the date it is due." onClose={onClose} width={440}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave({ kind, dueDate })}>Add report</Button>
      </>}>
      <DialogFields>
        <Field label="Kind">
          <Select value={kind} onChange={e => setKind(e.target.value as 'interim' | 'final')}
            options={[{ value: 'interim', label: 'Interim' }, { value: 'final', label: 'Final' }]} />
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
