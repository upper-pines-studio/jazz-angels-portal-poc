import React from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { Button, Card, DataTable, EmptyState, Icon, StatCard } from '../../design-system';
import { usePageHeader } from '../Shell';
import { AttentionStatusBadge, OwnerAvatar, SourceBadge } from '../components/badges';
import { TableScroll } from '../components/TableScroll';
import { can, dateShort, fiscalYear, meetsAny, toDate, useStore } from '../../core';
import type { AttentionItem, StatSpec } from '../../core';
import { MODULES } from '../../modules';
import { mayOpen } from '../access';
import { officeDocumentAttention } from './documents/status';
import { useSignInLines } from '../components/signIns';

/**
 * The dashboard is composed, not written: every enabled module contributes its
 * stats, its attention rows and its panels, and core arranges them. Core's one
 * contribution of its own is the office's documents that are out of date or
 * expire soon (decision 0005), added here for the roles that may open them,
 * and, when the portal runs on Supabase, the invitations sent and accepted,
 * which every Admin sees (decision 0001, "Sign-ins are by invitation").
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
  const mayDocuments = can(user.role, 'office-documents');
  const attention = [
    ...enabled.flatMap(m => m.dashboard?.attention?.(state, today, user) ?? []),
    ...(mayDocuments ? officeDocumentAttention(state, today) : []),
  ]
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
            spare ? `${spare.label}: ${spare.value}` : 'Overdue first, then what is coming up'
          }
          padding="0"
        >
          {attention.length === 0 ? (
            <EmptyState
              icon={<Icon name="check" size={22} />}
              title="Nothing needs attention"
              message={
                'Deadlines, reports, roll calls, hours waiting for approval and your own hours sent back to fix show up here when they are overdue or due in the next 14 days.' +
                (mayDocuments
                  ? ' So do office documents that are out of date or expire within 30 days.'
                  : '')
              }
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
                    render: (d: AttentionItem) => (
                      <AttentionStatusBadge
                        status={d.status}
                        label={d.statusLabel}
                        outlined={d.statusOutlined}
                      />
                    ),
                  },
                ]}
              />
            </TableScroll>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {user.role === 'admin' && <SignInsCard />}
          {panels.map((Panel, i) => (
            <Panel key={i} />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * The newest invitations and first sign-ins, from the activity log, for an Admin (#157). Shows
 * only when the portal runs on Supabase and there is something to say.
 */
function SignInsCard() {
  const { state } = useStore();
  const { status, lines } = useSignInLines(true);
  if (status !== 'ready' || lines.length === 0) return null;
  const nameOf = (id: string | null) => state.core.staff.find(s => s.id === id)?.name ?? 'Someone';
  return (
    <Card title="Sign-ins" subtitle="Invitations sent and accepted, newest first">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {lines.map(line => (
          <li key={line.id} style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Icon
              name={line.event === 'accepted' ? 'log-in' : 'mail'}
              size={16}
              style={{ color: 'var(--text-muted)', marginTop: 3, flexShrink: 0 }}
            />
            <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
              <strong style={{ color: 'var(--text-strong)' }}>{nameOf(line.whoId)}</strong>{' '}
              {line.text.charAt(0).toLowerCase() + line.text.slice(1)}.{' '}
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {dateShort(line.at)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
