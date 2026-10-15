import React from 'react';
import { Badge, Avatar } from '../../design-system';
import { initials, staffById, useStore } from '../../core';
import type { AttentionItem, OfficeDocumentStatus } from '../../core';

/** The small pieces every module's screens share. Module-specific badges live in the module. */

/**
 * The outlined gold of a status that is somebody's to fix without being late,
 * "Sent back" (#96): dark gold words (6.5:1 on white) and a 1px gold rule on the
 * card's white, so it reads apart from a filled gold Badge. The padding gives
 * back the rule's pixel, so it stands as tall as the other badges. For the
 * Badge's `style`; the design system has no outlined tone.
 */
export const OUTLINED_GOLD_BADGE: React.CSSProperties = {
  background: 'var(--surface-card)',
  color: 'var(--gold-700)',
  border: 'var(--border-width) solid var(--gold-500)',
  padding: '4px calc(var(--space-2) - 1px)',
};

/**
 * Overdue / Due soon / a note, or the row's own words for them ("Out of date",
 * "Expires soon"). Gold is rationed to attention states. `outlined` draws it in
 * outlined gold instead (see `OUTLINED_GOLD_BADGE`).
 */
export function AttentionStatusBadge({
  status,
  label,
  outlined = false,
}: {
  status: AttentionItem['status'];
  label?: string;
  outlined?: boolean;
}) {
  if (outlined) return <Badge style={OUTLINED_GOLD_BADGE}>{label ?? 'Note'}</Badge>;
  if (status === 'overdue') return <Badge tone="danger">{label ?? 'Overdue'}</Badge>;
  if (status === 'due-soon') return <Badge tone="gold">{label ?? 'Due soon'}</Badge>;
  return <Badge tone="neutral">{label ?? 'Note'}</Badge>;
}

/** The words for an office document's status (core decides it: `versionStatus`). */
export const OFFICE_DOCUMENT_STATUS_LABEL: Record<OfficeDocumentStatus, string> = {
  'out-of-date': 'Out of date',
  'expires-soon': 'Expires soon',
  current: 'Current',
};

/** Danger for out of date, gold (the attention colour) for expiring soon, teal for current. */
export const OFFICE_DOCUMENT_STATUS_TONE: Record<OfficeDocumentStatus, 'danger' | 'gold' | 'teal'> =
  {
    'out-of-date': 'danger',
    'expires-soon': 'gold',
    current: 'teal',
  };

/** An office document's status, on Office › Documents and on a grant's register row. */
export function OfficeDocumentStatusBadge({ status }: { status: OfficeDocumentStatus }) {
  return (
    <Badge tone={OFFICE_DOCUMENT_STATUS_TONE[status]}>{OFFICE_DOCUMENT_STATUS_LABEL[status]}</Badge>
  );
}

/** Which module a dashboard row came from. */
export function SourceBadge({ source }: { source: string }) {
  return <Badge tone="neutral">{source}</Badge>;
}

/** Initials disc for a staff member, looked up by id. */
export function OwnerAvatar({ staffId, size = 28 }: { staffId?: string; size?: number }) {
  const { state } = useStore();
  const s = staffId ? staffById(state, staffId) : undefined;
  if (!s) return <Avatar name="?" size={size} tone="var(--neutral-300)" />;
  const tone = s.id === 's-barry' ? 'var(--gold-400)' : undefined;
  return (
    <span title={s.name}>
      <Avatar name={s.name} size={size} tone={tone} />
    </span>
  );
}

/** Small uppercase section label inside a card body (eyebrow style). */
export function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        font: 'var(--type-eyebrow)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Key/value row for the side cards ("Key dates", "Details"). */
export function KV({
  k,
  v,
  strong = false,
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  strong?: boolean;
}) {
  // Divider rules come from `.ja-kv + .ja-kv` in Shell so the last row has no trailing hairline.
  return (
    <div
      className="ja-kv"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '10px 0',
        font: 'var(--type-body-sm)',
      }}
    >
      <span style={{ color: 'var(--text-muted)', flex: '0 0 auto' }}>{k}</span>
      <span
        style={{
          color: 'var(--text-strong)',
          textAlign: 'right',
          fontWeight: strong ? ('var(--weight-semibold)' as any) : undefined,
        }}
      >
        {v}
      </span>
    </div>
  );
}

export { initials };
