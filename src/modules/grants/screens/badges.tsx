import React from 'react';
import { Badge } from '../../../design-system';
import { PHASES } from '../domain';
import type { Deadline, Phase } from '../domain';

/** The badges that only mean something inside the grants module. */

/** Phase as a status Badge with the tone from PHASES. */
export function PhaseBadge({ phase }: { phase: Phase }) {
  const p = PHASES[phase];
  return <Badge tone={p.tone} dot>{p.label}</Badge>;
}

/** Overdue / Due soon / (nothing for upcoming unless `showUpcoming`). Gold is rationed to attention states. */
export function DeadlineStatusBadge({ status, showUpcoming = false }: { status: Deadline['status']; showUpcoming?: boolean }) {
  if (status === 'overdue') return <Badge tone="danger">Overdue</Badge>;
  if (status === 'due-soon') return <Badge tone="gold">Due soon</Badge>;
  return showUpcoming ? <Badge tone="neutral">Upcoming</Badge> : null;
}

const KIND: Record<Deadline['kind'], { label: string; tone: 'neutral' | 'blue' | 'teal' | 'olive' | 'gold' | 'danger' }> = {
  task: { label: 'Task', tone: 'neutral' },
  loi: { label: 'LOI', tone: 'olive' },
  application: { label: 'Application', tone: 'blue' },
  decision: { label: 'Decision', tone: 'teal' },
  report: { label: 'Report', tone: 'gold' },
  payment: { label: 'Payment', tone: 'teal' },
  'period-end': { label: 'Period ends', tone: 'neutral' },
  start: { label: 'Start', tone: 'neutral' },
};
export function DeadlineKindBadge({ kind }: { kind: Deadline['kind'] }) {
  const k = KIND[kind];
  return <Badge tone={k.tone}>{k.label}</Badge>;
}

/** Colour token for a deadline kind — 3px chip rules on the calendar. */
export function deadlineKindColor(kind: Deadline['kind'], status?: Deadline['status']): string {
  if (status === 'overdue') return 'var(--danger-500)';
  return { task: 'var(--neutral-400)', loi: 'var(--olive-500)', application: 'var(--blue-500)', decision: 'var(--teal-500)',
    report: 'var(--gold-400)', payment: 'var(--teal-500)', 'period-end': 'var(--neutral-400)', start: 'var(--neutral-400)' }[kind];
}
