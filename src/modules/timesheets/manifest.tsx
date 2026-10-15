import React from 'react';
import { staffById } from '../../core';
import type {
  AttentionItem,
  ModuleManifest,
  PortalState,
  Requirement,
  SignedInUser,
  StatSpec,
} from '../../core';
import {
  awaitingApproval,
  formatHours,
  hoursThisMonth,
  sentBackAttention,
  teachersThisMonth,
  timesheetsSlice,
  waitingOn,
} from './domain';
import Timesheets from './screens/Timesheets';

const APPROVE: Requirement = { subject: 'timesheets-approve' };

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
      footnote: teachers
        ? `Across ${teachers} ${teachers === 1 ? 'teacher' : 'teachers'}`
        : 'Nothing logged this month',
    },
  ];
}

function attention(state: PortalState, today: string, user: SignedInUser): AttentionItem[] {
  // The person's own hours the office sent back: theirs alone, one row each.
  return [...sentBackAttention(state, user), ...awaitingAttention(state, today)];
}

function awaitingAttention(state: PortalState, today: string): AttentionItem[] {
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
        // What is waiting on this person: hours to approve, and their own hours sent back.
        badge: (state, _today, user) => waitingOn(state, user),
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
