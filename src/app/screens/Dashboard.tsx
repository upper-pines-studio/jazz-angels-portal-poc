import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';
import { Button, Card, DataTable, EmptyState, Icon, StatCard } from '../../design-system';
import { usePageHeader } from '../Shell';
import { DeadlineKindBadge, DeadlineStatusBadge, Eyebrow, OwnerAvatar, PhaseBadge } from '../components/badges';
import { funderShort } from './deadlines/helpers';
import {
  dateShort, daysUntil, deadlines, funderById, fyTotals, grantById, isPreAward,
  money, PHASES, pipelineCounts, toDate, toISO, useStore,
} from '../../domain';
import type { Deadline, Phase, PhaseTone } from '../../domain';

const TONE_COLOR: Record<PhaseTone, string> = {
  neutral: 'var(--neutral-300)',
  blue: 'var(--blue-500)',
  teal: 'var(--teal-500)',
  olive: 'var(--olive-500)',
  gold: 'var(--gold-400)',
  danger: 'var(--danger-500)',
};

/** Phases whose award money actually landed (declined/withdrawn never count). */
const WON_PHASES: Phase[] = ['awarded', 'active', 'reporting', 'closed'];

const MONO_SM = 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)';

interface UpWeek {
  label: string;
  items: Deadline[];
}

/** The next-30-days list split into three columns: two calendar weeks, then the rest. */
function comingUpWeeks(items: Deadline[]): UpWeek[] {
  const weekOf = (iso: string) => toISO(startOfWeek(toDate(iso), { weekStartsOn: 1 }));
  const keys: string[] = [];
  for (const d of items) {
    const k = weekOf(d.date);
    if (!keys.includes(k)) keys.push(k);
  }
  const cols: UpWeek[] = [];
  for (let i = 0; i < 3 && i < keys.length; i++) {
    const rows = i < 2
      ? items.filter(d => weekOf(d.date) === keys[i])
      : items.filter(d => keys.indexOf(weekOf(d.date)) >= 2);
    const spansOneWeek = i < 2 || keys.length === 3;
    cols.push({
      label: spansOneWeek
        ? `Week of ${dateShort(keys[i])}`
        : `${dateShort(rows[0].date)} – ${dateShort(rows[rows.length - 1].date)}`,
      items: rows,
    });
  }
  return cols;
}

export default function Dashboard() {
  const nav = useNavigate();
  const { state, today } = useStore();

  const fy = fyTotals(state, today);
  const all = deadlines(state, today);
  const attention = all.filter(d => d.status !== 'upcoming');

  usePageHeader({
    title: 'Dashboard',
    subtitle: `${format(toDate(today), 'EEEE, MMMM d')} · ${fy.label}`,
    actions: (
      <Button variant="primary" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={() => nav('/grants?add=1')}>
        Add grant
      </Button>
    ),
  });

  // --- stat row -------------------------------------------------------------
  const wonThisFy = state.grants.filter(
    g => g.dates.decided && g.dates.decided >= fy.start && g.dates.decided <= fy.end && WON_PHASES.includes(g.phase),
  );
  const wonFunders = wonThisFy.map(g => funderShort(funderById(state, g.funderId)?.name, 20)).join(', ');

  const preAward = state.grants.filter(g => isPreAward(g.phase));
  const inPipeline = preAward.reduce((sum, g) => sum + (g.amountRequested ?? 0), 0);
  const thisMonth = today.slice(0, 7);
  const dueThisMonth = preAward.filter(
    g => [g.dates.loiDue, g.dates.applicationDue].some(d => d?.startsWith(thisMonth)),
  ).length;

  const nextPayment = state.payments
    .filter(p => !p.receivedDate)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  const overdueCount = attention.filter(d => d.status === 'overdue').length;
  const nextAttention = attention.find(d => d.date >= today) ?? attention[0];

  // --- pipeline -------------------------------------------------------------
  const buckets = pipelineCounts(state);
  const stepper = buckets.slice(0, 8);
  const peak = Math.max(1, ...stepper.map(b => b.count));
  const countFor = (phase: Phase) => buckets.find(b => b.phase === phase)?.count ?? 0;

  // --- coming up ------------------------------------------------------------
  const upcoming = all.filter(d => d.status !== 'overdue' && daysUntil(d.date, today) <= 30);
  const weeks = comingUpWeeks(upcoming);

  const grantLine = (d: Deadline) => {
    const g = grantById(state, d.grantId);
    const f = g && funderById(state, g.funderId);
    return `${g?.title ?? 'Grant'} — ${f?.name ?? 'Unknown funder'}`;
  };
  const funderOf = (d: Deadline) => {
    const g = grantById(state, d.grantId);
    return funderShort(g && funderById(state, g.funderId)?.name);
  };
  const openGrant = (d: Deadline) => nav(`/grants/${d.grantId}`);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
        <StatCard
          label="Awarded this FY"
          value={money(fy.awarded)}
          accent="var(--gold-400)"
          footnote={
            wonThisFy.length
              ? `${wonThisFy.length} ${wonThisFy.length === 1 ? 'grant' : 'grants'} · ${wonFunders}`
              : `No awards yet in ${fy.label}`
          }
        />
        <StatCard
          label="In pipeline"
          value={money(inPipeline)}
          accent="var(--blue-500)"
          footnote={`${preAward.length} ${preAward.length === 1 ? 'application' : 'applications'} · ${dueThisMonth} due this month`}
        />
        <StatCard
          label="Received of awarded"
          value={money(fy.received)}
          unit={`of ${money(fy.awarded)}`}
          accent="var(--teal-500)"
          footnote={
            nextPayment
              ? `Next payment ${dateShort(nextPayment.expectedDate)} · ${money(nextPayment.amount)}`
              : 'Every installment has arrived'
          }
        />
        <StatCard
          label="Needs attention"
          value={attention.length}
          accent="var(--danger-500)"
          delta={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
          deltaTone="danger"
          footnote={nextAttention ? `Next: ${nextAttention.label} ${dateShort(nextAttention.date)}` : 'Nothing due in the next 14 days'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
        <Card
          title="Attention"
          subtitle="Overdue and due in the next 14 days"
          padding="0"
          action={<Button variant="ghost" size="sm" onClick={() => nav('/deadlines')}>View all</Button>}
        >
          {attention.length === 0 ? (
            <EmptyState
              icon={<Icon name="check" size={22} />}
              title="You're caught up"
              message="Nothing overdue or due in the next 14 days."
            />
          ) : (
            <DataTable
              rows={attention}
              onRowClick={openGrant}
              columns={[
                { key: 'date', label: 'Date', width: '90px', mono: true, render: (d: Deadline) => dateShort(d.date) },
                { key: 'what', label: 'What', width: '1fr', strong: true, render: (d: Deadline) => d.label },
                {
                  key: 'grant', label: 'Grant', width: '1.4fr',
                  render: (d: Deadline) => <span style={{ color: 'var(--text-muted)' }}>{grantLine(d)}</span>,
                },
                { key: 'owner', label: 'Owner', width: '40px', render: (d: Deadline) => <OwnerAvatar staffId={d.ownerId} /> },
                { key: 'status', label: 'Status', width: '110px', render: (d: Deadline) => <DeadlineStatusBadge status={d.status} /> },
              ]}
            />
          )}
        </Card>

        <Card title="Pipeline" padding="var(--space-4) var(--space-5)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {stepper.map(b => (
              <div
                key={b.phase}
                onClick={() => nav(`/grants?phase=${b.phase}`)}
                style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <PhaseBadge phase={b.phase} />
                  <span style={{ marginLeft: 'auto', font: MONO_SM, color: b.count ? 'var(--text-body)' : 'var(--text-faint)' }}>
                    {b.count}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: 'var(--neutral-100)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${(b.count / peak) * 100}%`,
                    background: TONE_COLOR[PHASES[b.phase].tone],
                  }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)',
            borderTop: 'var(--border-width) solid var(--border-subtle)',
            font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          }}>
            Declined {countFor('declined')} · Withdrawn {countFor('withdrawn')}
          </div>
        </Card>
      </div>

      <Card
        title="Coming up"
        subtitle="Next 30 days"
        padding="var(--space-4) var(--space-6)"
        action={<Button variant="secondary" size="sm" onClick={() => nav('/deadlines?view=calendar')}>Open calendar</Button>}
      >
        {weeks.length === 0 ? (
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            Nothing is due in the next 30 days. Dates appear here as soon as a grant has one.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-6)' }}>
            {weeks.map(col => (
              <div key={col.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Eyebrow style={{ color: 'var(--teal-500)' }}>{col.label}</Eyebrow>
                {col.items.map(d => (
                  <div
                    key={d.id}
                    onClick={() => openGrant(d)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, height: 20, cursor: 'pointer' }}
                  >
                    <span style={{ flex: '0 0 44px', font: 'var(--weight-medium) var(--text-2xs)/1.3 var(--font-mono)', color: 'var(--text-muted)' }}>
                      {dateShort(d.date)}
                    </span>
                    <span style={{
                      flex: '0 1 auto', minWidth: 0, font: 'var(--weight-regular) var(--text-xs)/1.3 var(--font-sans)',
                      color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {d.label}
                    </span>
                    <span style={{
                      flex: '1 1 0', minWidth: 0, font: 'var(--weight-regular) var(--text-2xs)/1.3 var(--font-sans)',
                      color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {funderOf(d)}
                    </span>
                    <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}><DeadlineKindBadge kind={d.kind} /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
