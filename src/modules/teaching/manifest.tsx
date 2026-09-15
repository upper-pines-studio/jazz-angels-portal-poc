import React from 'react';
import { addDays } from 'date-fns';
import { toDate, toISO } from '../../core';
import type { AttentionItem, ModuleManifest, PortalState, StatSpec } from '../../core';
import {
  attendanceSummary, ensembleById, enrolledCount, teachingSlice, termForDate,
  timeLabel, unsubmittedRollCalls,
} from './domain';
import { TodayPanel } from './screens/TodayPanel';
import Schedule from './screens/Schedule';
import RollCall from './screens/RollCall';
import Students from './screens/Students';

/** The dashboard's attendance figure looks back four weeks of submitted rolls. */
const TREND_DAYS = 27;

function stats(state: PortalState, today: string): StatSpec[] {
  const term = termForDate(state, today);
  const ensembles = state.teaching.ensembles.length;

  const recent = attendanceSummary(state, {
    from: toISO(addDays(toDate(today), -TREND_DAYS)),
    to: today,
  });

  return [
    {
      id: 'teaching-enrolled',
      label: 'Enrolled',
      value: String(enrolledCount(state)),
      accent: 'var(--blue-500)',
      href: '/students',
      footnote: `${term?.name ?? 'No session scheduled'} · ${ensembles} ${ensembles === 1 ? 'ensemble' : 'ensembles'}`,
    },
    {
      id: 'teaching-attendance',
      label: 'Attendance',
      value: recent.meetings ? String(Math.round(recent.attendanceRate * 100)) : '—',
      unit: recent.meetings ? '%' : undefined,
      accent: 'var(--teal-500)',
      href: '/schedule',
      footnote: recent.meetings
        ? `Last 4 weeks · ${recent.meetings} ${recent.meetings === 1 ? 'class' : 'classes'}`
        : 'No roll calls in the last 4 weeks',
    },
  ];
}

function attention(state: PortalState, today: string): AttentionItem[] {
  return unsubmittedRollCalls(state, today).map((meeting) => {
    const ensemble = ensembleById(state, meeting.ensembleId);
    return {
      id: `teaching-roll-${meeting.id}`,
      date: meeting.date,
      label: 'Roll call not submitted',
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
    { path: '/schedule', element: <Schedule /> },
    { path: '/roll/:meetingId', element: <RollCall /> },
    { path: '/students', element: <Students /> },
  ],
  dashboard: { stats, attention, panels: [TodayPanel] },
  slice: teachingSlice,
};
