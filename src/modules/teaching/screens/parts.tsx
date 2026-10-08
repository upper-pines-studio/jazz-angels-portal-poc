import React from 'react';
import { Badge } from '../../../design-system';
import type { EnsembleTone, Mark } from '../domain';

/** The small pieces the teaching screens share. */

/** Which brand hue identifies an ensemble on the week grid and the roster. */
export const TONE_COLOR: Record<EnsembleTone, string> = {
  blue: 'var(--blue-500)',
  teal: 'var(--teal-500)',
  olive: 'var(--olive-500)',
  gold: 'var(--gold-400)',
  neutral: 'var(--neutral-400)',
};

/** The tone's name, as the ensemble dialog offers it. */
export const TONE_LABEL: Record<EnsembleTone, string> = {
  blue: 'Blue',
  teal: 'Teal',
  olive: 'Olive',
  gold: 'Gold',
  neutral: 'Grey',
};

const MARK_TONE: Record<Mark, 'teal' | 'gold' | 'danger'> = {
  present: 'teal',
  late: 'gold',
  absent: 'danger',
};

const MARK_LABEL: Record<Mark, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
};

export const MARK_COLOR: Record<Mark, string> = {
  present: 'var(--teal-500)',
  late: 'var(--gold-400)',
  absent: 'var(--danger-500)',
};

/** How one student was marked. */
export function MarkBadge({ mark }: { mark: Mark }) {
  return (
    <Badge tone={MARK_TONE[mark]} dot>
      {MARK_LABEL[mark]}
    </Badge>
  );
}

/** Where a meeting's roll call stands. Gold is the attention state. */
export function RollBadge({ submitted, due }: { submitted: boolean; due: boolean }) {
  if (submitted)
    return (
      <Badge tone="teal" dot>
        Roll in
      </Badge>
    );
  if (due)
    return (
      <Badge tone="gold" dot>
        Roll due
      </Badge>
    );
  return <Badge tone="neutral">Scheduled</Badge>;
}

/** A student's last five marks, oldest first. */
export function MarkDots({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) {
    return (
      <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-faint)' }}>No marks yet</span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {marks.map((mark, i) => (
        <span
          key={i}
          title={MARK_LABEL[mark]}
          style={{
            width: 10,
            height: 10,
            borderRadius: 'var(--radius-pill)',
            background: MARK_COLOR[mark],
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  );
}
