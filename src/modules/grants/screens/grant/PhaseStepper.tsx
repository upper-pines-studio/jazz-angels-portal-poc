import React from 'react';
import { Card, Icon } from '../../../../design-system';
import { dateShort, toISO, useStore } from '../../../../core';
import { PHASES, grantActivity, phaseIndex, stepperPhases } from '../../domain';
import type { Activity, Grant, Phase } from '../../domain';

/**
 * The grant's life as connected steps (SPEC §4.4): done steps teal with a check,
 * the current step blue with a halo, future steps an empty ring. Declined and
 * withdrawn grants stop where they stopped and get a terminal marker.
 */

/** What an activity row looks like when a grant entered this phase. */
const ENTERED: Record<Phase, RegExp | undefined> = {
  prospect: /grant added/i,
  loi: /start loi|changed to loi/i,
  applying: /start application|changed to applying/i,
  submitted: /mark(ed)? submitted/i,
  awarded: /record award|award recorded/i,
  active: /agreement signed/i,
  reporting: /start(ed)? (the )?(final |interim )?report/i,
  closed: /close(d)? grant|grant closed/i,
  declined: /record decline|decline recorded/i,
  withdrawn: /withdraw/i,
};

/** The date this grant reached `phase`: the activity row that says so, else the key date. */
function phaseDate(grant: Grant, phase: Phase, activity: Activity[]): string | undefined {
  const pattern = ENTERED[phase];
  const hit = pattern ? activity.filter(a => pattern.test(a.text)).slice(-1)[0] : undefined;
  if (hit) {
    // `at` is an ISO date-time in UTC; the day we show is the reader's day.
    const when = new Date(hit.at);
    return Number.isNaN(when.getTime()) ? hit.at.slice(0, 10) : toISO(when);
  }
  if (phase === 'prospect') return grant.createdAt;
  if (phase === 'submitted') return grant.dates.submitted;
  if (phase === 'awarded') return grant.dates.decided;
  if (phase === 'active') return grant.dates.periodStart;
  return undefined;
}

interface Step {
  phase: Phase;
  state: 'done' | 'current' | 'future';
  when?: string;
}

const DOT = 24;

export function PhaseStepper({ grant }: { grant: Grant }) {
  const { state } = useStore();
  // Oldest first, so the *first* time a phase was entered wins where it repeats.
  const activity = React.useMemo(
    () => grantActivity(state, grant.id).slice().reverse(),
    [state, grant.id],
  );

  const ladder = stepperPhases(grant);
  const stopped = grant.phase === 'declined' || grant.phase === 'withdrawn';
  const current = phaseIndex(grant.phase);

  let steps: Step[];
  if (stopped) {
    // The last pre-award phase we have a date for is where the grant got to.
    const reached = ladder.filter(p => phaseIndex(p) <= phaseIndex('submitted'));
    let last = 0;
    reached.forEach((p, i) => {
      if (phaseDate(grant, p, activity)) last = i;
    });
    steps = reached.slice(0, last + 1).map(phase => ({
      phase,
      state: 'done' as const,
      when: phaseDate(grant, phase, activity),
    }));
  } else {
    steps = ladder.map(phase => {
      const idx = phaseIndex(phase);
      const stepState = idx < current ? 'done' : idx === current ? 'current' : 'future';
      return {
        phase,
        state: stepState as Step['state'],
        when: stepState === 'future' ? undefined : phaseDate(grant, phase, activity),
      };
    });
  }

  const terminalTone = grant.phase === 'declined' ? 'var(--danger-500)' : 'var(--neutral-400)';
  const cells = steps.length + (stopped ? 1 : 0);

  return (
    <Card padding="var(--space-6) var(--space-7)">
      <div className="ja-stepper">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {steps.map((step, i) => (
            <StepCell key={step.phase} step={step} last={i === cells - 1} />
          ))}
          {stopped && (
            <Cell
              last
              dot={
                <span
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: 'var(--radius-pill)',
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: terminalTone,
                    border: `var(--border-width-thick) solid ${terminalTone}`,
                  }}
                >
                  <Icon name="x" size={12} color="var(--neutral-0)" />
                </span>
              }
              connector={undefined}
              name={PHASES[grant.phase].label}
              nameColor={grant.phase === 'declined' ? 'var(--danger-600)' : 'var(--text-strong)'}
              when={grant.dates.decided ? dateShort(grant.dates.decided) : undefined}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function StepCell({ step, last }: { step: Step; last: boolean }) {
  const done = step.state === 'done';
  const currentStep = step.state === 'current';
  const dotStyle: React.CSSProperties = {
    width: DOT,
    height: DOT,
    borderRadius: 'var(--radius-pill)',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: done ? 'var(--teal-500)' : currentStep ? 'var(--blue-500)' : 'var(--neutral-0)',
    border: `var(--border-width-thick) solid ${done ? 'var(--teal-500)' : currentStep ? 'var(--blue-500)' : 'var(--border-default)'}`,
    boxShadow: currentStep ? '0 0 0 4px var(--blue-50)' : undefined,
  };
  return (
    <Cell
      last={last}
      dot={
        <span style={dotStyle}>
          {done && <Icon name="check" size={12} color="var(--neutral-0)" />}
        </span>
      }
      connector={done ? 'var(--teal-500)' : 'var(--border-default)'}
      name={PHASES[step.phase].label}
      nameColor={done || currentStep ? 'var(--text-strong)' : 'var(--text-faint)'}
      when={
        step.when
          ? currentStep
            ? `since ${dateShort(step.when)}`
            : dateShort(step.when)
          : undefined
      }
    />
  );
}

function Cell({
  dot,
  connector,
  name,
  nameColor,
  when,
  last,
}: {
  dot: React.ReactNode;
  connector?: string;
  name: string;
  nameColor: string;
  when?: string;
  last: boolean;
}) {
  return (
    <div
      style={{
        flex: '1 0 84px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)',
        position: 'relative',
        textAlign: 'center',
      }}
    >
      {!last && (
        <span
          style={{
            position: 'absolute',
            top: 11,
            left: '50%',
            right: '-50%',
            height: 2,
            background: connector ?? 'var(--border-default)',
          }}
        />
      )}
      {dot}
      <span
        style={{
          font: 'var(--type-eyebrow)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase',
          color: nameColor,
        }}
      >
        {name}
      </span>
      {when && (
        <span
          style={{
            font: 'var(--weight-medium) var(--text-3xs)/1.3 var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          {when}
        </span>
      )}
    </div>
  );
}
