import { activeOnly, isArchived, withArchived } from '../../../core/archive';
import { fiscalYear, programById, programName, staffById } from '../../../core/derive';
import { daysUntil } from '../../../core/format';
import type { PortalState, ProgramId } from '../../../core/types';
import { PHASE_ORDER, POST_AWARD_PHASES, PRE_AWARD_PHASES, isTerminal, phaseIndex } from './phases';
import type {
  Activity,
  Deadline,
  DeadlineKind,
  DeadlineStatus,
  FyTotals,
  Grant,
  GrantMoney,
  GrantView,
  Phase,
  PipelineBucket,
} from './types';

/**
 * Derived data (SPEC §2). Every function here is pure: it takes state and
 * returns a fresh value. Nothing in here is ever persisted.
 */

/** A deadline is "due soon" when it falls within this many days, inclusive. */
export const DUE_SOON_DAYS = 14;

export function deadlineStatus(date: string, today: string): DeadlineStatus {
  const days = daysUntil(date, today);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

const KIND_RANK: Record<DeadlineKind, number> = {
  application: 0,
  loi: 1,
  report: 2,
  payment: 3,
  decision: 4,
  'period-end': 5,
  start: 6,
  task: 7,
};

/**
 * Every dated thing that still needs doing, across all grants, sorted by date.
 *
 * Sources: open tasks with a due date, reports not yet submitted, payments not
 * yet received, and the grant's own key dates. Grants in a terminal phase
 * (closed, declined, withdrawn) contribute nothing, and nor does an archived
 * grant (decision 0002).
 *
 * Choices the spec left open:
 *  - `startBy` only counts while the grant is still a `prospect`; once work has
 *    started the reminder is moot.
 *  - `loiDue` / `applicationDue` drop off once the grant is past that phase.
 *  - `decisionExpected` only counts while the grant sits in `submitted`.
 *  - `periodEnd` only counts in `awarded` / `active`; by `reporting` the period
 *    is over and the report is the real deadline.
 *  - A grant date and an open task falling on the same day for the same grant
 *    are the same deadline (the standard template's "Submit application" is
 *    anchored to `applicationDue`), so the grant date wins and the duplicate
 *    task row is folded into it.
 */
export function deadlines(state: PortalState, today: string): Deadline[] {
  const out: Deadline[] = [];
  const byGrant = new Map<string, Grant>();

  for (const grant of state.grants.grants) {
    byGrant.set(grant.id, grant);
    if (isTerminal(grant.phase) || isArchived(grant)) continue;

    const idx = phaseIndex(grant.phase);
    const claimed = new Set<string>();
    const push = (kind: DeadlineKind, date: string, label: string) => {
      claimed.add(date);
      out.push({
        id: `${kind}:${grant.id}`,
        date,
        kind,
        label,
        grantId: grant.id,
        ownerId: grant.ownerId,
        status: deadlineStatus(date, today),
      });
    };

    const d = grant.dates;
    if (d.startBy && grant.phase === 'prospect') push('start', d.startBy, 'Start working on this');
    if (d.loiDue && idx <= phaseIndex('loi')) push('loi', d.loiDue, 'LOI due');
    if (d.applicationDue && idx <= phaseIndex('applying')) {
      push('application', d.applicationDue, 'Application due');
    }
    if (d.decisionExpected && grant.phase === 'submitted') {
      push('decision', d.decisionExpected, 'Decision expected');
    }
    if (d.periodEnd && (grant.phase === 'awarded' || grant.phase === 'active')) {
      push('period-end', d.periodEnd, 'Grant period ends');
    }

    for (const task of state.grants.tasks) {
      if (task.grantId !== grant.id) continue;
      if (task.done || !task.dueDate) continue;
      if (claimed.has(task.dueDate)) continue;
      out.push({
        id: `task:${task.id}`,
        date: task.dueDate,
        kind: 'task',
        label: task.title,
        grantId: grant.id,
        ownerId: task.assigneeId ?? grant.ownerId,
        status: deadlineStatus(task.dueDate, today),
      });
    }

    for (const report of state.grants.reports) {
      if (report.grantId !== grant.id) continue;
      if (report.submittedDate || report.status === 'submitted' || report.status === 'accepted') {
        continue;
      }
      out.push({
        id: `report:${report.id}`,
        date: report.dueDate,
        kind: 'report',
        label: `${report.kind === 'final' ? 'Final' : 'Interim'} report due`,
        grantId: grant.id,
        ownerId: grant.ownerId,
        status: deadlineStatus(report.dueDate, today),
      });
    }

    for (const payment of state.grants.payments) {
      if (payment.grantId !== grant.id) continue;
      if (payment.receivedDate) continue;
      out.push({
        id: `payment:${payment.id}`,
        date: payment.expectedDate,
        kind: 'payment',
        label: `${payment.label} expected`,
        grantId: grant.id,
        ownerId: grant.ownerId,
        status: deadlineStatus(payment.expectedDate, today),
      });
    }
  }

  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.label.localeCompare(b.label),
  );
}

export function grantDeadlines(state: PortalState, grantId: string, today: string): Deadline[] {
  return deadlines(state, today).filter(d => d.grantId === grantId);
}

/** The single most urgent open deadline for a grant, or undefined. */
export function nextDeadline(
  state: PortalState,
  grantId: string,
  today: string,
): Deadline | undefined {
  return grantDeadlines(state, grantId, today)[0];
}

/** Money on one grant: what was awarded, what arrived, what has been spent. */
export function grantMoney(state: PortalState, grantId: string): GrantMoney {
  const grant = state.grants.grants.find(g => g.id === grantId);
  const awarded = grant?.amountAwarded ?? 0;

  let received = 0;
  let expectedRemaining = 0;
  for (const p of state.grants.payments) {
    if (p.grantId !== grantId) continue;
    if (p.receivedDate) received += p.amount;
    else expectedRemaining += p.amount;
  }

  const expenses = state.grants.expenses.filter(e => e.grantId === grantId);
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const lines = state.grants.budgetLines.filter(l => l.grantId === grantId);
  const plannedTotal = lines.reduce((sum, l) => sum + l.planned, 0);
  const byLine = lines.map(line => ({
    line,
    spent: expenses.filter(e => e.budgetLineId === line.id).reduce((s, e) => s + e.amount, 0),
  }));

  return {
    awarded,
    received,
    expectedRemaining,
    spent,
    remaining: awarded - spent,
    plannedTotal,
    byLine,
  };
}

const AWARDED_PHASES: Phase[] = ['awarded', 'active', 'reporting', 'closed'];

/**
 * Totals for the fiscal year containing `today`, over the grants that are not
 * archived: the dashboard and the Grants page quote them.
 *  - requested: grants submitted inside the FY
 *  - awarded: grants decided inside the FY that we actually won
 *  - received: payments banked inside the FY
 *  - spent: expenses dated inside the FY
 */
export function fyTotals(state: PortalState, today: string): FyTotals {
  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
  const inFy = (date: string | undefined): boolean => !!date && date >= fy.start && date <= fy.end;
  const current = activeOnly(state.grants.grants);
  const counted = new Set(current.map(g => g.id));

  let requested = 0;
  let awarded = 0;
  for (const g of current) {
    if (inFy(g.dates.submitted)) requested += g.amountRequested ?? 0;
    if (inFy(g.dates.decided) && AWARDED_PHASES.includes(g.phase)) {
      awarded += g.amountAwarded ?? 0;
    }
  }

  const received = state.grants.payments
    .filter(p => counted.has(p.grantId) && inFy(p.receivedDate))
    .reduce((sum, p) => sum + p.amount, 0);
  const spent = state.grants.expenses
    .filter(e => counted.has(e.grantId) && inFy(e.date))
    .reduce((sum, e) => sum + e.amount, 0);

  return { ...fy, requested, awarded, received, spent };
}

/** Grants per phase, with the money attached — the dashboard pipeline strip. Archived ones are left out. */
export function pipelineCounts(state: PortalState): PipelineBucket[] {
  const phases: Phase[] = [...PHASE_ORDER, 'declined', 'withdrawn'];
  const current = activeOnly(state.grants.grants);
  return phases.map(phase => {
    const grants = current.filter(g => g.phase === phase);
    return {
      phase,
      count: grants.length,
      requested: grants.reduce((sum, g) => sum + (g.amountRequested ?? 0), 0),
      awarded: grants.reduce((sum, g) => sum + (g.amountAwarded ?? 0), 0),
    };
  });
}

/**
 * The All-grants tabs (SPEC §4.2).
 * "closed" collects everything finished — closed, declined and withdrawn — so
 * that no grant is reachable only from "All". Archived grants are left out
 * unless `includeArchived` is set, and then come after the current ones.
 */
export function grantsByView(
  state: PortalState,
  view: GrantView,
  includeArchived = false,
): Grant[] {
  const grants = state.grants.grants;
  const inView = (() => {
    switch (view) {
      case 'active':
        return grants.filter(g => !isTerminal(g.phase));
      case 'pre-award':
        return grants.filter(g => PRE_AWARD_PHASES.includes(g.phase));
      case 'post-award':
        return grants.filter(g => POST_AWARD_PHASES.includes(g.phase));
      case 'closed':
        return grants.filter(g => isTerminal(g.phase));
      case 'all':
      default:
        return grants;
    }
  })();
  return withArchived(inView, includeArchived);
}

/** "8 of 12 done" on the checklist tab. */
export function checklistProgress(
  state: PortalState,
  grantId: string,
): { done: number; total: number } {
  const tasks = state.grants.tasks.filter(t => t.grantId === grantId);
  return { done: tasks.filter(t => t.done).length, total: tasks.length };
}

// ---------------------------------------------------------------------------
// Small lookup helpers screens need constantly
// ---------------------------------------------------------------------------

/** Archived or not: a link from history still opens it. */
export function grantById(state: PortalState, id: string): Grant | undefined {
  return state.grants.grants.find(g => g.id === id);
}

export function funderById(state: PortalState, id: string) {
  return state.grants.funders.find(f => f.id === id);
}

/** Every grant from this funder, archived ones included: the funder's grant history. */
export function grantsByFunder(state: PortalState, funderId: string): Grant[] {
  return state.grants.grants.filter(g => g.funderId === funderId);
}

/**
 * The Funders list: current funders, then the archived ones after them when
 * `includeArchived` is set.
 */
export function fundersList(state: PortalState, includeArchived = false) {
  return withArchived(state.grants.funders, includeArchived);
}

/** Every grant whose money is for this program, among others if it names several. Part of the module's public API. */
export function grantsForProgram(state: PortalState, programId: ProgramId): Grant[] {
  return state.grants.grants.filter(g => g.programs.includes(programId));
}

/** The seeded id of the program for money that pays for the whole studio. */
export const GENERAL_OPERATING = 'general-operating';

/** A grant on General operating pays for every program, so its numbers are not narrowed. */
export function coversWholeStudio(grant: Pick<Grant, 'programs'>): boolean {
  return grant.programs.includes(GENERAL_OPERATING);
}

/**
 * The grant's programs in words: "In-School Program and Homeschool Program",
 * or with three, "A, B and C". `short` uses the short names a narrow column has room for.
 */
export function programNames(
  state: PortalState,
  grant: Pick<Grant, 'programs'>,
  short = false,
): string {
  const names = grant.programs.map(id =>
    short ? (programById(state, id)?.short ?? programName(state, id)) : programName(state, id),
  );
  if (names.length < 2) return names[0] ?? '—';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Total awarded across every grant from this funder, archived ones included:
 * it is the funder's history, "awarded all time".
 */
export function funderTotals(state: PortalState, funderId: string) {
  const grants = grantsByFunder(state, funderId);
  return {
    grants: grants.length,
    requested: grants.reduce((sum, g) => sum + (g.amountRequested ?? 0), 0),
    awarded: grants.reduce((sum, g) => sum + (g.amountAwarded ?? 0), 0),
  };
}

/**
 * Who an activity row credits: the staff member's name as it is now, else
 * the name the row was saved with, else "Someone".
 */
export function activityWho(state: PortalState, row: Activity): string {
  return staffById(state, row.whoId)?.name ?? row.who ?? 'Someone';
}

export function grantActivity(state: PortalState, grantId: string) {
  return state.grants.activity
    .filter(a => a.grantId === grantId)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));
}
