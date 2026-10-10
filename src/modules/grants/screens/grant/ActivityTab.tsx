import React from 'react';
import { Button, Textarea } from '../../../../design-system';
import { useCan, useStore } from '../../../../core';
import { grantActivity } from '../../domain';
import type { Grant } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { ActivityTimeline } from '../ActivityTimeline';

/** Everything that has happened on this grant, newest first, plus a note box. */

export function ActivityTab({ grant }: { grant: Grant }) {
  const { state, actions } = useStore();
  const mayNote = useCan()('grants', 'edit');
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
      {mayNote && (
        <div
          style={{
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: 'var(--border-width) solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <Textarea
            rows={2}
            value={note}
            placeholder="Add a note: a call, a promise, something the next person should know."
            onChange={e => setNote(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" size="sm" disabled={!note.trim()} onClick={add}>
              Add note
            </Button>
          </div>
        </div>
      )}

      <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
        {rows.length === 0 && (
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            Nothing has happened on this grant yet. Notes and phase changes show up here.
          </p>
        )}
        <ActivityTimeline lines={rows.map(row => ({ row }))} />
      </div>
    </div>
  );
}
