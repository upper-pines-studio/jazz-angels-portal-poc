import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Icon } from '../../../design-system';
import { useCan, useStore } from '../../../core';
import { PHASES, pipelineCounts } from '../domain';
import type { Phase, PhaseTone } from '../domain';
import { PhaseBadge } from './badges';

/** The grants module's dashboard panel: how many grants sit in each phase. */

const TONE_COLOR: Record<PhaseTone, string> = {
  neutral: 'var(--neutral-300)',
  blue: 'var(--blue-500)',
  teal: 'var(--teal-500)',
  olive: 'var(--olive-500)',
  gold: 'var(--gold-400)',
  danger: 'var(--danger-500)',
};

const MONO_SM = 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)';

export function PipelinePanel() {
  const nav = useNavigate();
  const { state } = useStore();

  const buckets = pipelineCounts(state);
  const stepper = buckets.slice(0, 8);
  const peak = Math.max(1, ...stepper.map(b => b.count));
  const countFor = (phase: Phase) => buckets.find(b => b.phase === phase)?.count ?? 0;
  const mayAdd = useCan()('grants', 'edit');

  // Eight empty bars say nothing; with no grants the card says what will fill it.
  if (buckets.every(b => b.count === 0)) {
    return (
      <Card title="Pipeline" padding="0">
        <EmptyState
          style={{ padding: 'var(--space-6) var(--space-5)' }}
          icon={<Icon name="landmark" size={22} />}
          title="No grants yet"
          message={
            mayAdd
              ? 'Each grant shows up here by phase, from prospect to closed. Add a grant to start the pipeline.'
              : 'Each grant shows up here by phase, from prospect to closed, once one is added.'
          }
          action={
            mayAdd && (
              <Button variant="secondary" size="sm" onClick={() => nav('/grants?add=1')}>
                Add grant
              </Button>
            )
          }
        />
      </Card>
    );
  }

  return (
    <Card title="Pipeline" padding="var(--space-4) var(--space-5)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {stepper.map(b => (
          <div
            key={b.phase}
            onClick={() => nav(`/grants?phase=${b.phase}`)}
            style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <PhaseBadge phase={b.phase} />
              <span
                style={{
                  marginLeft: 'auto',
                  font: MONO_SM,
                  color: b.count ? 'var(--text-body)' : 'var(--text-faint)',
                }}
              >
                {b.count}
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: 'var(--neutral-100)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  width: `${(b.count / peak) * 100}%`,
                  background: TONE_COLOR[PHASES[b.phase].tone],
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 'var(--space-3)',
          paddingTop: 'var(--space-2)',
          borderTop: 'var(--border-width) solid var(--border-subtle)',
          font: 'var(--type-body-sm)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        Declined {countFor('declined')} · Withdrawn {countFor('withdrawn')}
      </div>
    </Card>
  );
}

export default PipelinePanel;
