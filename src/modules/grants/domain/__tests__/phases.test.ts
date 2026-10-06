import { describe, expect, it } from 'vitest';
import {
  PHASES,
  PHASE_ORDER,
  availableTransitions,
  isPostAward,
  isPreAward,
  stepperPhases,
} from '../phases';
import type { Grant, Phase } from '../types';

function grant(phase: Phase, loiRequired = false): Pick<Grant, 'phase' | 'loiRequired'> {
  return { phase, loiRequired };
}

describe('phase metadata', () => {
  it('has the eight stepper phases in order', () => {
    expect(PHASE_ORDER).toEqual([
      'prospect',
      'loi',
      'applying',
      'submitted',
      'awarded',
      'active',
      'reporting',
      'closed',
    ]);
  });

  it('splits pre-award from post-award', () => {
    expect(['prospect', 'loi', 'applying', 'submitted'].every(p => isPreAward(p as Phase))).toBe(
      true,
    );
    expect(['awarded', 'active', 'reporting', 'closed'].every(p => isPostAward(p as Phase))).toBe(
      true,
    );
    expect(isPreAward('awarded')).toBe(false);
    expect(isPostAward('declined')).toBe(false);
  });

  it('uses the tones from the spec', () => {
    expect(PHASES.loi.tone).toBe('olive');
    expect(PHASES.applying.tone).toBe('blue');
    expect(PHASES.active.tone).toBe('teal');
    expect(PHASES.reporting.tone).toBe('gold');
    expect(PHASES.declined.tone).toBe('danger');
    expect(PHASES.closed.tone).toBe('neutral');
  });

  it('marks closed, declined and withdrawn terminal', () => {
    expect(PHASES.closed.isTerminal).toBe(true);
    expect(PHASES.declined.isTerminal).toBe(true);
    expect(PHASES.withdrawn.isTerminal).toBe(true);
    expect(PHASES.active.isTerminal).toBe(false);
  });
});

describe('stepperPhases', () => {
  it('hides LOI when the funder does not require one', () => {
    expect(stepperPhases({ loiRequired: false })).not.toContain('loi');
    expect(stepperPhases({ loiRequired: false })).toHaveLength(7);
  });

  it('keeps LOI when it is required', () => {
    expect(stepperPhases({ loiRequired: true })).toEqual(PHASE_ORDER);
  });
});

describe('availableTransitions', () => {
  it('offers "Start LOI" first when an LOI is required', () => {
    const t = availableTransitions(grant('prospect', true));
    expect(t[0]).toMatchObject({ to: 'loi', label: 'Start LOI', kind: 'primary' });
    expect(t.map(x => x.to)).toEqual(['loi', 'applying', 'withdrawn']);
  });

  it('goes straight to applying when no LOI is required', () => {
    const t = availableTransitions(grant('prospect', false));
    expect(t.map(x => x.to)).toEqual(['applying', 'withdrawn']);
    expect(t[0].label).toBe('Start application');
  });

  it('captures the submitted date on applying → submitted', () => {
    const t = availableTransitions(grant('applying'));
    expect(t[0]).toMatchObject({ to: 'submitted', label: 'Mark submitted', fields: ['date'] });
  });

  it('captures amount and period on submitted → awarded, and a reason on decline', () => {
    const t = availableTransitions(grant('submitted'));
    expect(t[0]).toMatchObject({
      to: 'awarded',
      label: 'Record award',
      kind: 'primary',
      fields: ['date', 'amountAwarded', 'periodStart', 'periodEnd'],
    });
    expect(t[1]).toMatchObject({
      to: 'declined',
      label: 'Record decline',
      fields: ['date', 'reason'],
    });
  });

  it('moves awarded → active and active → reporting', () => {
    expect(availableTransitions(grant('awarded')).map(t => t.to)).toEqual(['active']);
    expect(availableTransitions(grant('active')).map(t => t.to)).toEqual(['reporting']);
  });

  it('lets reporting go back to active or close out', () => {
    const t = availableTransitions(grant('reporting'));
    expect(t.map(x => x.to)).toEqual(['active', 'closed']);
    expect(t[0].label).toBe('Report submitted');
    expect(t[1].label).toBe('Close grant');
  });

  it('offers Withdraw as a danger action from every pre-award phase only', () => {
    for (const phase of ['prospect', 'loi', 'applying', 'submitted'] as Phase[]) {
      const withdraw = availableTransitions(grant(phase)).find(t => t.to === 'withdrawn');
      expect(withdraw, phase).toBeDefined();
      expect(withdraw!.kind).toBe('danger');
    }
    for (const phase of ['awarded', 'active', 'reporting'] as Phase[]) {
      expect(availableTransitions(grant(phase)).some(t => t.to === 'withdrawn')).toBe(false);
    }
  });

  it('offers nothing from a terminal phase', () => {
    expect(availableTransitions(grant('closed'))).toEqual([]);
    expect(availableTransitions(grant('declined'))).toEqual([]);
    expect(availableTransitions(grant('withdrawn'))).toEqual([]);
  });
});
