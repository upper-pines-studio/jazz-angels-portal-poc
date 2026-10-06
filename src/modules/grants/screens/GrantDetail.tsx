import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePageHeader } from '../../../app/Shell';
import { Button, Card, EmptyState, Icon, Tabs } from '../../../design-system';
import { programName, staffById, useStore } from '../../../core';
import {
  availableTransitions,
  funderById,
  grantById,
  grantFiles,
  isPostAward,
  mayMoveTo,
} from '../domain';
import type { Transition } from '../domain';
import { PhaseStepper } from './grant/PhaseStepper';
import { TransitionDialog } from './grant/TransitionDialog';
import { ChecklistTab } from './grant/ChecklistTab';
import { DocumentsTab } from './grant/DocumentsTab';
import { AwardAside, AwardTab } from './grant/AwardTab';
import { BudgetTab } from './grant/BudgetTab';
import { ExpenseAside, ExpensesTab } from './grant/ExpensesTab';
import { QuickBooksStatus } from './money/shared';
import { ReportsTab } from './grant/ReportsTab';
import { ProgramNumbers } from './grant/ProgramNumbers';
import { ActivityTab } from './grant/ActivityTab';
import { SideCards } from './grant/SideCards';

/** One grant: where it is, what is left to do, and — once awarded — where the money went. */

/** Tabs whose numbers come from QuickBooks, so the top bar says when it last synced. */
const QUICKBOOKS_TABS = ['budget', 'expenses'];

export default function GrantDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { state, user } = useStore();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = React.useState<Transition | null>(null);

  const grant = grantById(state, id);
  const funder = grant ? funderById(state, grant.funderId) : undefined;
  const owner = grant ? staffById(state, grant.ownerId) : undefined;
  // Only the moves this role may make, as the store asks: recording an award
  // also needs the award row.
  const transitions = grant
    ? availableTransitions(grant).filter(t => mayMoveTo(user.role, t.to))
    : [];

  usePageHeader(
    grant
      ? {
          title: grant.title,
          subtitle: [funder?.name, programName(state, grant.program), owner?.name]
            .filter(Boolean)
            .join(' · '),
          crumbs: [{ label: 'Grants', href: '/grants' }, { label: funder?.name ?? 'Grant' }],
          actions: (
            <div className="ja-actions">
              {QUICKBOOKS_TABS.includes(params.get('tab') ?? '') && (
                <span className="ja-hide-md">
                  <QuickBooksStatus />
                </span>
              )}
              {transitions
                .slice()
                .reverse()
                .map(t => (
                  <Button
                    key={t.to}
                    size="sm"
                    variant={t.kind === 'primary' ? 'primary' : 'secondary'}
                    style={t.kind === 'danger' ? { color: 'var(--danger-500)' } : undefined}
                    onClick={() => setPending(t)}
                  >
                    {t.label}
                  </Button>
                ))}
            </div>
          ),
        }
      : { title: 'Grant', crumbs: [{ label: 'Grants', href: '/grants' }] },
  );

  if (!grant) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="landmark" size={22} />}
          title="This grant doesn't exist"
          message="The link may be out of date, or the grant was removed. Every grant we track is on the grants list."
          action={
            <Button variant="primary" onClick={() => nav('/grants')}>
              Go to all grants
            </Button>
          }
        />
      </Card>
    );
  }

  // Before the award a grant is a checklist. After it, it is a record of money.
  const postAward = isPostAward(grant.phase);
  const count = (n: number) => n || undefined;
  const tabs = postAward
    ? [
        { id: 'award', label: 'Award' },
        {
          id: 'budget',
          label: 'Budget',
          count: count(state.grants.budgetLines.filter(l => l.grantId === grant.id).length),
        },
        {
          id: 'expenses',
          label: 'Expenses',
          count: count(state.grants.expenses.filter(e => e.grantId === grant.id).length),
        },
        { id: 'reports', label: 'Reports' },
        { id: 'documents', label: 'Documents', count: count(grantFiles(state, grant.id).length) },
        { id: 'checklist', label: 'Checklist' },
        { id: 'activity', label: 'Activity' },
      ]
    : [
        { id: 'checklist', label: 'Checklist' },
        { id: 'documents', label: 'Documents' },
        { id: 'activity', label: 'Activity' },
      ];
  const first = tabs[0].id;
  const asked = params.get('tab');
  const tab = tabs.some(t => t.id === asked) ? (asked as string) : first;
  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(params);
    // What is selected inside one tab means nothing on the next.
    nextParams.delete('expense');
    nextParams.delete('backup');
    if (next === first) nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  // The budget is a wide table and takes the whole row; every other tab keeps a column beside it.
  const aside =
    tab === 'budget' ? null : tab === 'award' ? (
      <AwardAside grant={grant} />
    ) : tab === 'expenses' ? (
      <ExpenseAside grant={grant} />
    ) : (
      <SideCards grant={grant} />
    );

  return (
    <>
      <PhaseStepper grant={grant} />

      <div className={aside ? 'ja-split' : undefined} style={{ gap: 'var(--space-5)' }}>
        {/* The tab panel, and under it any card the tab hangs off itself: one
            card never nests inside another. */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}
        >
          <Card padding="0">
            <div style={{ padding: 'var(--space-3) var(--space-6) 0' }}>
              <div className="ja-tabs-scroll">
                <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ borderBottom: 0 }} />
              </div>
            </div>
            {tab === 'checklist' && <ChecklistTab grant={grant} />}
            {tab === 'documents' && <DocumentsTab grant={grant} />}
            {tab === 'award' && <AwardTab grant={grant} />}
            {tab === 'budget' && <BudgetTab grant={grant} />}
            {tab === 'expenses' && <ExpensesTab grant={grant} />}
            {tab === 'reports' && <ReportsTab grant={grant} />}
            {tab === 'activity' && <ActivityTab grant={grant} />}
          </Card>

          {tab === 'reports' && <ProgramNumbers grant={grant} />}
        </div>

        {aside}
      </div>

      {pending && transitions.some(t => t.to === pending.to) && (
        <TransitionDialog grant={grant} transition={pending} onClose={() => setPending(null)} />
      )}
    </>
  );
}
