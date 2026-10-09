import { addDays, addYears } from 'date-fns';
import { activeOnly, pickable, withArchived } from './archive';
import { toDate, toISO } from './format';
import type {
  Address,
  FiscalYear,
  FiscalYearLabel,
  FundingTarget,
  Organization,
  PortalState,
  Program,
  ProgramId,
  Project,
  ProjectInput,
  StaffMember,
  Venue,
} from './types';

/** Derived data on the shared nouns. Every function here is pure. */

/**
 * The fiscal year containing `dateISO`. Jazz Angels runs Jul 1 – Jun 30, and
 * the year is named for the year it ends: Jul 1 2026 – Jun 30 2027 is "FY27".
 */
export function fiscalYear(dateISO: string, startMonth: number): FiscalYear {
  const d = toDate(dateISO);
  const month = d.getMonth() + 1;
  const startYear = month >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(startYear, startMonth - 1, 1);
  const end = addDays(addYears(start, 1), -1);
  return {
    label: `FY${String(end.getFullYear() % 100).padStart(2, '0')}`,
    start: toISO(start),
    end: toISO(end),
  };
}

/**
 * The fiscal year with this name ("FY27"), or undefined when the name is not
 * one. The name is the year it ends, so with a July start FY27 runs Jul 1 2026
 * to Jun 30 2027, and with a January start Jan 1 to Dec 31 2027.
 */
export function fiscalYearNamed(
  label: FiscalYearLabel,
  startMonth: number,
): FiscalYear | undefined {
  const match = /^FY(\d{2})$/.exec(label);
  if (!match) return undefined;
  const endYear = 2000 + Number(match[1]);
  const startYear = startMonth === 1 ? endYear : endYear - 1;
  return fiscalYear(`${startYear}-${String(startMonth).padStart(2, '0')}-01`, startMonth);
}

/** Every fiscal year that a span of dates touches, in order: one, or several. */
export function fiscalYearsOverlapping(
  start: string,
  end: string,
  startMonth: number,
): FiscalYear[] {
  const out: FiscalYear[] = [];
  if (end < start) return out;
  let fy = fiscalYear(start, startMonth);
  while (fy.start <= end) {
    out.push(fy);
    fy = fiscalYear(toISO(addDays(toDate(fy.end), 1)), startMonth);
  }
  return out;
}

/**
 * The fiscal years a Programs page offers: this one and the next, and any
 * year a program has a budget in or a project runs in, in order.
 */
export function fiscalYearChoices(state: PortalState, today: string): FiscalYear[] {
  const startMonth = state.core.settings.fiscalYearStartMonth;
  const current = fiscalYear(today, startMonth);
  const next = fiscalYear(toISO(addDays(toDate(current.end), 1)), startMonth);
  const byLabel = new Map<string, FiscalYear>([
    [current.label, current],
    [next.label, next],
  ]);
  for (const b of state.core.programBudgets) {
    const fy = fiscalYearNamed(b.fiscalYear, startMonth);
    if (fy) byLabel.set(fy.label, fy);
  }
  for (const p of activeOnly(state.core.projects)) {
    for (const fy of fiscalYearsOverlapping(p.start, p.end, startMonth)) byLabel.set(fy.label, fy);
  }
  return [...byLabel.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Anyone by id, archived or not: a past approval, an activity row or a class
 * lead still names whoever it was (decision 0002).
 */
export function staffById(state: PortalState, id: string | undefined): StaffMember | undefined {
  return id ? state.core.staff.find(s => s.id === id) : undefined;
}

export function programById(state: PortalState, id: string): Program | undefined {
  return state.core.programs.find(p => p.id === id);
}

/**
 * The program's full name, falling back to its id so a row is never blank.
 * An archived program still reads by its name on the records that name it.
 */
export function programName(state: PortalState, id: string): string {
  return programById(state, id)?.name ?? id;
}

/**
 * The programs a picker offers: the current ones, plus `keepId` when the
 * record being edited already names one that has since been archived.
 */
export function programOptions(state: PortalState, keepId?: string): Program[] {
  return pickable(state.core.programs, keepId);
}

/**
 * The programs as Settings lists them: the current ones, then, with
 * `includeArchived`, the archived ones after them.
 */
export function programsList(state: PortalState, includeArchived = false): Program[] {
  return withArchived(state.core.programs, includeArchived);
}

/** A program's name and short name, tidied: trimmed, the short name falling back to the name. */
export function programFields(input: Partial<Pick<Program, 'name' | 'short'>>) {
  const name = input.name?.trim() ?? '';
  return { name, short: input.short?.trim() || name };
}

/** Why a program cannot be saved with this name, or undefined when it can. */
export function programProblem(
  programs: readonly Program[],
  input: Partial<Pick<Program, 'name' | 'short'>>,
  id?: string,
): string | undefined {
  const { name } = programFields(input);
  if (!name) return 'Give the program a name.';
  const taken = programs.find(
    p => p.id !== id && p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (taken) return `There is already a program called ${taken.name}.`;
  return undefined;
}

/** A whole number of dollars, 0 or more: what a budget or an amount may be. */
export function isWholeDollars(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0;
}

/** What `setProgramBudget` and a project's budget refuse with. */
export const BUDGET_REFUSAL = 'Enter the budget in whole dollars, 0 or more.';

/**
 * What a program costs in a fiscal year ("FY27"), or undefined when nobody has
 * set a budget for that year.
 */
export function programBudget(
  state: PortalState,
  programId: ProgramId,
  fiscalYearLabel: FiscalYearLabel,
): number | undefined {
  return state.core.programBudgets.find(
    b => b.programId === programId && b.fiscalYear === fiscalYearLabel,
  )?.amount;
}

/** Why a program's budget for a year cannot be set, or undefined when it can. */
export function programBudgetProblem(
  state: PortalState,
  programId: ProgramId,
  fiscalYearLabel: FiscalYearLabel,
  amount: number,
): string | undefined {
  if (!programById(state, programId)) return 'That program is no longer in the portal.';
  if (!fiscalYearNamed(fiscalYearLabel, state.core.settings.fiscalYearStartMonth)) {
    return 'Pick a fiscal year for the budget.';
  }
  if (!isWholeDollars(amount)) return BUDGET_REFUSAL;
  return undefined;
}

/** A project by id, archived or not: a grant's share still names it. */
export function projectById(state: PortalState, id: string): Project | undefined {
  return state.core.projects.find(p => p.id === id);
}

/** The project's name, falling back to its id so a row is never blank. */
export function projectName(state: PortalState, id: string): string {
  return projectById(state, id)?.name ?? id;
}

/**
 * The projects under one program: the current ones, then, with
 * `includeArchived`, the archived ones after them. Each group by start date.
 */
export function projectsForProgram(
  state: PortalState,
  programId: ProgramId,
  includeArchived = false,
): Project[] {
  const rows = state.core.projects
    .filter(p => p.programId === programId)
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  return withArchived(rows, includeArchived);
}

/** True when any of the project's days fall inside the fiscal year. */
export function projectOverlaps(project: Pick<Project, 'start' | 'end'>, fy: FiscalYear): boolean {
  return project.start <= fy.end && project.end >= fy.start;
}

/**
 * The projects a fiscal year lists (decision 0006): every one whose dates
 * overlap it, so a project that crosses into the next year shows in both,
 * with all its funding. Archived ones only with `includeArchived`, after.
 */
export function projectsInFiscalYear(
  state: PortalState,
  fy: FiscalYear,
  includeArchived = false,
): Project[] {
  return withArchived(
    state.core.projects.filter(p => projectOverlaps(p, fy)),
    includeArchived,
  );
}

/** A project's fields, tidied: the name trimmed. */
export function projectFields<T extends Partial<ProjectInput>>(input: T): T {
  return typeof input.name === 'string' ? { ...input, name: input.name.trim() } : input;
}

/** Why a project cannot be saved like this, or undefined when it can. */
export function projectProblem(
  state: PortalState,
  input: Partial<ProjectInput>,
): string | undefined {
  const { name, programId, start, end, budget } = projectFields(input);
  if (!name) return 'Give the project a name.';
  if (!programId || !programById(state, programId)) return 'Pick the program it is part of.';
  if (!start || !end) return 'Give the project a start and an end date.';
  if (end < start) return 'The project ends before it starts.';
  if (!isWholeDollars(budget)) return BUDGET_REFUSAL;
  return undefined;
}

/**
 * What a program's year or a project costs: the program's budget for that
 * year (0 when none is set), or the project's budget.
 */
export function targetBudget(state: PortalState, target: FundingTarget): number {
  if (target.kind === 'program') {
    return programBudget(state, target.programId, target.fiscalYear) ?? 0;
  }
  return projectById(state, target.projectId)?.budget ?? 0;
}

/** A program's year or a project in words: "In-School Program, FY27", "Spring Showcase 2027". */
export function targetName(state: PortalState, target: FundingTarget): string {
  return target.kind === 'program'
    ? `${programName(state, target.programId)}, ${target.fiscalYear}`
    : projectName(state, target.projectId);
}

/** The program a target belongs to: the program itself, or the project's program. */
export function targetProgramId(state: PortalState, target: FundingTarget): ProgramId | undefined {
  return target.kind === 'program'
    ? target.programId
    : projectById(state, target.projectId)?.programId;
}

/** True when two targets are the same program year or the same project. */
export function sameTarget(a: FundingTarget, b: FundingTarget): boolean {
  if (a.kind === 'program' && b.kind === 'program') {
    return a.programId === b.programId && a.fiscalYear === b.fiscalYear;
  }
  return a.kind === 'project' && b.kind === 'project' && a.projectId === b.projectId;
}

/**
 * A target as one string, for a React key or a URL: `program:in-school:FY27`,
 * `project:prj-showcase`.
 */
export function targetKey(target: FundingTarget): string {
  return target.kind === 'program'
    ? `program:${target.programId}:${target.fiscalYear}`
    : `project:${target.projectId}`;
}

/** The money toward one program year or project, from every module that pays for things. */
export interface FundingSummary {
  budget: number;
  /** From awarded grants. */
  awarded: number;
  /** From pending grants, if they come in. Kept apart from awarded money. */
  ifAwarded: number;
  /** awarded + ifAwarded. */
  funded: number;
  /** What the budget still needs once pending grants come in; 0 when covered. */
  stillToFind: number;
  /** How far the funding goes past the budget; 0 when it does not. */
  overBudget: number;
}

/**
 * The figures at the top of a program's or project's sheet, from its budget
 * and what pays for it (`ModuleManifest.funding`).
 */
export function fundingSummary(
  budget: number,
  sources: ReadonlyArray<{ amount: number; ifAwarded: boolean }>,
): FundingSummary {
  let awarded = 0;
  let ifAwarded = 0;
  for (const s of sources) {
    if (s.ifAwarded) ifAwarded += s.amount;
    else awarded += s.amount;
  }
  const funded = awarded + ifAwarded;
  return {
    budget,
    awarded,
    ifAwarded,
    funded,
    stillToFind: Math.max(0, budget - funded),
    overBudget: Math.max(0, funded - budget),
  };
}

export function organizationById(
  state: PortalState,
  id: string | undefined,
): Organization | undefined {
  return id ? state.core.organizations.find(o => o.id === id) : undefined;
}

export function venueById(state: PortalState, id: string | undefined): Venue | undefined {
  return id ? state.core.venues.find(v => v.id === id) : undefined;
}

/** The venue's name, falling back to its id so a row is never blank. */
export function venueName(state: PortalState, id: string): string {
  return venueById(state, id)?.name ?? id;
}

/**
 * Every current venue that belongs to one organization: a district's schools.
 * `includeArchived` adds the archived ones after them.
 */
export function venuesForOrganization(
  state: PortalState,
  organizationId: string,
  includeArchived = false,
): Venue[] {
  return withArchived(
    state.core.venues.filter(v => v.organizationId === organizationId),
    includeArchived,
  );
}

/**
 * Where a class is, the way staff say it. In Jazz Angels' own studio the room
 * is enough ("Studio 1"); anywhere else the venue comes first
 * ("Paramount Middle School · Band room"). A room-less venue is just its name.
 */
export function placeLabel(
  state: PortalState,
  venueId: string | undefined,
  room: string | undefined,
): string {
  const venue = venueById(state, venueId);
  const roomText = room?.trim() ?? '';
  if (!venue) return roomText || venueId || '—';
  if (venue.kind === 'studio') return roomText || venue.name;
  return roomText ? `${venue.name} · ${roomText}` : venue.name;
}

/** "8500 Contreras St, Paramount, CA 90723" on one line. */
export function addressLine(address: Address | undefined): string {
  if (!address) return '';
  const cityLine = [address.city, [address.state, address.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.street, cityLine].filter(Boolean).join(', ');
}
