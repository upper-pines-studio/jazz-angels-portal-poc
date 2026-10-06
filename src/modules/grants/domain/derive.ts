import { fiscalYear, staffById } from '../../../core/derive';
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
 * (closed, declined, withdrawn) contribute nothing.
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
    if (isTerminal(grant.phase)) continue;

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
 * Totals for the fiscal year containing `today`.
 *  - requested: grants submitted inside the FY
 *  - awarded: grants decided inside the FY that we actually won
 *  - received: payments banked inside the FY
 *  - spent: expenses dated inside the FY
 */
export function fyTotals(state: PortalState, today: string): FyTotals {
  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
  const inFy = (date: string | undefined): boolean => !!date && date >= fy.start && date <= fy.end;

  let requested = 0;
  let awarded = 0;
  for (const g of state.grants.grants) {
    if (inFy(g.dates.submitted)) requested += g.amountRequested ?? 0;
    if (inFy(g.dates.decided) && AWARDED_PHASES.includes(g.phase)) {
      awarded += g.amountAwarded ?? 0;
    }
  }

  const received = state.grants.payments
    .filter(p => inFy(p.receivedDate))
    .reduce((sum, p) => sum + p.amount, 0);
  const spent = state.grants.expenses
    .filter(e => inFy(e.date))
    .reduce((sum, e) => sum + e.amount, 0);

  return { ...fy, requested, awarded, received, spent };
}

/** Grants per phase, with the money attached — the dashboard pipeline strip. */
export function pipelineCounts(state: PortalState): PipelineBucket[] {
  const phases: Phase[] = [...PHASE_ORDER, 'declined', 'withdrawn'];
  return phases.map(phase => {
    const grants = state.grants.grants.filter(g => g.phase === phase);
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
 * that no grant is reachable only from "All".
 */
export function grantsByView(state: PortalState, view: GrantView): Grant[] {
  switch (view) {
    case 'active':
      return state.grants.grants.filter(g => !isTerminal(g.phase));
    case 'pre-award':
      return state.grants.grants.filter(g => PRE_AWARD_PHASES.includes(g.phase));
    case 'post-award':
      return state.grants.grants.filter(g => POST_AWARD_PHASES.includes(g.phase));
    case 'closed':
      return state.grants.grants.filter(g => isTerminal(g.phase));
    case 'all':
    default:
      return state.grants.grants;
  }
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

export function grantById(state: PortalState, id: string): Grant | undefined {
  return state.grants.grants.find(g => g.id === id);
}

export function funderById(state: PortalState, id: string) {
  return state.grants.funders.find(f => f.id === id);
}

export function grantsByFunder(state: PortalState, funderId: string): Grant[] {
  return state.grants.grants.filter(g => g.funderId === funderId);
}

/** Every grant whose money is for this program. Part of the module's public API. */
export function grantsForProgram(state: PortalState, programId: ProgramId): Grant[] {
  return state.grants.grants.filter(g => g.program === programId);
}

/** Total awarded across every grant from this funder. */
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
