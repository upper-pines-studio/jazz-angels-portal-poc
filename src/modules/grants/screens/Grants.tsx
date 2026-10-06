import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../../../app/Shell';
import { PhaseBadge, DeadlineStatusBadge } from './badges';
import { OwnerAvatar } from '../../../app/components/badges';
import AddGrantDialog from './grants/AddGrantDialog';
import { TableScroll } from '../../../app/components/TableScroll';
import {
  Card,
  DataTable,
  Tabs,
  Input,
  Select,
  Button,
  Icon,
  EmptyState,
} from '../../../design-system';
import { useStore, programName, money, dateShort } from '../../../core';
import {
  grantsByView,
  nextDeadline,
  funderById,
  fyTotals,
  ALL_PHASES,
  PHASES,
  PRE_AWARD_PHASES,
} from '../domain';
import type { Grant, GrantView, Phase } from '../domain';

const VIEWS: Array<{ id: GrantView; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'pre-award', label: 'Pre-award' },
  { id: 'post-award', label: 'Post-award' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

const COLS = [
  { key: 'funder', label: 'Funder', width: '1.6fr', strong: true, wrap: true },
  { key: 'title', label: 'Grant', width: '1.6fr', wrap: true },
  { key: 'program', label: 'Program', width: '1.2fr' },
  { key: 'requested', label: 'Requested', width: '110px', align: 'right' as const, mono: true },
  { key: 'awarded', label: 'Awarded', width: '110px', align: 'right' as const, mono: true },
  { key: 'deadline', label: 'Next deadline', width: '130px' },
  { key: 'owner', label: 'Owner', width: '40px' },
  { key: 'phase', label: 'Phase', width: '120px' },
];

export default function Grants() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [view, setView] = React.useState<GrantView>('active');
  const [q, setQ] = React.useState('');
  const [owner, setOwner] = React.useState('all');
  const [program, setProgram] = React.useState('all');
  const [phase, setPhase] = React.useState<string>(params.get('phase') ?? 'all');
  const [adding, setAdding] = React.useState(params.get('add') === '1');

  // ?phase= preselects the filter, ?add=1 opens the dialog; both are one-shot.
  React.useEffect(() => {
    const wantPhase = params.get('phase');
    const wantAdd = params.get('add') === '1';
    if (!wantPhase && !wantAdd) return;
    if (wantPhase) {
      setPhase(wantPhase);
      setView('all');
    }
    if (wantAdd) setAdding(true);
    const next = new URLSearchParams(params);
    next.delete('phase');
    next.delete('add');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const fy = fyTotals(state, today);
  const activeCount = grantsByView(state, 'active').length;
  const pipeline = state.grants.grants
    .filter(g => PRE_AWARD_PHASES.includes(g.phase))
    .reduce((sum, g) => sum + (g.amountRequested ?? 0), 0);

  usePageHeader({
    title: 'Grants',
    subtitle: `${activeCount} active · ${money(pipeline)} in pipeline · ${money(fy.awarded)} awarded this FY`,
    actions: (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setAdding(true)}
      >
        Add grant
      </Button>
    ),
  });

  const tabs = VIEWS.map(v => ({
    id: v.id,
    label: v.label,
    count: grantsByView(state, v.id).length,
  }));

  const needle = q.trim().toLowerCase();
  const rows = grantsByView(state, view)
    .filter(g => owner === 'all' || g.ownerId === owner)
    .filter(g => program === 'all' || g.program === program)
    .filter(g => phase === 'all' || g.phase === phase)
    .filter(g => {
      if (!needle) return true;
      const funder = funderById(state, g.funderId)?.name ?? '';
      return g.title.toLowerCase().includes(needle) || funder.toLowerCase().includes(needle);
    })
    .map(g => ({ grant: g, deadline: nextDeadline(state, g.id, today) }))
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return a.grant.title.localeCompare(b.grant.title);
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.date.localeCompare(b.deadline.date);
    })
    .map(({ grant, deadline }) => ({ id: grant.id, grant, deadline }));

  type Row = { id: string; grant: Grant; deadline: ReturnType<typeof nextDeadline> };

  const columns = COLS.map(c => ({
    ...c,
    render: (r: Row) => {
      switch (c.key) {
        case 'funder':
          return funderById(state, r.grant.funderId)?.name ?? '—';
        case 'title':
          return r.grant.title;
        case 'program': {
          const name = programName(state, r.grant.program);
          return (
            <span title={name} style={{ color: 'var(--text-muted)' }}>
              {name}
            </span>
          );
        }
        case 'requested':
          return r.grant.amountRequested ? money(r.grant.amountRequested) : <Dash />;
        case 'awarded':
          return r.grant.amountAwarded ? money(r.grant.amountAwarded) : <Dash />;
        case 'deadline':
          return r.deadline ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ font: 'var(--type-numeric)' }}>{dateShort(r.deadline.date)}</span>
              <DeadlineStatusBadge status={r.deadline.status} />
            </span>
          ) : (
            <Dash />
          );
        case 'owner':
          return <OwnerAvatar staffId={r.grant.ownerId} />;
        case 'phase':
          return <PhaseBadge phase={r.grant.phase} />;
        default:
          return null;
      }
    },
  }));

  return (
    <>
      <div className="ja-tabs-scroll">
        <Tabs
          tabs={tabs}
          active={view}
          onChange={id => setView(id as GrantView)}
          style={{ borderBottom: 0 }}
        />
      </div>
      <Card padding="0">
        <div
          className="ja-filter-bar"
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: 'var(--border-width) solid var(--border-subtle)',
          }}
        >
          <div className="ja-filter-bar__search">
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search funders or grants"
              prefix={<Icon name="search" size={15} />}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ja-filter-bar__select">
            <Select
              value={owner}
              onChange={e => setOwner(e.target.value)}
              options={[
                { value: 'all', label: 'All owners' },
                ...state.core.staff.map(s => ({ value: s.id, label: s.name })),
              ]}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ja-filter-bar__select">
            <Select
              value={program}
              onChange={e => setProgram(e.target.value)}
              options={[
                { value: 'all', label: 'All programs' },
                ...state.core.programs.map(p => ({ value: p.id, label: p.name })),
              ]}
              style={{ width: '100%' }}
            />
          </div>
          <div className="ja-filter-bar__select">
            <Select
              value={phase}
              onChange={e => setPhase(e.target.value)}
              options={[
                { value: 'all', label: 'All phases' },
                ...ALL_PHASES.map((p: Phase) => ({ value: p, label: PHASES[p].label })),
              ]}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="landmark" size={22} />}
            title="Nothing here yet"
            message="No grants in this view yet. Add a grant to start tracking it."
            action={
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Icon name="plus" size={15} />}
                onClick={() => setAdding(true)}
              >
                Add grant
              </Button>
            }
          />
        ) : (
          <TableScroll minWidth={900}>
            <DataTable
              columns={columns}
              rows={rows}
              onRowClick={(r: Row) => nav(`/grants/${r.id}`)}
            />
          </TableScroll>
        )}
      </Card>
      {adding && <AddGrantDialog open onClose={() => setAdding(false)} />}
    </>
  );
}

function Dash() {
  return <span style={{ color: 'var(--text-faint)' }}>—</span>;
}
