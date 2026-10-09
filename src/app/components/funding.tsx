import React from 'react';
import { Icon } from '../../design-system';
import './funding.css';

/**
 * The pieces the Programs page and a grant's "Where this grant's money goes"
 * share (decision 0006): the stacked bar, its swatches, the figures and the
 * warnings. Pending money ("If awarded") is hatched, never a colour of its own.
 */

/**
 * The colours a bar gives its segments, in order: the four brand hues, then a
 * lighter step of each. A row's swatch takes the same colour as its segment.
 */
const FUNDING_COLOURS = [
  'var(--blue-500)',
  'var(--teal-500)',
  'var(--gold-400)',
  'var(--olive-500)',
  'var(--blue-300)',
  'var(--teal-300)',
  'var(--gold-200)',
  'var(--olive-300)',
];

/** The colour of the n-th segment of a bar (from 0), and of its row's swatch. */
export function fundingColour(index: number): string {
  return FUNDING_COLOURS[index % FUNDING_COLOURS.length];
}

export interface BarPart {
  key: string;
  amount: number;
  colour: string;
  /** Pending money: hatched. */
  ifAwarded?: boolean;
  /** What the segment is, for its tooltip: "Herb Alpert, $6,000". */
  label?: string;
}

/**
 * One bar, its segments side by side. The track is `max` wide (the budget, or
 * all a grant has), and grows to fit when more is given than that.
 */
export function FundingBar({
  parts,
  max,
  label,
  size = 'md',
}: {
  parts: BarPart[];
  max: number;
  /** What the bar says, in words, for a screen reader. */
  label: string;
  size?: 'sm' | 'md';
}) {
  const shown = parts.filter(p => p.amount > 0);
  const whole = Math.max(
    max,
    shown.reduce((sum, p) => sum + p.amount, 0),
    1,
  );
  return (
    <div className={`ja-fbar ja-fbar--${size}`} role="img" aria-label={label}>
      {shown.map(p => (
        <span
          key={p.key}
          title={p.label}
          className={p.ifAwarded ? 'ja-fbar__seg ja-fbar__seg--if' : 'ja-fbar__seg'}
          style={{ width: `${(p.amount / whole) * 100}%`, backgroundColor: p.colour }}
        />
      ))}
    </div>
  );
}

/** The small square before a row, the colour of its segment; hatched when pending. */
export function Swatch({ colour, ifAwarded }: { colour: string; ifAwarded?: boolean }) {
  return (
    <span
      aria-hidden
      className={ifAwarded ? 'ja-fswatch ja-fbar__seg--if' : 'ja-fswatch'}
      style={{ backgroundColor: colour }}
    />
  );
}

/** One figure in a row of them: an eyebrow label over a big number. */
export function Figure({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: React.ReactNode;
  /** `over` for money past a budget or past what a grant has. */
  tone?: 'over';
  children?: React.ReactNode;
}) {
  return (
    <div className="ja-ffig">
      <div className="ja-ffig__label">{label}</div>
      <div className={tone === 'over' ? 'ja-ffig__value ja-ffig__value--over' : 'ja-ffig__value'}>
        {value}
      </div>
      {children}
    </div>
  );
}

/** A row of figures that wraps on a narrow screen. */
export function Figures({ children }: { children: React.ReactNode }) {
  return <div className="ja-ffigs">{children}</div>;
}

/**
 * Why money may not be usable where it goes (decision 0006). Warnings, never
 * refusals: they say so and the office carries on.
 */
export function FundingWarnings({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="ja-fwarn">
      {messages.map(m => (
        <li key={m}>
          <Icon name="triangle-alert" size={14} />
          <span>{m}</span>
        </li>
      ))}
    </ul>
  );
}

/** The uppercase label over a part of a sheet or card: "Paid for by". */
export function FundingLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="ja-flabel">{children}</h4>;
}
