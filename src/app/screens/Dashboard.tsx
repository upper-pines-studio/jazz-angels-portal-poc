import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button, Card, DataTable, EmptyState, Icon, StatCard } from '../../design-system';
import { usePageHeader } from '../Shell';
import { AttentionStatusBadge, OwnerAvatar, SourceBadge } from '../components/badges';
import { TableScroll } from '../components/TableScroll';
import { can, dateShort, fiscalYear, meetsAny, toDate, useStore } from '../../core';
import type { AttentionItem, StatSpec } from '../../core';
import { MODULES } from '../../modules';
import { mayOpen } from '../access';

/**
 * The dashboard is composed, not written: every enabled module contributes its
 * stats, its attention rows and its panels. Core only arranges them.
 */

/** Overdue first, then by date, then by what it is. */
const STATUS_RANK: Record<AttentionItem['status'], number> = { overdue: 0, 'due-soon': 1, info: 2 };

function byUrgency(a: AttentionItem, b: AttentionItem): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    a.date.localeCompare(b.date) ||
    a.label.localeCompare(b.label)
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { state, today, user } = useStore();

  const enabled = MODULES.filter(m => state.core.settings.enabledModules.includes(m.id));
  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);

  // A stat or a row shows only to a role that may follow its link (decision 0001).
  const visible = (x: { requires?: StatSpec['requires']; href?: string }) =>
    x.requires ? meetsAny(user.role, x.requires) : !x.href || mayOpen(user, x.href, state);
  const stats: StatSpec[] = enabled
    .flatMap(m => m.dashboard?.stats?.(state, today) ?? [])
    .filter(visible);
  const attention = enabled
    .flatMap(m => m.dashboard?.attention?.(state, today) ?? [])
    .filter(visible)
    .sort(byUrgency);
  const panels = enabled
    .flatMap(m => m.dashboard?.panels ?? [])
    .filter(p => meetsAny(user.role, p.requires))
    .map(p => p.component);

  // Four cards fit the row. A fifth is written into the Attention header instead.
  const shown = stats.slice(0, 4);
  const spare = stats[4];

  const canAddGrant =
    state.core.settings.enabledModules.includes('grants') && can(user.role, 'grants', 'edit');

  // Core says the day and the fiscal year; each module adds its own few words.
  const subtitle = [
    `${format(toDate(today), 'EEEE, MMMM d')} · ${fy.label}`,
    ...enabled.flatMap(m => m.dashboard?.subtitle?.(state, today) ?? []),
  ].join(' · ');

  usePageHeader({
    title: 'Dashboard',
    subtitle,
    actions: canAddGrant ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => nav('/grants?add=1')}
      >
        Add grant
      </Button>
    ) : undefined,
  });

  return (
    <>
      {shown.length > 0 && (
        <div className="ja-grid-stats">
          {shown.map(s => {
            const card = (
              <StatCard
                label={s.label}
                value={s.value}
                unit={s.unit}
                accent={s.accent}
                footnote={s.footnote}
              />
            );
            const href = s.href;
            return href ? (
              <div key={s.id} onClick={() => nav(href)} style={{ cursor: 'pointer' }}>
                {card}
              </div>
            ) : (
              <React.Fragment key={s.id}>{card}</React.Fragment>
            );
          })}
        </div>
      )}

      <div className="ja-split" style={{ gap: 'var(--space-4)' }}>
        <Card
          title="Attention"
          subtitle={
            spare ? `${spare.label}: ${spare.value}` : 'Overdue and due in the next 14 days'
          }
          padding="0"
        >
          {attention.length === 0 ? (
            <EmptyState
              icon={<Icon name="check" size={22} />}
              title="Nothing needs attention"
              message="Deadlines, reports, roll calls and hours waiting for approval show up here when they are overdue or due in the next 14 days."
            />
          ) : (
            <TableScroll minWidth={680}>
              <DataTable
                rows={attention}
                onRowClick={(row: AttentionItem) => nav(row.href)}
                columns={[
                  {
                    key: 'date',
                    label: 'Date',
                    width: '90px',
                    mono: true,
                    render: (d: AttentionItem) => dateShort(d.date),
                  },
                  {
                    key: 'what',
                    label: 'What',
                    width: '1fr',
                    strong: true,
                    render: (d: AttentionItem) => d.label,
                  },
                  {
                    key: 'detail',
                    label: 'Detail',
                    width: '1.4fr',
                    render: (d: AttentionItem) => (
                      <span style={{ color: 'var(--text-muted)' }}>{d.detail}</span>
                    ),
                  },
                  {
                    key: 'source',
                    label: 'Module',
                    width: '100px',
                    render: (d: AttentionItem) => <SourceBadge source={d.source} />,
                  },
                  {
                    key: 'owner',
                    label: 'Owner',
                    width: '40px',
                    render: (d: AttentionItem) => <OwnerAvatar staffId={d.ownerId} />,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    width: '110px',
                    render: (d: AttentionItem) => <AttentionStatusBadge status={d.status} />,
                  },
                ]}
              />
            </TableScroll>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {panels.map((Panel, i) => (
            <Panel key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
