import React from 'react';
import { money } from '../../core';
import type { AttentionItem, ModuleManifest, PortalState, StatSpec } from '../../core';
import { deadlines, funderById, fyTotals, grantById, grantsSlice, isPreAward } from './domain';
import type { Phase } from './domain';
import { funderShort } from './screens/deadlines/helpers';
import { PipelinePanel } from './screens/PipelinePanel';
import Grants from './screens/Grants';
import GrantDetail from './screens/GrantDetail';
import DeadlinesScreen from './screens/Deadlines';
import Funders from './screens/Funders';
import FunderDetail from './screens/FunderDetail';
import Playbook from './screens/Playbook';

/** Phases whose award money actually landed (declined/withdrawn never count). */
const WON_PHASES: Phase[] = ['awarded', 'active', 'reporting', 'closed'];

/** Overdue and due-soon deadlines: the number on the rail and on the dashboard. */
function needsAttention(state: PortalState, today: string) {
  return deadlines(state, today).filter(d => d.status !== 'upcoming');
}

function stats(state: PortalState, today: string): StatSpec[] {
  const fy = fyTotals(state, today);

  const won = state.grants.grants.filter(
    g => g.dates.decided && g.dates.decided >= fy.start && g.dates.decided <= fy.end && WON_PHASES.includes(g.phase),
  );
  const wonFunders = won.map(g => funderShort(funderById(state, g.funderId)?.name, 20)).join(', ');

  const preAward = state.grants.grants.filter(g => isPreAward(g.phase));
  const inPipeline = preAward.reduce((sum, g) => sum + (g.amountRequested ?? 0), 0);
  const thisMonth = today.slice(0, 7);
  const dueThisMonth = preAward.filter(
    g => [g.dates.loiDue, g.dates.applicationDue].some(d => d?.startsWith(thisMonth)),
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

function attention(state: PortalState, today: string): AttentionItem[] {
  return needsAttention(state, today).map(d => {
    const grant = grantById(state, d.grantId);
    const funder = grant && funderById(state, grant.funderId);
    return {
      id: d.id,
      date: d.date,
      label: d.label,
      detail: `${grant?.title ?? 'Grant'} — ${funder?.name ?? 'Unknown funder'}`,
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
  description: 'Every grant from prospect to closed: deadlines, money, reports and the Playbook.',
  nav: {
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
  routes: [
    { path: '/grants', element: <Grants /> },
    { path: '/grants/:id', element: <GrantDetail /> },
    { path: '/deadlines', element: <DeadlinesScreen /> },
    { path: '/funders', element: <Funders /> },
    { path: '/funders/:id', element: <FunderDetail /> },
    { path: '/playbook', element: <Playbook /> },
  ],
  dashboard: { stats, attention, panels: [PipelinePanel] },
  slice: grantsSlice,
};
