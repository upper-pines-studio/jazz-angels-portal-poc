import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../../../app/Shell';
import { Button, Card, EmptyState, Icon, Tabs } from '../../../design-system';
import { programName, staffById, useStore } from '../../../core';
import { availableTransitions, funderById, grantById } from '../domain';
import type { Transition } from '../domain';
import { PhaseStepper } from './grant/PhaseStepper';
import { TransitionDialog } from './grant/TransitionDialog';
import { ChecklistTab } from './grant/ChecklistTab';
import { DocumentsTab } from './grant/DocumentsTab';
import { MoneyTab } from './grant/MoneyTab';
import { ReportsTab } from './grant/ReportsTab';
import { ProgramNumbers } from './grant/ProgramNumbers';
import { ActivityTab } from './grant/ActivityTab';
import { SideCards } from './grant/SideCards';

/** One grant: where it is, what is left to do, and — once awarded — where the money went. */

const TABS = [
  { id: 'checklist', label: 'Checklist' },
  { id: 'documents', label: 'Documents' },
  { id: 'money', label: 'Money' },
  { id: 'reports', label: 'Reports' },
  { id: 'activity', label: 'Activity' },
];

export default function GrantDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = React.useState<Transition | null>(null);

  const grant = grantById(state, id);
  const funder = grant ? funderById(state, grant.funderId) : undefined;
  const owner = grant ? staffById(state, grant.ownerId) : undefined;
  const transitions = grant ? availableTransitions(grant) : [];

  usePageHeader(grant
    ? {
      title: grant.title,
      subtitle: [funder?.name, programName(state, grant.program), owner?.name].filter(Boolean).join(' · '),
      crumbs: [{ label: 'Grants', href: '/grants' }, { label: funder?.name ?? 'Grant' }],
      actions: (
        <div className="ja-actions">
          {transitions.slice().reverse().map(t => (
            <Button key={t.to} size="sm"
              variant={t.kind === 'primary' ? 'primary' : 'secondary'}
              style={t.kind === 'danger' ? { color: 'var(--danger-500)' } : undefined}
              onClick={() => setPending(t)}>
              {t.label}
            </Button>
          ))}
        </div>
      ),
    }
    : { title: 'Grant', crumbs: [{ label: 'Grants', href: '/grants' }] });

  if (!grant) {
    return (
      <Card>
        <EmptyState icon={<Icon name="landmark" size={22} />} title="This grant doesn't exist"
          message="The link may be out of date, or the grant was removed. Every grant we track is on the grants list."
          action={<Button variant="primary" onClick={() => nav('/grants')}>Go to all grants</Button>} />
      </Card>
    );
  }

  const tab = params.get('tab') ?? 'checklist';
  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'checklist') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  return (
    <>
      <PhaseStepper grant={grant} />

      <div className="ja-split" style={{ gap: 'var(--space-5)' }}>
        {/* The tab panel, and under it any card the tab hangs off itself: one
            card never nests inside another. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
          <Card padding="0">
            <div style={{ padding: 'var(--space-3) var(--space-6) 0' }}>
              <div className="ja-tabs-scroll">
                <Tabs tabs={TABS} active={tab} onChange={setTab} style={{ borderBottom: 0 }} />
              </div>
            </div>
            {tab === 'checklist' && <ChecklistTab grant={grant} />}
            {tab === 'documents' && <DocumentsTab grant={grant} />}
            {tab === 'money' && <MoneyTab grant={grant} />}
            {tab === 'reports' && <ReportsTab grant={grant} />}
            {tab === 'activity' && <ActivityTab grant={grant} />}
          </Card>

          {tab === 'reports' && <ProgramNumbers grant={grant} />}
        </div>

        <SideCards grant={grant} />
      </div>

      {pending && <TransitionDialog grant={grant} transition={pending} onClose={() => setPending(null)} />}
    </>
  );
}
