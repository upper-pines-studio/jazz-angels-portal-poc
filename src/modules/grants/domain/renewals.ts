import { addDays, addYears } from 'date-fns';
import { isArchived } from '../../../core/archive';
import { programById, programName, staffById } from '../../../core/derive';
import { toDate, toISO } from '../../../core/format';
import type { PortalState, ProgramId } from '../../../core/types';
import { grantsByFunder } from './derive';
import { POST_AWARD_PHASES } from './phases';
import { DEFAULT_TEMPLATE_ID, RENEWAL_TEMPLATE_ID } from './templates';
import type { ChecklistTemplate, Grant, GrantDates, Phase, RenewGrantInput } from './types';

/**
 * Renewals (decision 0005, #67): "Start next year's" makes a new grant from
 * this year's, prefilled, and links the two. A grant is renewed at most once.
 * The action is `renewGrant` in the slice; these are the pure parts of it.
 */

/** The phases a grant may be renewed from: once it has been awarded. */
export const RENEWABLE_PHASES: Phase[] = POST_AWARD_PHASES;

/** "Start working by" on a renewal trails its application due date by this many days, as in Add grant. */
export const RENEWAL_LEAD_DAYS = 45;

/** A year, or a fiscal-year label or range: "2026", "2026-27", "FY26", "FY26-27", "FY2026/2027". */
const YEARISH =
  /\bFY\s?\d{2}(?:\d{2})?(?:\s?[-–/]\s?\d{2}(?:\d{2})?)?\b|\b(?:19|20)\d{2}(?:[-–/]\d{2}(?:\d{2})?)?\b/gi;

function nextYearDigits(digits: string): string {
  const n = Number(digits) + 1;
  return digits.length === 2 ? String(n % 100).padStart(2, '0') : String(n);
}

/**
 * Last year's title with every year in it moved on by one: "General operating
 * support 2026" → "… 2027", "Organizational Grant Program FY26-27" → "… FY27-28".
 * A title with no year is kept as it is.
 */
export function nextYearTitle(title: string): string {
  return title.replace(YEARISH, match => match.replace(/\d+/g, nextYearDigits));
}

/** The grant dates a renewal starts from: last year's deadlines and period. */
const MOVED_ON: Array<keyof GrantDates> = [
  'loiDue',
  'applicationDue',
  'decisionExpected',
  'periodStart',
  'periodEnd',
];

function nextYearDate(iso: string | undefined): string | undefined {
  return iso ? toISO(addYears(toDate(iso), 1)) : undefined;
}

/**
 * Last year's LOI due, application due, expected decision and grant period,
 * each moved on by one year (Feb 29 becomes Feb 28). A blank date stays blank;
 * the dates that record what happened (submitted, decided) are not carried.
 */
export function nextYearDates(dates: GrantDates): GrantDates {
  const out: GrantDates = {};
  for (const key of MOVED_ON) {
    const moved = nextYearDate(dates[key]);
    if (moved) out[key] = moved;
  }
  return out;
}

/** "Start working by", suggested from the application due date, as Add grant does. */
export function suggestedStartBy(applicationDue: string | undefined): string | undefined {
  return applicationDue ? toISO(addDays(toDate(applicationDue), -RENEWAL_LEAD_DAYS)) : undefined;
}

/** The checklist a renewal gets: "Renewal (returning funder)", else Add grant's default, else the first, else none. */
export function renewalTemplateId(templates: readonly ChecklistTemplate[]): string | null {
  for (const id of [RENEWAL_TEMPLATE_ID, DEFAULT_TEMPLATE_ID]) {
    if (templates.some(t => t.id === id)) return id;
  }
  return templates[0]?.id ?? null;
}

/** The grant that renews this one, if it has been renewed. Archived or not. */
export function renewedAs(state: PortalState, grantId: string): Grant | undefined {
  return state.grants.grants.find(g => g.renewsGrantId === grantId);
}

/** The grant this one renews: last year's. */
export function renewalOf(
  state: PortalState,
  grant: Pick<Grant, 'renewsGrantId'>,
): Grant | undefined {
  return grant.renewsGrantId
    ? state.grants.grants.find(g => g.id === grant.renewsGrantId)
    : undefined;
}

/**
 * Why this grant cannot be renewed, or undefined when it can. The button is
 * offered only when this says nothing, except for an archived funder, which
 * the dialog explains. The store asks the same.
 */
export function renewalRefusal(state: PortalState, grantId: string): string | undefined {
  const grant = state.grants.grants.find(g => g.id === grantId);
  if (!grant) return 'That grant is no longer here.';
  if (isArchived(grant)) return "Restore this grant before starting next year's.";
  if (!RENEWABLE_PHASES.includes(grant.phase))
    return 'A grant is renewed once it has been awarded.';
  const next = renewedAs(state, grant.id);
  if (next) return `This grant was already renewed as ${next.title}.`;
  const funder = state.grants.funders.find(f => f.id === grant.funderId);
  if (!funder) return "This grant's funder is no longer here, so it cannot be renewed.";
  if (isArchived(funder))
    return `${funder.name} is archived. Restore the funder before starting next year's grant.`;
  return undefined;
}

/** Why the dialog's answers cannot be saved, or undefined when they can. */
export function renewInputProblem(state: PortalState, input: RenewGrantInput): string | undefined {
  if (!input.title?.trim()) return "Give next year's grant a title.";
  if (!Array.isArray(input.programs) || input.programs.length === 0)
    return 'Choose at least one program.';
  for (const id of input.programs) {
    const program = programById(state, id);
    if (!program || isArchived(program))
      return `${programName(state, id)} is archived. Choose a current program.`;
  }
  const owner = staffById(state, input.ownerId);
  if (!owner || isArchived(owner)) return 'Choose a current owner.';
  if (
    input.amountRequested !== undefined &&
    (!Number.isInteger(input.amountRequested) || input.amountRequested < 0)
  )
    return 'Enter the amount to request in whole dollars.';
  return undefined;
}

/** What the "Start next year's" dialog opens with, and what it must ask again. */
export interface RenewalDraft {
  title: string;
  /** This year's award, else this year's request. */
  amountRequested?: number;
  dates: GrantDates;
  /** Last year's owner, or '' when they are archived. */
  ownerId: string;
  /** Last year's programs that are still current. */
  programs: ProgramId[];
  /** Last year's owner's name, when they are archived and someone else must be picked. */
  archivedOwner?: string;
  /** The names of last year's programs that are archived. */
  archivedPrograms: string[];
}

export function renewalDraft(state: PortalState, grant: Grant): RenewalDraft {
  const owner = staffById(state, grant.ownerId);
  const ownerCurrent = !!owner && !isArchived(owner);
  const current = (id: ProgramId) => {
    const p = programById(state, id);
    return !!p && !isArchived(p);
  };
  const dates = nextYearDates(grant.dates);
  if (!grant.loiRequired) delete dates.loiDue;
  const startBy = suggestedStartBy(dates.applicationDue);
  if (startBy) dates.startBy = startBy;
  return {
    title: nextYearTitle(grant.title),
    amountRequested: grant.amountAwarded ?? grant.amountRequested,
    dates,
    ownerId: ownerCurrent ? grant.ownerId : '',
    programs: grant.programs.filter(current),
    archivedOwner: ownerCurrent ? undefined : (owner?.name ?? "Last year's owner"),
    archivedPrograms: grant.programs.filter(id => !current(id)).map(id => programName(state, id)),
  };
}

/** The activity row on the renewal. Not a phase change: the stepper reads none from it. */
export function renewalStartedText(lastYearTitle: string): string {
  return `Started as the renewal of ${lastYearTitle}`;
}

/** The activity row on last year's grant. */
export function renewedAsText(nextYearTitle: string): string {
  return `Renewed as ${nextYearTitle}`;
}

/** One row of a funder's grant history. */
export interface GrantHistoryRow {
  grant: Grant;
  /** The grant it renews, when that is one of this funder's grants. */
  renews?: Grant;
}

/** When a grant belongs to, for ordering the history: its application due date, else the day it was added. */
function yearKey(grant: Grant): string {
  return grant.dates.applicationDue ?? grant.createdAt;
}

/**
 * A funder's grant history, archived grants included, newest first, with each
 * chain of renewals kept together: every grant sits just above the one it
 * renews. Chains are ordered by their newest grant.
 */
export function funderGrantHistory(state: PortalState, funderId: string): GrantHistoryRow[] {
  const grants = grantsByFunder(state, funderId);
  const byId = new Map(grants.map(g => [g.id, g]));
  const children = new Map<string, Grant[]>();
  const roots: Grant[] = [];
  for (const g of grants) {
    const parent =
      g.renewsGrantId && g.renewsGrantId !== g.id ? byId.get(g.renewsGrantId) : undefined;
    if (parent) children.set(parent.id, [...(children.get(parent.id) ?? []), g]);
    else roots.push(g);
  }
  const newestFirst = (a: Grant, b: Grant) =>
    yearKey(b).localeCompare(yearKey(a)) || b.createdAt.localeCompare(a.createdAt);

  // Each chain oldest first, then turned round.
  const seen = new Set<string>();
  const chain = (g: Grant, out: Grant[]) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    out.push(g);
    for (const c of (children.get(g.id) ?? []).slice().sort((a, b) => newestFirst(b, a))) {
      chain(c, out);
    }
  };
  const chains = roots.map(root => {
    const out: Grant[] = [];
    chain(root, out);
    return out.reverse();
  });
  // A loop of links has no root: each of its grants stands alone.
  for (const g of grants) if (!seen.has(g.id)) chains.push([g]);

  chains.sort((a, b) => newestFirst(a[0], b[0]));
  return chains.flat().map(grant => {
    const renews = grant.renewsGrantId ? byId.get(grant.renewsGrantId) : undefined;
    return renews && renews.id !== grant.id ? { grant, renews } : { grant };
  });
}

/**
 * On load: a link to a grant that is no longer saved, or to the grant itself,
 * is dropped. Every other grant loads as it was saved.
 */
export function withRenewalLinks(grants: Grant[]): Grant[] {
  const ids = new Set(grants.map(g => g.id));
  return grants.map(g => {
    if (g.renewsGrantId === undefined) return g;
    if (typeof g.renewsGrantId === 'string' && g.renewsGrantId !== g.id && ids.has(g.renewsGrantId))
      return g;
    const { renewsGrantId: _gone, ...rest } = g;
    return rest;
  });
}
