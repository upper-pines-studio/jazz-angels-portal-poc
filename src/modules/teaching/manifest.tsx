import React from 'react';
import type { AttentionItem, ModuleManifest, PortalState, StatSpec } from '../../core';
import {
  ensembleById,
  enrolledCount,
  mayTakeRoll,
  recentAttendance,
  sessionWeekLabel,
  teachingSlice,
  termForDate,
  timeLabel,
  unsubmittedRollCalls,
} from './domain';
import { TodayPanel } from './screens/TodayPanel';
import Schedule from './screens/Schedule';
import RollCall from './screens/RollCall';
import Students from './screens/Students';

function stats(state: PortalState, today: string): StatSpec[] {
  const term = termForDate(state, today);
  const ensembles = state.teaching.ensembles.length;

  const enrolled: StatSpec = {
    id: 'teaching-enrolled',
    label: 'Enrolled',
    value: String(enrolledCount(state)),
    accent: 'var(--blue-500)',
    href: '/students',
    footnote: `${term?.name ?? 'No session scheduled'} · ${ensembles === 0 ? 'no ensembles yet' : `${ensembles} ${ensembles === 1 ? 'ensemble' : 'ensembles'}`}`,
  };

  // Week 1 of a session has one roll call in it, so the figure comes from the
  // last term until there are four weeks of this one to average. No rolls
  // anywhere and the stat stays off the row rather than reading as zero.
  const attendance = recentAttendance(state, today);
  if (!attendance) return [enrolled];

  return [
    enrolled,
    {
      id: 'teaching-attendance',
      label: 'Attendance',
      value: String(Math.round(attendance.rate * 100)),
      unit: '%',
      accent: 'var(--teal-500)',
      href: '/schedule',
      footnote: attendance.footnote,
    },
  ];
}

/** "Fall session week 1", once a session is running. */
function subtitle(state: PortalState, today: string): string | undefined {
  return sessionWeekLabel(state, today);
}

function attention(state: PortalState, today: string): AttentionItem[] {
  return unsubmittedRollCalls(state, today).map(meeting => {
    const ensemble = ensembleById(state, meeting.ensembleId);
    return {
      id: `teaching-roll-${meeting.id}`,
      date: meeting.date,
      label: 'Roll call due',
      detail: `${ensemble?.name ?? 'Class'} · ${timeLabel(meeting.start)}`,
      status: meeting.date === today ? 'due-soon' : 'overdue',
      href: `/roll/${meeting.id}`,
      ownerId: ensemble?.leadStaffId,
      source: 'Teaching',
    };
  });
}

export const manifest: ModuleManifest = {
  id: 'teaching',
  label: 'Teaching',
  description: 'The class schedule, roll call and the student roster.',
  nav: {
    section: 'Teaching',
    items: [
      {
        path: '/schedule',
        label: 'Schedule',
        icon: 'calendar',
        badge: (state, today) => unsubmittedRollCalls(state, today).length,
      },
      { path: '/students', label: 'Students', icon: 'users' },
    ],
  },
  routes: [
    { path: '/schedule', element: <Schedule />, requires: { subject: 'schedule' } },
    {
      path: '/roll/:meetingId',
      element: <RollCall />,
      requires: { subject: 'roll-call' },
      // A teacher opens the roll call of a class they lead, and no other.
      allows: (user, state, params) => mayTakeRoll(state, user, params.meetingId),
    },
    { path: '/students', element: <Students />, requires: { subject: 'students' } },
  ],
  dashboard: {
    stats,
    subtitle,
    attention,
    panels: [{ component: TodayPanel, requires: { subject: 'schedule' } }],
  },
  slice: teachingSlice,
};
