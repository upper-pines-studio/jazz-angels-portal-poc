import React from 'react';
import { staffById } from '../../core';
import type { AttentionItem, ModuleManifest, PortalState, Requirement, StatSpec } from '../../core';
import {
  awaitingApproval,
  formatHours,
  hoursThisMonth,
  teachersThisMonth,
  timesheetsSlice,
} from './domain';
import Timesheets from './screens/Timesheets';

const APPROVE: Requirement = { subject: 'timesheets-approve' };

/** The number on the rail and the one thing this module puts on the dashboard. */
function awaitingCount(state: PortalState): number {
  return awaitingApproval(state).length;
}

function stats(state: PortalState, today: string): StatSpec[] {
  const teachers = teachersThisMonth(state, today);
  return [
    {
      id: 'timesheets-hours',
      label: 'Teacher hours',
      value: formatHours(hoursThisMonth(state, today)),
      unit: 'hrs',
      accent: 'var(--olive-500)',
      href: '/timesheets',
      // Everyone's hours: for the roles that approve them.
      requires: APPROVE,
      footnote: `Across ${teachers} ${teachers === 1 ? 'teacher' : 'teachers'}`,
    },
  ];
}

function attention(state: PortalState, today: string): AttentionItem[] {
  const waiting = awaitingApproval(state);
  if (waiting.length === 0) return [];

  // One row for the lot, named so Barry knows whose hours are sitting there.
  const names = [...new Set(waiting.map(e => staffById(state, e.staffId)?.name ?? 'Unknown'))].sort(
    (a, b) => a.localeCompare(b),
  );
  return [
    {
      id: 'timesheets-awaiting',
      date: today,
      label: 'Timesheets awaiting approval',
      detail: names.join(', '),
      status: 'info',
      href: '/timesheets',
      requires: APPROVE,
      source: 'Timesheets',
    },
  ];
}

export const manifest: ModuleManifest = {
  id: 'timesheets',
  label: 'Timesheets',
  description: 'Teaching-artist hours: log them, approve them, report them.',
  nav: {
    section: 'Office',
    items: [
      {
        path: '/timesheets',
        label: 'Timesheets',
        icon: 'clock',
        badge: state => awaitingCount(state),
        // The rail item opens for anyone who logs hours or approves them.
        requires: [{ subject: 'timesheets-log' }, APPROVE],
      },
    ],
  },
  routes: [
    {
      path: '/timesheets',
      element: <Timesheets />,
      requires: [{ subject: 'timesheets-log' }, APPROVE],
    },
  ],
  dashboard: { stats, attention },
  slice: timesheetsSlice,
};
