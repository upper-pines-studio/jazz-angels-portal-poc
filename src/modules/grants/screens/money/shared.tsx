import React from 'react';
import { Badge } from '../../../../design-system';
import { useStore } from '../../../../core';
import { Eyebrow } from '../../../../app/components/badges';
import { PACE_LABEL, syncedLabel, wholePercent } from '../../domain';
import type { PaceStatus } from '../../domain';
import './shared.css';

/** Pieces the money screens share, so a status or a figure looks the same on every one. */

const PACE_TONE: Record<PaceStatus, 'neutral' | 'teal' | 'olive' | 'gold'> = {
  'on-track': 'teal',
  'spending-fast': 'gold',
  'spending-slow': 'olive',
  ahead: 'neutral',
  'period-ended': 'neutral',
  'not-started': 'neutral',
};

/** The colour that goes with a pace, for bars and chart lines. */
export const PACE_COLOR: Record<PaceStatus, string> = {
  'on-track': 'var(--blue-500)',
  'spending-fast': 'var(--gold-400)',
  'spending-slow': 'var(--blue-500)',
  ahead: 'var(--blue-500)',
  'period-ended': 'var(--blue-500)',
  'not-started': 'var(--neutral-300)',
};

/** "Spending fast", "On track": the four status words, always in the same colours. */
export function PaceBadge({ status, dot = true }: { status: PaceStatus; dot?: boolean }) {
  return (
    <Badge tone={PACE_TONE[status]} dot={dot}>
      {PACE_LABEL[status]}
    </Badge>
  );
}

/** The quiet version for a table row: a dot and the words, no box. */
export function PaceMark({ status }: { status: PaceStatus }) {
  const color = {
    'on-track': 'var(--teal-500)',
    'spending-fast': 'var(--gold-500)',
    'spending-slow': 'var(--olive-500)',
    ahead: 'var(--neutral-300)',
    'period-ended': 'var(--neutral-400)',
    'not-started': 'var(--neutral-300)',
  }[status];
  const text = {
    'on-track': 'var(--teal-700)',
    'spending-fast': 'var(--gold-700)',
    'spending-slow': 'var(--olive-700)',
    ahead: 'var(--text-muted)',
    'period-ended': 'var(--text-muted)',
    'not-started': 'var(--text-muted)',
  }[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        font: 'var(--type-body-sm)',
        fontSize: 'var(--text-xs)',
        color: text,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: color, flex: '0 0 auto' }}
      />
      {PACE_LABEL[status]}
    </span>
  );
}

/**
 * Spent against budget, with a tick where an even pace would be today.
 * `used` and `elapsed` are shares, 0 to 1.
 */
export function PaceBar({
  used,
  elapsed,
  color = 'var(--blue-500)',
  showTick = true,
}: {
  used: number;
  elapsed: number;
  color?: string;
  showTick?: boolean;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return (
    <div
      className="ja-pace-bar"
      role="img"
      aria-label={`${wholePercent(used)}% used, ${wholePercent(elapsed)}% of the period gone`}
    >
      <div
        className="ja-pace-bar__fill"
        style={{
          width: `${clamp(used) * 100}%`,
          background: used > 1 ? 'var(--danger-500)' : color,
        }}
      />
      {showTick && (
        <div className="ja-pace-bar__tick" style={{ left: `${clamp(elapsed) * 100}%` }} />
      )}
    </div>
  );
}

export interface Figure {
  label: string;
  value: React.ReactNode;
  /** Small mono text right of the value: "of 5", "$18,240". */
  unit?: React.ReactNode;
  /** A line under the value. */
  note?: React.ReactNode;
}

/** The row of figures at the head of a tab: Awarded, Budgeted, Unallocated. */
export function Figures({ items, trailing }: { items: Figure[]; trailing?: React.ReactNode }) {
  const count = items.length + (trailing ? 1 : 0);
  return (
    <div className="ja-figures" style={{ '--ja-figures': count } as React.CSSProperties}>
      {items.map(f => (
        <div key={f.label}>
          <Eyebrow>{f.label}</Eyebrow>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span
              style={{
                font: 'var(--weight-semibold) var(--text-2xl)/1 var(--font-display)',
                letterSpacing: 'var(--tracking-display)',
                color: 'var(--text-strong)',
              }}
            >
              {f.value}
            </span>
            {f.unit && (
              <span
                style={{
                  font: 'var(--weight-medium) var(--text-xs)/1 var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {f.unit}
              </span>
            )}
          </span>
          {f.note && (
            <span
              style={{
                font: 'var(--type-body-sm)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-muted)',
              }}
            >
              {f.note}
            </span>
          )}
        </div>
      ))}
      {trailing && <div style={{ justifyContent: 'center' }}>{trailing}</div>}
    </div>
  );
}

/** "QuickBooks Online · Read-only · Synced today, 8:40 am", with the green dot. */
export function QuickBooksStatus({ compact = false }: { compact?: boolean }) {
  const { state, today } = useStore();
  const qb = state.grants.quickbooks;
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    font: 'var(--type-body-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  };
  if (!qb.connected) {
    return (
      <span style={style}>
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neutral-300)' }}
        />
        QuickBooks is not connected
      </span>
    );
  }
  return (
    <span style={style}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-500)' }} />
      <span style={{ color: 'var(--text-strong)' }}>QuickBooks Online</span>
      {!compact && (
        <>
          <span aria-hidden="true">·</span>
          <span>Read-only</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>
        Synced <span style={{ fontFamily: 'var(--font-mono)' }}>{syncedLabel(state, today)}</span>
      </span>
    </span>
  );
}

/** A button that reads as a link: "View transactions", "Split". */
export function LinkButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button type="button" className="ja-link-button" onClick={onClick}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/** Rows to CSV text. Excel opens it; quotes and commas are escaped. */
export function toCsv(rows: Array<Array<string | number | undefined | null>>): string {
  const cell = (v: string | number | undefined | null) => {
    const text = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map(r => r.map(cell).join(',')).join('\n');
}

/** Hand the browser a file to save. Shared with the office's documents. */
export { downloadText } from '../../../../app/components/files';
