import { toISO } from '../../../core/format';
import type {
  Activity,
  Grant,
  GrantDates,
  InFlightPhase,
  Phase,
  PhaseTone,
  Transition,
} from './types';

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
  return grant.loiRequired ? PHASE_ORDER : PHASE_ORDER.filter(p => p !== 'loi');
}

/** Where Add grant may bring in a grant already under way (decision 0004). */
export const IN_FLIGHT_PHASES: InFlightPhase[] = ['awarded', 'active', 'reporting'];

export function isInFlightPhase(phase: Phase | undefined): phase is InFlightPhase {
  return !!phase && (IN_FLIGHT_PHASES as Phase[]).includes(phase);
}

/** The stepper phases a grant brought in at `phase` has already passed, in order. */
export function passedPhases(grant: Pick<Grant, 'loiRequired'>, phase: Phase): Phase[] {
  return stepperPhases(grant).filter(p => phaseIndex(p) < phaseIndex(phase));
}

/** What an activity row looks like when a grant entered this phase. */
export const ENTERED: Record<Phase, RegExp | undefined> = {
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

/**
 * The grant date a brought-in grant shows under each step it passed before it
 * came into the portal: only the dates that say when it entered the phase.
 * Prospect and Reporting have none, and the LOI and application due dates are
 * deadlines, not the day it started the LOI or the application, so those
 * steps show no date.
 */
const BROUGHT_IN_DATE: Partial<Record<Phase, keyof GrantDates>> = {
  submitted: 'submitted',
  awarded: 'decided',
  active: 'periodStart',
};

/**
 * The day this grant reached `phase`, for the stepper: the activity row that
 * says so (the latest, given `activity` oldest first), else the key date.
 * A grant brought in already under way never takes its created date for
 * Prospect: the phases it passed elsewhere show only a submitted, decided or
 * period-start date it was given.
 */
export function phaseEnteredOn(
  grant: Pick<Grant, 'createdAt' | 'dates' | 'broughtIn'>,
  phase: Phase,
  activity: Pick<Activity, 'at' | 'text'>[],
): string | undefined {
  const pattern = ENTERED[phase];
  const hit = pattern ? activity.filter(a => pattern.test(a.text)).slice(-1)[0] : undefined;
  if (hit) {
    // `at` is an ISO date-time in UTC; the day we show is the reader's day.
    const when = new Date(hit.at);
    return Number.isNaN(when.getTime()) ? hit.at.slice(0, 10) : toISO(when);
  }
  if (grant.broughtIn && phaseIndex(phase) <= phaseIndex(grant.broughtIn.phase)) {
    const key = BROUGHT_IN_DATE[phase];
    return key ? grant.dates[key] : undefined;
  }
  if (phase === 'prospect') return grant.createdAt;
  if (phase === 'submitted') return grant.dates.submitted;
  if (phase === 'awarded') return grant.dates.decided;
  if (phase === 'active') return grant.dates.periodStart;
  return undefined;
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
