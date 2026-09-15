import React from 'react';
import { Badge, Avatar } from '../../design-system';
import { PHASES, useStore, staffById, initials } from '../../domain';
import type { Phase, Deadline } from '../../domain';

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

/** Initials disc for a staff member, looked up by id. */
export function OwnerAvatar({ staffId, size = 28 }: { staffId?: string; size?: number }) {
  const { state } = useStore();
  const s = staffId ? staffById(state, staffId) : undefined;
  if (!s) return <Avatar name="?" size={size} tone="var(--neutral-300)" />;
  const tone = s.id === 's-barry' ? 'var(--gold-400)' : undefined;
  return <span title={s.name}><Avatar name={s.name} size={size} tone={tone} /></span>;
}

/** Small uppercase section label inside a card body (eyebrow style). */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-muted)', ...style }}>{children}</span>;
}

/** Key/value row for the side cards ("Key dates", "Details"). */
export function KV({ k, v, strong = false }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  // Divider rules come from `.ja-kv + .ja-kv` in Shell so the last row has no trailing hairline.
  return (
    <div className="ja-kv" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '10px 0', font: 'var(--type-body-sm)' }}>
      <span style={{ color: 'var(--text-muted)', flex: '0 0 auto' }}>{k}</span>
      <span style={{ color: 'var(--text-strong)', textAlign: 'right', fontWeight: strong ? 'var(--weight-semibold)' as any : undefined }}>{v}</span>
    </div>
  );
}

export { initials };
