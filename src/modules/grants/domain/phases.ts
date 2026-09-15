import type { Grant, Phase, PhaseTone, Transition } from './types';

/** The eight phases shown in the stepper, in order (SPEC §1). */
export const PHASE_ORDER: Phase[] = [
  'prospect',
  'loi',
  'applying',
  'submitted',
  'awarded',
  'active',
  'reporting',
  'closed',
];

/** The two off-ladder terminal phases, shown as a marker rather than a step. */
export const TERMINAL_PHASES: Phase[] = ['declined', 'withdrawn'];

/** Every phase: the stepper eight, then declined and withdrawn. */
export const ALL_PHASES: Phase[] = [...PHASE_ORDER, ...TERMINAL_PHASES];

export const PRE_AWARD_PHASES: Phase[] = ['prospect', 'loi', 'applying', 'submitted'];
export const POST_AWARD_PHASES: Phase[] = ['awarded', 'active', 'reporting', 'closed'];

export interface PhaseMeta {
  label: string;
  tone: PhaseTone;
  isPreAward: boolean;
  /** No further transitions are offered from here. */
  isTerminal: boolean;
}

export const PHASES: Record<Phase, PhaseMeta> = {
  prospect: { label: 'Prospect', tone: 'neutral', isPreAward: true, isTerminal: false },
  loi: { label: 'LOI', tone: 'olive', isPreAward: true, isTerminal: false },
  applying: { label: 'Applying', tone: 'blue', isPreAward: true, isTerminal: false },
  submitted: { label: 'Submitted', tone: 'blue', isPreAward: true, isTerminal: false },
  awarded: { label: 'Awarded', tone: 'teal', isPreAward: false, isTerminal: false },
  active: { label: 'Active', tone: 'teal', isPreAward: false, isTerminal: false },
  reporting: { label: 'Reporting', tone: 'gold', isPreAward: false, isTerminal: false },
  closed: { label: 'Closed', tone: 'neutral', isPreAward: false, isTerminal: true },
  declined: { label: 'Declined', tone: 'danger', isPreAward: false, isTerminal: true },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', isPreAward: false, isTerminal: true },
};

export function phaseLabel(phase: Phase): string {
  return PHASES[phase].label;
}

export function phaseTone(phase: Phase): PhaseTone {
  return PHASES[phase].tone;
}

/** Position on the stepper ladder, or -1 for declined/withdrawn. */
export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function isPreAward(phase: Phase): boolean {
  return PHASES[phase].isPreAward;
}

export function isPostAward(phase: Phase): boolean {
  return POST_AWARD_PHASES.includes(phase);
}

export function isTerminal(phase: Phase): boolean {
  return PHASES[phase].isTerminal;
}

/** The steps to draw for this grant: LOI is hidden when the funder does not require one. */
export function stepperPhases(grant: Pick<Grant, 'loiRequired'>): Phase[] {
  return grant.loiRequired ? PHASE_ORDER : PHASE_ORDER.filter((p) => p !== 'loi');
}

const WITHDRAW: Transition = {
  to: 'withdrawn',
  label: 'Withdraw',
  kind: 'danger',
  fields: ['date', 'reason'],
};

/**
 * The phase buttons to offer on grant detail (SPEC §4.4), most important first.
 * `fields` lists what the confirm dialog must capture; an empty list means
 * the transition stores nothing beyond the phase change and an activity row.
 */
export function availableTransitions(grant: Pick<Grant, 'phase' | 'loiRequired'>): Transition[] {
  const out: Transition[] = [];

  switch (grant.phase) {
    case 'prospect':
      if (grant.loiRequired) {
        out.push({ to: 'loi', label: 'Start LOI', kind: 'primary', fields: [] });
        out.push({ to: 'applying', label: 'Start application', kind: 'secondary', fields: [] });
      } else {
        out.push({ to: 'applying', label: 'Start application', kind: 'primary', fields: [] });
      }
      out.push(WITHDRAW);
      break;

    case 'loi':
      out.push({
        to: 'applying',
        label: 'LOI accepted, start application',
        kind: 'primary',
        fields: [],
      });
      out.push(WITHDRAW);
      break;

    case 'applying':
      out.push({ to: 'submitted', label: 'Mark submitted', kind: 'primary', fields: ['date'] });
      out.push(WITHDRAW);
      break;

    case 'submitted':
      out.push({
        to: 'awarded',
        label: 'Record award',
        kind: 'primary',
        fields: ['date', 'amountAwarded', 'periodStart', 'periodEnd'],
      });
      out.push({
        to: 'declined',
        label: 'Record decline',
        kind: 'danger',
        fields: ['date', 'reason'],
      });
      out.push(WITHDRAW);
      break;

    case 'awarded':
      out.push({ to: 'active', label: 'Agreement signed', kind: 'primary', fields: [] });
      break;

    case 'active':
      out.push({ to: 'reporting', label: 'Start report', kind: 'primary', fields: [] });
      break;

    case 'reporting':
      out.push({ to: 'active', label: 'Report submitted', kind: 'primary', fields: [] });
      out.push({ to: 'closed', label: 'Close grant', kind: 'secondary', fields: [] });
      break;

    // closed, declined, withdrawn: terminal, nothing on offer.
    default:
      break;
  }

  return out;
}
