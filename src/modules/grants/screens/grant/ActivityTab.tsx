import React from 'react';
import { Button, Textarea } from '../../../../design-system';
import { dateLong, toISO, useStore } from '../../../../core';
import { grantActivity } from '../../domain';
import type { Grant } from '../../domain';
import { useToast } from '../../../../app/ToastHost';

/** Everything that has happened on this grant, newest first, plus a note box. */

/** The day an activity row happened, in the reader's timezone. */
function dayOf(at: string): string {
  if (!at.includes('T')) return at.slice(0, 10);
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at.slice(0, 10) : toISO(d);
}

/**
 * "9:00 AM" from an ISO date-time, for rows from today — the hour matters while
 * the day is still going. Older rows read as a date alone.
 */
function timeOf(at: string, today: string): string {
  if (!at.includes('T')) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  if (dayOf(at) !== today) return '';
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours < 12 ? 'AM' : 'PM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}

export function ActivityTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [note, setNote] = React.useState('');
  const rows = grantActivity(state, grant.id);

  const add = () => {
    const text = note.trim();
    if (!text) return;
    actions.grants.addNote(grant.id, text);
    setNote('');
    toast({ tone: 'success', title: 'Note added', message: grant.title });
  };

  return (
    <div>
      <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: 'var(--border-width) solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Textarea rows={2} value={note} placeholder="Add a note — a call, a promise, something the next person should know."
          onChange={e => setNote(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="sm" disabled={!note.trim()} onClick={add}>Add note</Button>
        </div>
      </div>

      <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
        {rows.length === 0 && (
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            Nothing has happened on this grant yet. Notes and phase changes show up here.
          </p>
        )}
        {rows.map((row, i) => {
          const time = timeOf(row.at, today);
          const last = i === rows.length - 1;
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', gap: 'var(--space-4)' }}>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span style={{ position: 'absolute', left: 'calc(50% - 0.5px)', top: 0, bottom: last ? 'auto' : 0, height: last ? 14 : undefined, width: 1, background: 'var(--border-default)' }} />
                <span style={{ position: 'relative', marginTop: 6, width: 8, height: 8, borderRadius: 'var(--radius-pill)', background: i === 0 ? 'var(--teal-500)' : 'var(--neutral-300)' }} />
              </div>
              <div style={{ paddingBottom: last ? 0 : 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span style={{ font: 'var(--weight-medium) var(--text-2xs)/1.3 var(--font-mono)', color: 'var(--text-muted)' }}>
                    {dateLong(dayOf(row.at))}{time && ` · ${time}`}
                  </span>
                  <span style={{ font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{row.who}</span>
                </div>
                <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>{row.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
