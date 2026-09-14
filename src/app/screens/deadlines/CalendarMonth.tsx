import React from 'react';
import { Badge, Card } from '../../../design-system';
import { DeadlineKindBadge, deadlineKindColor } from '../../components/badges';
import { DEADLINE_KINDS, deadlineChipTint, funderShort, monthMatrix, WEEKDAYS } from './helpers';
import { funderById, grantById, toISO, useStore } from '../../../domain';
import type { Deadline } from '../../../domain';

const MAX_CHIPS = 3;

/** The month grid (Mon–Sun, 6 rows) plus the kind legend underneath. */
export function CalendarMonth({
  month,
  today,
  items,
  onOpen,
}: {
  month: Date;
  today: string;
  items: Deadline[];
  onOpen: (d: Deadline) => void;
}) {
  const { state } = useStore();
  const weeks = monthMatrix(month);
  const shownMonth = month.getMonth();

  const byDate = new Map<string, Deadline[]>();
  for (const d of items) {
    const list = byDate.get(d.date);
    if (list) list.push(d);
    else byDate.set(d.date, [d]);
  }

  const chipText = (d: Deadline) => {
    const grant = grantById(state, d.grantId);
    const funder = grant && funderById(state, grant.funderId);
    return `${d.label} · ${funderShort(funder?.name, 18)}`;
  };

  return (
    <>
      <Card padding="0">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{
              background: 'var(--surface-sunken)',
              borderBottom: 'var(--border-width) solid var(--border-default)',
              padding: '10px 12px',
              font: 'var(--weight-semibold) var(--text-3xs)/1.2 var(--font-sans)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {weeks.map((week, row) =>
            week.map((day, col) => {
              const iso = toISO(day);
              const out = day.getMonth() !== shownMonth;
              const isToday = iso === today;
              const dayItems = byDate.get(iso) ?? [];
              return (
                <div
                  key={iso}
                  style={{
                    minHeight: 110, padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 5,
                    minWidth: 0, background: out ? 'var(--surface-page)' : 'var(--surface-card)',
                    borderRight: col === 6 ? 'none' : 'var(--border-width) solid var(--border-subtle)',
                    borderBottom: row === weeks.length - 1 ? 'none' : 'var(--border-width) solid var(--border-subtle)',
                  }}
                >
                  <div style={{
                    font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-mono)',
                    height: 22, display: 'flex', alignItems: 'center',
                    ...(isToday
                      ? { width: 22, borderRadius: 999, background: 'var(--blue-500)', color: 'var(--neutral-0)', justifyContent: 'center' }
                      : { color: out ? 'var(--neutral-300)' : 'var(--text-body)' }),
                  }}>
                    {day.getDate()}
                  </div>

                  {dayItems.slice(0, MAX_CHIPS).map(d => (
                    <span
                      key={d.id}
                      title={chipText(d)}
                      onClick={() => onOpen(d)}
                      style={{
                        display: 'block', height: 22, padding: '0 var(--space-2)',
                        borderLeft: `3px solid ${deadlineKindColor(d.kind, d.status)}`,
                        background: deadlineChipTint(d.kind, d.status),
                        borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                        font: 'var(--weight-regular) var(--text-2xs)/22px var(--font-sans)', color: 'var(--text-body)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {chipText(d)}
                    </span>
                  ))}
                  {dayItems.length > MAX_CHIPS && (
                    <span style={{ font: 'var(--weight-regular) var(--text-2xs)/1.3 var(--font-sans)', color: 'var(--text-muted)', paddingLeft: 'var(--space-2)' }}>
                      +{dayItems.length - MAX_CHIPS} more
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 2px', flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginRight: 2 }}>Kinds</span>
        {DEADLINE_KINDS.map(k => <DeadlineKindBadge key={k} kind={k} />)}
        <Badge tone="danger">Overdue</Badge>
      </div>
    </>
  );
}
