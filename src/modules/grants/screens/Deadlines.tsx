import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addMonths, format, startOfMonth } from 'date-fns';
import { Button, Card, DataTable, EmptyState, Icon, IconButton, Select, Tabs } from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { DeadlineKindBadge, DeadlineStatusBadge } from './badges';
import { OwnerAvatar } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import { CalendarMonth } from './deadlines/CalendarMonth';
import { DEADLINE_KINDS, KIND_LABELS } from './deadlines/helpers';
import { dateShort, toDate, useStore } from '../../../core';
import { deadlines, funderById, grantById } from '../domain';
import type { Deadline, DeadlineKind } from '../domain';

const ALL = 'all';

export default function Deadlines() {
  const nav = useNavigate();
  const { state, today } = useStore();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';

  const [owner, setOwner] = React.useState(ALL);
  const [kind, setKind] = React.useState(ALL);
  const [month, setMonth] = React.useState(() => startOfMonth(toDate(today)));

  usePageHeader({
    title: 'Deadlines',
    subtitle: 'Every date across every grant',
    actions: (
      <Button variant="primary" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={() => nav('/grants?add=1')}>
        Add grant
      </Button>
    ),
  });

  const setView = (next: string) => {
    const q = new URLSearchParams(params);
    q.set('view', next);
    setParams(q, { replace: true });
  };

  const all = deadlines(state, today);
  const rows = all.filter(
    d => (owner === ALL || d.ownerId === owner) && (kind === ALL || d.kind === kind),
  );

  const openGrant = (d: Deadline) => nav(`/grants/${d.grantId}`);
  const grantLine = (d: Deadline) => {
    const g = grantById(state, d.grantId);
    const f = g && funderById(state, g.funderId);
    return `${g?.title ?? 'Grant'} — ${f?.name ?? 'Unknown funder'}`;
  };

  const columns = [
    { key: 'date', label: 'Date', width: '90px', mono: true, render: (d: Deadline) => dateShort(d.date) },
    { key: 'kind', label: 'Kind', width: '120px', render: (d: Deadline) => <DeadlineKindBadge kind={d.kind} /> },
    { key: 'label', label: 'What', width: '1fr', strong: true, render: (d: Deadline) => d.label },
    {
      key: 'grant', label: 'Grant', width: '1.4fr',
      render: (d: Deadline) => <span style={{ color: 'var(--text-muted)' }}>{grantLine(d)}</span>,
    },
    { key: 'owner', label: 'Owner', width: '40px', render: (d: Deadline) => <OwnerAvatar staffId={d.ownerId} /> },
    { key: 'status', label: 'Status', width: '110px', render: (d: Deadline) => <DeadlineStatusBadge status={d.status} showUpcoming /> },
  ];

  // --- list view groups -----------------------------------------------------
  const overdue = rows.filter(d => d.status === 'overdue');
  const months: Array<{ key: string; label: string; items: Deadline[] }> = [];
  for (const d of rows.filter(x => x.status !== 'overdue')) {
    const key = d.date.slice(0, 7);
    const found = months.find(m => m.key === key);
    if (found) found.items.push(d);
    else months.push({ key, label: format(toDate(d.date), 'MMMM yyyy'), items: [d] });
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-6)',
        flexWrap: 'wrap', rowGap: 'var(--space-3)',
        borderBottom: 'var(--border-width) solid var(--border-default)',
      }}>
        <Tabs
          tabs={[{ id: 'list', label: 'List' }, { id: 'calendar', label: 'Calendar' }]}
          active={view}
          onChange={setView}
          style={{ borderBottom: 0, flex: '0 0 auto' }}
        />
        <div className="ja-filter-bar" style={{ paddingBottom: 10, flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <div className="ja-filter-bar__select">
            <Select
              value={owner}
              onChange={e => setOwner(e.target.value)}
              options={[{ value: ALL, label: 'All owners' }, ...state.core.staff.map(s => ({ value: s.id, label: s.name }))]}
            />
          </div>
          <div className="ja-filter-bar__select">
            <Select
              value={kind}
              onChange={e => setKind(e.target.value)}
              options={[{ value: ALL, label: 'All kinds' }, ...DEADLINE_KINDS.map(k => ({ value: k, label: KIND_LABELS[k as DeadlineKind] }))]}
            />
          </div>
          {view === 'calendar' && (
            <div className="ja-actions" style={{ flex: '0 1 auto', justifyContent: 'flex-end' }}>
              <IconButton label="Previous month" variant="outline" onClick={() => setMonth(m => addMonths(m, -1))}>
                <Icon name="chevron-left" size={16} />
              </IconButton>
              <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(toDate(today)))}>Today</Button>
              <IconButton label="Next month" variant="outline" onClick={() => setMonth(m => addMonths(m, 1))}>
                <Icon name="chevron-right" size={16} />
              </IconButton>
              <div style={{
                font: 'var(--weight-semibold) var(--text-lg)/1.2 var(--font-display)',
                letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)',
                minWidth: 0, textAlign: 'right',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {format(month, 'MMMM yyyy')}
              </div>
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 && (
        <Card padding="0">
          <EmptyState
            icon={<Icon name="calendar-days" size={22} />}
            title="No deadlines match these filters"
            message="Every date across every grant shows up here. Set the owner and kind back to All to see them."
            action={<Button variant="secondary" size="sm" onClick={() => { setOwner(ALL); setKind(ALL); }}>Clear filters</Button>}
          />
        </Card>
      )}

      {rows.length > 0 && view === 'calendar' && (
        <CalendarMonth month={month} today={today} items={rows} onOpen={openGrant} />
      )}

      {rows.length > 0 && view === 'list' && (
        <>
          {overdue.length > 0 && (
            <Card title="Overdue" subtitle={`${overdue.length} ${overdue.length === 1 ? 'date has' : 'dates have'} passed`}
              padding="0" accent="var(--danger-500)">
              <TableScroll minWidth={700}>
                <DataTable columns={columns} rows={overdue} onRowClick={openGrant} />
              </TableScroll>
            </Card>
          )}
          {months.map(m => (
            <Card key={m.key} title={m.label} padding="0">
              <TableScroll minWidth={700}>
                <DataTable columns={columns} rows={m.items} onRowClick={openGrant} />
              </TableScroll>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
