import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addMonths, format, startOfMonth } from 'date-fns';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  Select,
  Tabs,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { DeadlineKindBadge, DeadlineStatusBadge } from './badges';
import { OwnerAvatar } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import { WithPanel } from '../../../app/components/SidePanel';
import { CalendarMonth } from './deadlines/CalendarMonth';
import { DEADLINE_KINDS, KIND_LABELS } from './deadlines/helpers';
import { ReportsOwedCard, ReportsOwedEmpty } from './deadlines/ReportsOwedCard';
import { ReminderDefaultsCard } from './deadlines/ReminderDefaults';
import { ReminderPanel } from './deadlines/ReminderPanel';
import { LinkButton } from './money/shared';
import { dateShort, toDate, useStore } from '../../../core';
import {
  deadlines,
  funderById,
  grantById,
  isReportOpen,
  reminderSchedule,
  reportsOwed,
} from '../domain';
import type { Deadline, DeadlineKind } from '../domain';

const ALL = 'all';

/** The kind filter as it reads on its chip: "Kind: Reports". */
const KIND_PLURAL: Record<DeadlineKind, string> = {
  task: 'Tasks',
  loi: 'LOIs',
  application: 'Applications',
  decision: 'Decisions',
  report: 'Reports',
  payment: 'Payments',
  'period-end': 'Period ends',
  start: 'Starts',
};

/**
 * Every date across every grant, as a list or a month. Filtered to reports,
 * the list becomes "Reports owed" with the reminder emails for each, and a
 * report's reminders open in the panel on the right. The view, the filters
 * and the open report all live in the URL.
 */
export default function Deadlines() {
  const nav = useNavigate();
  const { state, today } = useStore();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';

  const ownerParam = params.get('owner');
  const owner = ownerParam && state.core.staff.some(s => s.id === ownerParam) ? ownerParam : ALL;
  const kindParam = params.get('kind');
  const kind: DeadlineKind | typeof ALL =
    kindParam && (DEADLINE_KINDS as string[]).includes(kindParam)
      ? (kindParam as DeadlineKind)
      : ALL;
  const reportId = params.get('report');
  const [month, setMonth] = React.useState(() => startOfMonth(toDate(today)));

  usePageHeader({
    title: 'Deadlines',
    subtitle: 'Every date across every grant, and who gets reminded',
    actions: (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => nav('/grants?add=1')}
      >
        Add grant
      </Button>
    ),
  });

  /** Change some query params, keep the rest. `null` removes one. */
  const patch = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    setParams(q, { replace: true });
  };
  const setView = (next: string) => patch({ view: next === 'calendar' ? 'calendar' : null });
  const setOwner = (next: string) => patch({ owner: next === ALL ? null : next });
  const setKind = (next: string) => patch({ kind: next === ALL ? null : next });
  const openReport = (id: string) => patch({ report: id });
  const closeReport = React.useCallback(() => {
    setParams(
      prev => {
        const q = new URLSearchParams(prev);
        q.delete('report');
        return q;
      },
      { replace: true },
    );
  }, [setParams]);

  const all = deadlines(state, today);
  const rows = all.filter(
    d => (owner === ALL || d.ownerId === owner) && (kind === ALL || d.kind === kind),
  );

  const showReportsCard = kind === 'report' && view === 'list';
  const owed = reportsOwed(state).filter(
    r => owner === ALL || grantById(state, r.grantId)?.ownerId === owner,
  );

  const panelReport = reportId ? state.grants.reports.find(r => r.id === reportId) : undefined;
  const panel =
    panelReport && isReportOpen(panelReport) ? (
      <ReminderPanel key={panelReport.id} report={panelReport} onClose={closeReport} />
    ) : undefined;

  const openGrant = (d: Deadline) => nav(`/grants/${d.grantId}`);
  const grantLine = (d: Deadline) => {
    const g = grantById(state, d.grantId);
    const f = g && funderById(state, g.funderId);
    return `${g?.title ?? 'Grant'} · ${f?.name ?? 'Unknown funder'}`;
  };

  /** A report's next reminder, as a small bell that opens its reminders. */
  const bellFor = (d: Deadline) => {
    if (d.kind !== 'report') return null;
    const id = d.id.slice('report:'.length);
    const step = reminderSchedule(state, id, today).find(s => s.state === 'next');
    if (!step) return null;
    return (
      <button
        type="button"
        className="ja-rm-bell"
        title={`Next reminder ${dateShort(step.date)}. Open the reminders.`}
        aria-label={`Next reminder ${dateShort(step.date)}. Open the reminders`}
        onClick={e => {
          e.stopPropagation();
          patch({ kind: 'report', report: id, view: null });
        }}
      >
        <Icon name="bell" size={11} />
        {dateShort(step.date)}
      </button>
    );
  };

  const columns = [
    {
      key: 'date',
      label: 'Date',
      width: '90px',
      mono: true,
      render: (d: Deadline) => dateShort(d.date),
    },
    {
      key: 'kind',
      label: 'Kind',
      width: '120px',
      render: (d: Deadline) => <DeadlineKindBadge kind={d.kind} />,
    },
    {
      key: 'label',
      label: 'What',
      width: '1fr',
      strong: true,
      render: (d: Deadline) => (
        <>
          {d.label}
          {bellFor(d)}
        </>
      ),
    },
    {
      key: 'grant',
      label: 'Grant',
      width: '1.4fr',
      render: (d: Deadline) => <span style={{ color: 'var(--text-muted)' }}>{grantLine(d)}</span>,
    },
    {
      key: 'owner',
      label: 'Owner',
      width: '40px',
      render: (d: Deadline) => <OwnerAvatar staffId={d.ownerId} />,
    },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: (d: Deadline) => <DeadlineStatusBadge status={d.status} showUpcoming />,
    },
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
    <WithPanel panel={panel}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-6)',
          flexWrap: 'wrap',
          rowGap: 'var(--space-3)',
          borderBottom: 'var(--border-width) solid var(--border-default)',
        }}
      >
        <Tabs
          tabs={[
            { id: 'list', label: 'List' },
            { id: 'calendar', label: 'Calendar' },
          ]}
          active={view}
          onChange={setView}
          style={{ borderBottom: 0, flex: '0 0 auto' }}
        />
        <div
          className="ja-filter-bar"
          style={{
            paddingBottom: 10,
            flex: '1 1 auto',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          {kind === ALL && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-link)',
                flex: '0 0 auto',
              }}
            >
              <Icon name="bell" size={13} />
              <LinkButton onClick={() => setKind('report')}>Reports and reminders</LinkButton>
            </span>
          )}
          {kind !== ALL && (
            <button
              type="button"
              className="ja-rm-filter"
              onClick={() => patch({ kind: null, report: null })}
              aria-label={`Remove the filter Kind: ${KIND_PLURAL[kind]}`}
            >
              Kind: {KIND_PLURAL[kind]}
              <Icon name="x" size={13} />
            </button>
          )}
          <div className="ja-filter-bar__select">
            <Select
              value={owner}
              onChange={e => setOwner(e.target.value)}
              options={[
                { value: ALL, label: 'All owners' },
                ...state.core.staff.map(s => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          {kind === ALL && (
            <div className="ja-filter-bar__select">
              <Select
                value={kind}
                onChange={e => setKind(e.target.value)}
                options={[
                  { value: ALL, label: 'All kinds' },
                  ...DEADLINE_KINDS.map(k => ({ value: k, label: KIND_LABELS[k] })),
                ]}
              />
            </div>
          )}
          {view === 'calendar' && (
            <div className="ja-actions" style={{ flex: '0 1 auto', justifyContent: 'flex-end' }}>
              <IconButton
                label="Previous month"
                variant="outline"
                onClick={() => setMonth(m => addMonths(m, -1))}
              >
                <Icon name="chevron-left" size={16} />
              </IconButton>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMonth(startOfMonth(toDate(today)))}
              >
                Today
              </Button>
              <IconButton
                label="Next month"
                variant="outline"
                onClick={() => setMonth(m => addMonths(m, 1))}
              >
                <Icon name="chevron-right" size={16} />
              </IconButton>
              <div
                style={{
                  font: 'var(--weight-semibold) var(--text-lg)/1.2 var(--font-display)',
                  letterSpacing: 'var(--tracking-display)',
                  color: 'var(--text-strong)',
                  minWidth: 0,
                  textAlign: 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {format(month, 'MMMM yyyy')}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReportsCard && (
        <>
          <ReportsOwedCard
            reports={owed}
            activeId={panel ? panelReport?.id : undefined}
            onOpen={openReport}
            onGone={id => {
              if (id === reportId) closeReport();
            }}
            empty={<ReportsOwedEmpty filtered={owner !== ALL} onClear={() => setOwner(ALL)} />}
          />
          <ReminderDefaultsCard />
        </>
      )}

      {!showReportsCard && rows.length === 0 && (
        <Card padding="0">
          <EmptyState
            icon={<Icon name="calendar-days" size={22} />}
            title="No deadlines match these filters"
            message="Every date across every grant shows up here. Set the owner and kind back to All to see them."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => patch({ owner: null, kind: null, report: null })}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      )}

      {!showReportsCard && rows.length > 0 && view === 'calendar' && (
        <CalendarMonth month={month} today={today} items={rows} onOpen={openGrant} />
      )}

      {!showReportsCard && rows.length > 0 && view === 'list' && (
        <>
          {overdue.length > 0 && (
            <Card
              title="Overdue"
              subtitle={`${overdue.length} ${overdue.length === 1 ? 'date has' : 'dates have'} passed`}
              padding="0"
              accent="var(--danger-500)"
            >
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
    </WithPanel>
  );
}
