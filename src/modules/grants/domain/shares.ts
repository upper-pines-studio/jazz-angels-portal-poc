import { isArchived } from '../../../core/archive';
import {
  fiscalYear,
  fiscalYearNamed,
  isWholeDollars,
  programById,
  projectById,
  sameTarget,
  targetName,
  targetProgramId,
} from '../../../core/derive';
import { dateLong, money } from '../../../core/format';
import type { FundingSource } from '../../../core/module';
import type { FiscalYearLabel, FundingTarget, PortalState } from '../../../core/types';
import { funderById, grantById, programNames } from './derive';
import { funderShortName } from './names';
import type {
  GiveShareInput,
  Grant,
  GrantGiving,
  GrantShare,
  GrantStanding,
  Phase,
  ShareChange,
  ShareTargetInput,
  ShareView,
  ShareWarning,
} from './types';

/**
 * How a grant's money is shared out to programs and projects (decision 0006):
 * what each grant has given and not yet given, what pays for a program's year
 * or a project, the warnings, and the rules Give, Change and Take back follow.
 * Every function here is pure.
 */

const AWARDED_PHASES: readonly Phase[] = ['awarded', 'active', 'reporting', 'closed'];
const PENDING_PHASES: readonly Phase[] = ['loi', 'applying', 'submitted'];

/**
 * Whether a grant's money counts, and how: awarded once it is awarded (a
 * closed grant's shares stay in its years' history), "If awarded" while it is
 * pending, and not at all as a prospect, declined, withdrawn or archived.
 */
export function grantStanding(grant: Grant): GrantStanding {
  if (isArchived(grant)) return 'none';
  if (AWARDED_PHASES.includes(grant.phase)) return 'awarded';
  if (PENDING_PHASES.includes(grant.phase)) return 'if-awarded';
  return 'none';
}

/** All a grant has to share out: the amount awarded, or requested while pending. */
export function grantPot(grant: Grant): number {
  const standing = grantStanding(grant);
  if (standing === 'awarded') return grant.amountAwarded ?? 0;
  if (standing === 'if-awarded') return grant.amountRequested ?? 0;
  return 0;
}

/**
 * The fiscal year a share to a program counts toward when nobody says: the
 * year the grant period starts in, else, while the grant has no period yet,
 * the year it is given in.
 */
export function defaultShareYear(state: PortalState, grant: Grant, today: string): FiscalYearLabel {
  return fiscalYear(grant.dates.periodStart ?? today, state.core.settings.fiscalYearStartMonth)
    .label;
}

/** A Give target with its fiscal year filled in. */
export function resolveTarget(
  state: PortalState,
  grant: Grant,
  target: ShareTargetInput,
  today: string,
): FundingTarget {
  if (target.kind === 'project') return { kind: 'project', projectId: target.projectId };
  return {
    kind: 'program',
    programId: target.programId,
    fiscalYear: target.fiscalYear ?? defaultShareYear(state, grant, today),
  };
}

/** Every share of one grant, in the order they were given. */
export function sharesOfGrant(state: PortalState, grantId: string): GrantShare[] {
  return state.grants.grantShares.filter(s => s.grantId === grantId);
}

/**
 * True when a share counts toward what its grant has given: always, but for a
 * share to an archived project, which stays in history and frees the money.
 */
export function shareCounts(state: PortalState, share: GrantShare): boolean {
  if (share.target.kind === 'program') return true;
  return !isArchived(projectById(state, share.target.projectId));
}

/** What a grant has given: its shares to programs and to current projects. */
export function grantGiven(state: PortalState, grantId: string): number {
  return sharesOfGrant(state, grantId)
    .filter(s => shareCounts(state, s))
    .reduce((sum, s) => sum + s.amount, 0);
}

/**
 * Why this grant's money may not be usable on this program year or project,
 * apart from how much is given. Warnings only: the office may carry on.
 */
export function targetWarnings(
  state: PortalState,
  grant: Grant,
  target: FundingTarget,
): ShareWarning[] {
  const out: ShareWarning[] = [];
  const programId = targetProgramId(state, target);
  if (grant.restriction === 'restricted' && programId && !grant.programs.includes(programId)) {
    out.push({
      kind: 'outside-restriction',
      message: `Restricted to ${programNames(state, grant)}`,
    });
  }

  const { periodStart, periodEnd } = grant.dates;
  if (target.kind === 'project') {
    const project = projectById(state, target.projectId);
    if (project) {
      const message =
        periodEnd && project.start > periodEnd
          ? `The grant period ends ${dateLong(periodEnd)}, before this project starts`
          : periodStart && project.end < periodStart
            ? `This project ends before the grant period starts, ${dateLong(periodStart)}`
            : periodStart && project.start < periodStart
              ? `Starts before the grant period, which starts ${dateLong(periodStart)}`
              : periodEnd && project.end > periodEnd
                ? `Runs past the grant period, which ends ${dateLong(periodEnd)}`
                : undefined;
      if (message) out.push({ kind: 'project-outside-period', message });
    }
  } else {
    const fy = fiscalYearNamed(target.fiscalYear, state.core.settings.fiscalYearStartMonth);
    if (fy && periodEnd && fy.start > periodEnd) {
      out.push({
        kind: 'year-after-period',
        message: `${fy.label} starts after the grant period ends, ${dateLong(periodEnd)}`,
      });
    } else if (fy && periodStart && fy.end < periodStart) {
      out.push({
        kind: 'year-before-period',
        message: `${fy.label} ended before the grant period starts, ${dateLong(periodStart)}`,
      });
    }
  }
  return out;
}

/** The grant-wide warning when more is given out than it has, or none. */
function overGiven(total: number, given: number): ShareWarning[] {
  return given > total
    ? [{ kind: 'over-given', message: `${money(given - total)} more than the grant has` }]
    : [];
}

/**
 * Where one grant's money goes: its total, what it has given and not yet
 * given, each share with its warnings, and whether more is out than it has.
 * Undefined for a grant that is not there.
 */
export function grantGiving(state: PortalState, grantId: string): GrantGiving | undefined {
  const grant = grantById(state, grantId);
  if (!grant) return undefined;
  const total = grantPot(grant);
  const given = grantGiven(state, grantId);
  const shares: ShareView[] = sharesOfGrant(state, grantId)
    .map(share => {
      const project =
        share.target.kind === 'project' ? projectById(state, share.target.projectId) : undefined;
      return {
        share,
        name: targetName(state, share.target),
        programId: targetProgramId(state, share.target),
        archived: isArchived(project),
        counts: shareCounts(state, share),
        warnings: targetWarnings(state, grant, share.target),
      };
    })
    .sort((a, b) => kindRank(a.share) - kindRank(b.share));
  return {
    grant,
    standing: grantStanding(grant),
    total,
    given,
    notYetGiven: total - given,
    shares,
    warnings: overGiven(total, given),
  };
}

const kindRank = (share: GrantShare) => (share.target.kind === 'program' ? 0 : 1);

/**
 * The grants whose money can be given (Add money from a grant, Give): those
 * awarded, then those pending, each group by what they have, largest first.
 */
export function givingGrants(state: PortalState): GrantGiving[] {
  return state.grants.grants
    .filter(g => grantStanding(g) !== 'none')
    .map(g => grantGiving(state, g.id)!)
    .sort(
      (a, b) =>
        Number(b.standing === 'awarded') - Number(a.standing === 'awarded') || b.total - a.total,
    );
}

/**
 * What Give would warn about before it is given: the target's warnings, and
 * more given out than the grant has once `amount` is added. Pass the share
 * being changed as `replacing`, so its old amount is not counted twice.
 */
export function giveWarnings(
  state: PortalState,
  input: { grantId: string; target: FundingTarget; amount: number },
  replacing?: GrantShare,
): ShareWarning[] {
  const grant = grantById(state, input.grantId);
  if (!grant) return [];
  const before = grantGiven(state, grant.id) - (replacing ? replacingCount(state, replacing) : 0);
  return [
    ...targetWarnings(state, grant, input.target),
    ...overGiven(grantPot(grant), before + input.amount),
  ];
}

const replacingCount = (state: PortalState, share: GrantShare) =>
  shareCounts(state, share) ? share.amount : 0;

/**
 * What pays toward a program's year or a project: one source per grant that
 * counts, with its share, what it has not yet given, and its warnings.
 * Awarded first, then "If awarded", each by amount, largest first. A
 * program's year counts only the shares named for that year; a project counts
 * all its shares, whatever years it runs in.
 */
export function fundingFor(state: PortalState, target: FundingTarget): FundingSource[] {
  const out: FundingSource[] = [];
  for (const share of state.grants.grantShares) {
    if (!sameTarget(share.target, target)) continue;
    const giving = grantGiving(state, share.grantId);
    if (!giving || giving.standing === 'none') continue;
    const { grant } = giving;
    out.push({
      id: grant.id,
      label: funderShortName(funderById(state, grant.funderId)?.name, true),
      detail: grant.title,
      href: `/grants/${grant.id}?tab=award`,
      amount: share.amount,
      ifAwarded: giving.standing === 'if-awarded',
      total: giving.total,
      notYetGiven: giving.notYetGiven,
      warnings: [...targetWarnings(state, grant, target), ...giving.warnings].map(w => w.message),
    });
  }
  return out.sort((a, b) => Number(a.ifAwarded) - Number(b.ifAwarded) || b.amount - a.amount);
}

/** The grants paying toward a program's year or a project, in `fundingFor`'s order. */
export function grantsPayingFor(state: PortalState, target: FundingTarget): Grant[] {
  return fundingFor(state, target).flatMap(s => grantById(state, s.id) ?? []);
}

/** This grant's share to this program year or project, if it has one. */
export function shareTo(
  state: PortalState,
  grantId: string,
  target: FundingTarget,
): GrantShare | undefined {
  return state.grants.grantShares.find(s => s.grantId === grantId && sameTarget(s.target, target));
}

// ---------------------------------------------------------------------------
// The rules Give, Change and Take back follow
// ---------------------------------------------------------------------------

/** What an amount that is not whole dollars above $0 is refused with. */
export const SHARE_AMOUNT_REFUSAL = 'Enter an amount in whole dollars, more than $0.';

function amountProblem(amount: unknown): string | undefined {
  return isWholeDollars(amount) && amount > 0 ? undefined : SHARE_AMOUNT_REFUSAL;
}

/** Why a grant has no money to give, or undefined when it has. */
function grantProblem(grant: Grant | undefined): string | undefined {
  if (!grant) return 'That grant is no longer in the portal.';
  if (isArchived(grant)) return 'This grant is archived. Restore it first.';
  if (grant.phase === 'prospect') return 'A grant has money to give once it reaches LOI or later.';
  if (grant.phase === 'declined') return 'This grant was declined, so it has no money to give.';
  if (grant.phase === 'withdrawn') return 'This grant was withdrawn, so it has no money to give.';
  return undefined;
}

function yearProblem(state: PortalState, label: FiscalYearLabel): string | undefined {
  return fiscalYearNamed(label, state.core.settings.fiscalYearStartMonth)
    ? undefined
    : 'Pick the fiscal year the money counts toward.';
}

/** Why this grant cannot give this, or undefined when it can. The warnings are separate. */
export function giveProblem(state: PortalState, input: GiveShareInput): string | undefined {
  const grant = grantById(state, input.grantId);
  const problem = grantProblem(grant) ?? amountProblem(input.amount);
  if (problem) return problem;
  const { target } = input;
  if (target.kind === 'program') {
    if (!programById(state, target.programId)) return 'That program is no longer in the portal.';
    return target.fiscalYear === undefined ? undefined : yearProblem(state, target.fiscalYear);
  }
  const project = projectById(state, target.projectId);
  if (!project) return 'That project is no longer in the portal.';
  if (isArchived(project)) return 'This project is archived. Restore it first.';
  return undefined;
}

/** Why a share cannot be changed like this, or undefined when it can. */
export function changeProblem(
  state: PortalState,
  id: string,
  change: ShareChange,
): string | undefined {
  const share = state.grants.grantShares.find(s => s.id === id);
  if (!share) return 'That share is no longer on the grant.';
  if (change.amount !== undefined) {
    const problem = amountProblem(change.amount);
    if (problem) return problem;
  }
  if (change.fiscalYear === undefined) return undefined;
  if (share.target.kind === 'project') {
    return 'A share to a project has no fiscal year: it counts in every year the project runs.';
  }
  const problem = yearProblem(state, change.fiscalYear);
  if (problem) return problem;
  const moved: FundingTarget = { ...share.target, fiscalYear: change.fiscalYear };
  const clash = shareTo(state, share.grantId, moved);
  if (clash && clash.id !== share.id) {
    return `This grant already gives to ${targetName(state, moved)}. Change that share instead.`;
  }
  return undefined;
}
