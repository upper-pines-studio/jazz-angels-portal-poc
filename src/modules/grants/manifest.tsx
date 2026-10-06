import React from 'react';
import { money } from '../../core';
import type { AttentionItem, ModuleManifest, PortalState, StatSpec } from '../../core';
import {
  aboutMoney,
  deadlines,
  expensesMissingBackup,
  funderById,
  fyTotals,
  grantById,
  grantPace,
  grantsSlice,
  isPreAward,
  offPaceGrants,
  transactionCounts,
} from './domain';
import type { Phase } from './domain';
import { funderShort } from './screens/deadlines/helpers';
import { PipelinePanel } from './screens/PipelinePanel';
import Grants from './screens/Grants';
import GrantDetail from './screens/GrantDetail';
import DeadlinesScreen from './screens/Deadlines';
import Funders from './screens/Funders';
import FunderDetail from './screens/FunderDetail';
import Playbook from './screens/Playbook';
import Transactions from './screens/money/Transactions';
import BudgetVsActual from './screens/money/BudgetVsActual';
import SpendDown from './screens/money/SpendDown';
import { MoneyPanel } from './screens/money/MoneyPanel';
import { QuickBooksCard } from './screens/settings/QuickBooksCard';
import { RemindersCard } from './screens/settings/RemindersCard';

/** Phases whose award money actually landed (declined/withdrawn never count). */
const WON_PHASES: Phase[] = ['awarded', 'active', 'reporting', 'closed'];

/** Overdue and due-soon deadlines: the number on the rail and on the dashboard. */
function needsAttention(state: PortalState, today: string) {
  return deadlines(state, today).filter(d => d.status !== 'upcoming');
}

function stats(state: PortalState, today: string): StatSpec[] {
  const fy = fyTotals(state, today);

  const won = state.grants.grants.filter(
    g =>
      g.dates.decided &&
      g.dates.decided >= fy.start &&
      g.dates.decided <= fy.end &&
      WON_PHASES.includes(g.phase),
  );
  const wonFunders = won.map(g => funderShort(funderById(state, g.funderId)?.name, 20)).join(', ');

  const preAward = state.grants.grants.filter(g => isPreAward(g.phase));
  const inPipeline = preAward.reduce((sum, g) => sum + (g.amountRequested ?? 0), 0);
  const thisMonth = today.slice(0, 7);
  const dueThisMonth = preAward.filter(g =>
    [g.dates.loiDue, g.dates.applicationDue].some(d => d?.startsWith(thisMonth)),
  ).length;

  return [
    {
      id: 'grants-awarded',
      label: 'Awarded this FY',
      value: money(fy.awarded),
      accent: 'var(--gold-400)',
      href: '/grants',
      footnote: won.length
        ? `${won.length} ${won.length === 1 ? 'grant' : 'grants'} · ${wonFunders}`
        : `No awards yet in ${fy.label}`,
    },
    {
      id: 'grants-pipeline',
      label: 'In pipeline',
      value: money(inPipeline),
      accent: 'var(--blue-500)',
      href: '/grants?view=pre-award',
      footnote: `${preAward.length} ${preAward.length === 1 ? 'application' : 'applications'} · ${dueThisMonth} due this month`,
    },
  ];
}

/** Money that needs a decision: a grant off its pace, transactions waiting, receipts missing. */
function moneyAttention(state: PortalState, today: string): AttentionItem[] {
  const out: AttentionItem[] = [];

  for (const grant of offPaceGrants(state, today)) {
    const pace = grantPace(state, grant.id, today);
    const funder = funderById(state, grant.funderId);
    const fast = pace.status === 'spending-fast';
    out.push({
      id: `pace:${grant.id}`,
      date: (fast ? pace.runsOutOn : grant.dates.periodEnd) ?? today,
      label: fast ? 'Spending fast' : 'Spending slow',
      detail: fast
        ? `${grant.title} · ${funder?.name ?? 'Unknown funder'} · runs out at this rate`
        : `${grant.title} · ${funder?.name ?? 'Unknown funder'} · about ${aboutMoney(pace.projectedUnspent)} unspent at this rate`,
      status: fast ? 'due-soon' : 'info',
      href: '/spend-down',
      ownerId: grant.ownerId,
      source: 'Grants',
    });
  }

  const waiting = transactionCounts(state)['to-assign'];
  if (waiting > 0) {
    out.push({
      id: 'transactions:to-assign',
      date: today,
      label: `${waiting} ${waiting === 1 ? 'transaction' : 'transactions'} to assign`,
      detail: 'From QuickBooks, waiting for a grant and a budget line',
      status: 'info',
      href: '/transactions',
      ownerId: 's-denise',
      source: 'Grants',
    });
  }

  const missing = expensesMissingBackup(state);
  if (missing.length > 0) {
    out.push({
      id: 'backup:missing',
      date: today,
      label: `${missing.length} ${missing.length === 1 ? 'expense' : 'expenses'} missing a receipt`,
      detail: 'Attach the backup now, so it is there when a funder asks',
      status: 'info',
      href: `/grants/${missing[0].grantId}?tab=expenses&backup=missing`,
      ownerId: 's-denise',
      source: 'Grants',
    });
  }

  return out;
}

function attention(state: PortalState, today: string): AttentionItem[] {
  return [...deadlineAttention(state, today), ...moneyAttention(state, today)];
}

function deadlineAttention(state: PortalState, today: string): AttentionItem[] {
  return needsAttention(state, today).map(d => {
    const grant = grantById(state, d.grantId);
    const funder = grant && funderById(state, grant.funderId);
    return {
      id: d.id,
      date: d.date,
      label: d.label,
      detail: `${grant?.title ?? 'Grant'} · ${funder?.name ?? 'Unknown funder'}`,
      status: d.status === 'overdue' ? 'overdue' : 'due-soon',
      href: `/grants/${d.grantId}`,
      ownerId: d.ownerId,
      source: 'Grants',
    };
  });
}

export const manifest: ModuleManifest = {
  id: 'grants',
  label: 'Grants',
  description:
    'Every grant from prospect to closed: deadlines, reports, the Playbook, and the money once it is awarded.',
  nav: [
    {
      section: 'Grants',
      items: [
        { path: '/grants', label: 'All grants', icon: 'landmark' },
        {
          path: '/deadlines',
          label: 'Deadlines',
          icon: 'calendar-days',
          badge: (state, today) => needsAttention(state, today).length,
        },
        { path: '/funders', label: 'Funders', icon: 'building-2' },
        { path: '/playbook', label: 'Playbook', icon: 'book-open' },
      ],
    },
    {
      section: 'Money',
      items: [
        {
          path: '/transactions',
          label: 'Transactions',
          icon: 'receipt',
          badge: state => transactionCounts(state)['to-assign'],
        },
        { path: '/budget', label: 'Budget vs. actual', icon: 'chart-bar-big' },
        {
          path: '/spend-down',
          label: 'Spend-down',
          icon: 'gauge',
          badge: (state, today) => offPaceGrants(state, today).length,
        },
      ],
    },
  ],
  routes: [
    { path: '/grants', element: <Grants /> },
    { path: '/grants/:id', element: <GrantDetail /> },
    { path: '/deadlines', element: <DeadlinesScreen /> },
    { path: '/funders', element: <Funders /> },
    { path: '/funders/:id', element: <FunderDetail /> },
    { path: '/playbook', element: <Playbook /> },
    { path: '/transactions', element: <Transactions /> },
    { path: '/budget', element: <BudgetVsActual /> },
    { path: '/spend-down', element: <SpendDown /> },
  ],
  dashboard: { stats, attention, panels: [PipelinePanel, MoneyPanel] },
  settings: [QuickBooksCard, RemindersCard],
  slice: grantsSlice,
};
