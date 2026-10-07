import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fiscalYear } from '../../../core/derive';
import { dateLong, money } from '../../../core/format';
import type { PortalState } from '../../../core/types';
import type {
  Allocation,
  BackupCarry,
  BackupSummary,
  BudgetLine,
  Expense,
  Grant,
  GrantFile,
  LinePace,
  Pace,
  PaceStatus,
  ReminderDefaults,
  ReminderPlan,
  ReminderStep,
  Report,
  Suggestion,
  Transaction,
  TransactionSnapshot,
  TransactionStatus,
  UsualShares,
} from './types';

/**
 * Derived data for the money side of a grant: pacing, what QuickBooks sent and
 * where it belongs, the backup behind each expense, and the reminder emails.
 * Every function is pure. Nothing here is persisted.
 */

// ---------------------------------------------------------------------------
// Which grants have money to track
// ---------------------------------------------------------------------------

/** Awarded, active or reporting, with an award on record. Closed grants are history. */
export function isTracked(grant: Grant): boolean {
  return (
    (grant.phase === 'awarded' || grant.phase === 'active' || grant.phase === 'reporting') &&
    typeof grant.amountAwarded === 'number'
  );
}

/** Tracked grants, the ones still spending first, then by end date. */
export function trackedGrants(state: PortalState): Grant[] {
  return state.grants.grants
    .filter(isTracked)
    .slice()
    .sort(
      (a, b) =>
        (b.dates.periodEnd ?? '').localeCompare(a.dates.periodEnd ?? '') ||
        a.title.localeCompare(b.title),
    );
}

/** Tracked grants whose period touches the fiscal year containing `today`. */
export function trackedGrantsInFy(state: PortalState, today: string): Grant[] {
  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
  return trackedGrants(state).filter(g => {
    const start = g.dates.periodStart ?? fy.start;
    const end = g.dates.periodEnd ?? fy.end;
    // A grant that ended just before the year still owes its report in it.
    return (start <= fy.end && end >= fy.start) || g.phase === 'reporting';
  });
}

export function grantExpenses(state: PortalState, grantId: string): Expense[] {
  return state.grants.expenses
    .filter(e => e.grantId === grantId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

export function grantLines(state: PortalState, grantId: string): BudgetLine[] {
  return state.grants.budgetLines.filter(l => l.grantId === grantId);
}

export function lineById(state: PortalState, id: string): BudgetLine | undefined {
  return state.grants.budgetLines.find(l => l.id === id);
}

/** What has been matched to a line so far: the dollars and how many expenses. */
export function lineMatched(state: PortalState, lineId: string): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const e of state.grants.expenses) {
    if (e.budgetLineId !== lineId) continue;
    amount += e.amount;
    count += 1;
  }
  return { amount, count };
}

/**
 * The lines a line's expenses may move to: every other line on the same
 * grant, mapped or not. Mapping decides what new transactions match; it does
 * not limit where an expense already assigned can sit.
 */
export function moveTargets(state: PortalState, lineId: string): BudgetLine[] {
  const from = lineById(state, lineId);
  if (!from) return [];
  return state.grants.budgetLines.filter(l => l.grantId === from.grantId && l.id !== from.id);
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/** Average days in a month, for "per month" figures. */
const DAYS_PER_MONTH = 365 / 12;

/** A grant is off pace when money used and time gone differ by more than this. */
export const GRANT_PACE_MARGIN = 0.1;
/** Lines are lumpier than grants, so a line only warns when it is this far ahead. */
export const LINE_FAST_MARGIN = 0.25;

/** 4,493 → 4,500. For "about $4,500" in prose. */
export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** "about" figures read better rounded: to $10 under $1,000, else to $100. */
export function aboutMoney(n: number): string {
  return money(roundTo(n, Math.abs(n) < 1000 ? 10 : 100));
}

/**
 * 0.3648 → 36. The nudge makes an exact half round up: 0.575 is 58, though
 * 0.575 * 100 is 57.49999 in floating point.
 */
export function wholePercent(n: number): number {
  return Math.round(n * 100 + 1e-9);
}

/** 0.3648 → "36%". */
export function percent(n: number): string {
  return `${wholePercent(n)}%`;
}

export const PACE_LABEL: Record<PaceStatus, string> = {
  'on-track': 'On track',
  'spending-fast': 'Spending fast',
  'spending-slow': 'Spending slow',
  ahead: 'Ahead of pace',
  'period-ended': 'Period ended',
  'not-started': 'Not started',
};

function pace(
  budget: number,
  spent: number,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  today: string,
  fastMargin: number,
  allowAhead: boolean,
): Pace {
  const remaining = budget - spent;
  const used = budget > 0 ? spent / budget : 0;
  const base = {
    budget,
    spent,
    remaining,
    used,
    periodStart,
    periodEnd,
  };

  if (!periodStart || !periodEnd || today < periodStart) {
    const daysTotal =
      periodStart && periodEnd
        ? differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) + 1
        : 0;
    return {
      ...base,
      status: 'not-started',
      elapsed: 0,
      daysElapsed: 0,
      daysTotal,
      daysLeft: daysTotal,
      perMonthSoFar: 0,
      perMonthNeeded: daysTotal > 0 ? remaining / (daysTotal / DAYS_PER_MONTH) : 0,
      projectedSpent: spent,
      projectedUnspent: remaining,
      headline: periodStart ? `Starts ${dateLong(periodStart)}` : 'No grant period yet',
    };
  }

  const start = parseISO(periodStart);
  const daysTotal = differenceInCalendarDays(parseISO(periodEnd), start) + 1;
  const ended = today > periodEnd;
  const daysElapsed = ended ? daysTotal : differenceInCalendarDays(parseISO(today), start) + 1;
  const daysLeft = daysTotal - daysElapsed;
  const elapsed = daysTotal > 0 ? daysElapsed / daysTotal : 1;
  const perDay = daysElapsed > 0 ? spent / daysElapsed : 0;
  const perMonthSoFar = perDay * DAYS_PER_MONTH;

  if (ended) {
    return {
      ...base,
      status: 'period-ended',
      elapsed: 1,
      daysElapsed,
      daysTotal,
      daysLeft: 0,
      perMonthSoFar,
      perMonthNeeded: 0,
      projectedSpent: spent,
      projectedUnspent: remaining,
      headline:
        remaining > 0
          ? `${money(remaining)} left unspent`
          : remaining < 0
            ? `${money(-remaining)} over`
            : 'Fully spent',
    };
  }

  const projectedSpent = Math.min(budget, Math.round(perDay * daysTotal));
  const projectedUnspent = Math.max(0, budget - projectedSpent);
  const perMonthNeeded = daysLeft > 0 ? Math.max(0, remaining) / (daysLeft / DAYS_PER_MONTH) : 0;

  let runsOutOn: string | undefined;
  if (perDay > 0 && budget > 0) {
    const day = format(addDays(start, Math.floor(budget / perDay)), 'yyyy-MM-dd');
    if (day < periodEnd) runsOutOn = day;
  }

  const gap = used - elapsed;
  let status: PaceStatus = 'on-track';
  if (spent > budget || (gap > fastMargin && runsOutOn)) status = 'spending-fast';
  else if (allowAhead && gap > GRANT_PACE_MARGIN) status = 'ahead';
  else if (gap < -GRANT_PACE_MARGIN) status = 'spending-slow';

  let headline = 'On course to finish on time';
  if (spent > budget) headline = `${money(spent - budget)} over budget`;
  else if (status === 'spending-fast' && runsOutOn)
    headline = `Runs out around ${dateLong(runsOutOn)}`;
  else if (status === 'spending-slow') {
    headline =
      spent === 0
        ? 'No spending yet'
        : `About ${aboutMoney(projectedUnspent)} unspent on ${dateLong(periodEnd)}`;
  } else if (status === 'ahead') headline = 'Ahead of pace';

  return {
    ...base,
    status,
    elapsed,
    daysElapsed,
    daysTotal,
    daysLeft,
    perMonthSoFar,
    perMonthNeeded,
    runsOutOn,
    projectedSpent,
    projectedUnspent,
    headline,
  };
}

/** Pacing for a whole grant: the award against everything spent on it. */
export function grantPace(state: PortalState, grantId: string, today: string): Pace {
  const grant = state.grants.grants.find(g => g.id === grantId);
  const spent = state.grants.expenses
    .filter(e => e.grantId === grantId)
    .reduce((sum, e) => sum + e.amount, 0);
  return pace(
    grant?.amountAwarded ?? 0,
    spent,
    grant?.dates.periodStart,
    grant?.dates.periodEnd,
    today,
    GRANT_PACE_MARGIN,
    false,
  );
}

/** Pacing for each budget line on a grant, in budget order. */
export function linePaces(state: PortalState, grantId: string, today: string): LinePace[] {
  const grant = state.grants.grants.find(g => g.id === grantId);
  return grantLines(state, grantId).map(line => ({
    line,
    ...pace(
      line.planned,
      lineMatched(state, line.id).amount,
      grant?.dates.periodStart,
      grant?.dates.periodEnd,
      today,
      LINE_FAST_MARGIN,
      true,
    ),
  }));
}

/** A line worth a second look: running out early, over, or untouched well into the period. */
export function lineNeedsAttention(p: LinePace): boolean {
  if (p.status === 'period-ended' || p.status === 'not-started') return false;
  return p.status === 'spending-fast' || p.spent > p.budget || (p.spent === 0 && p.elapsed > 0.2);
}

/** The line doing most to push a grant off pace, if any. */
export function paceDriver(
  state: PortalState,
  grantId: string,
  today: string,
): LinePace | undefined {
  const lines = linePaces(state, grantId, today);
  const grant = grantPace(state, grantId, today);
  if (grant.status === 'spending-fast') {
    return lines.filter(l => l.status === 'spending-fast').sort((a, b) => b.used - a.used)[0];
  }
  return undefined;
}

/** Grants that are spending fast or slow: the number on the Spend-down rail item. */
export function offPaceGrants(state: PortalState, today: string): Grant[] {
  return trackedGrants(state).filter(g => {
    const status = grantPace(state, g.id, today).status;
    return status === 'spending-fast' || status === 'spending-slow';
  });
}

/**
 * Cumulative spending on a grant, one point per day something was spent, from
 * the first day of the period. For the spend-down chart.
 */
export function spendSeries(
  state: PortalState,
  grantId: string,
  today: string,
): Array<{ date: string; total: number }> {
  const grant = state.grants.grants.find(g => g.id === grantId);
  const start = grant?.dates.periodStart;
  if (!start) return [];
  const end =
    grant?.dates.periodEnd && grant.dates.periodEnd < today ? grant.dates.periodEnd : today;

  const byDay = new Map<string, number>();
  for (const e of state.grants.expenses) {
    if (e.grantId !== grantId) continue;
    const day = e.date < start ? start : e.date > end ? end : e.date;
    byDay.set(day, (byDay.get(day) ?? 0) + e.amount);
  }

  const points = [{ date: start, total: 0 }];
  let total = 0;
  for (const day of [...byDay.keys()].sort()) {
    total += byDay.get(day) ?? 0;
    if (day === start) points[0].total = total;
    else points.push({ date: day, total });
  }
  if (points[points.length - 1].date < end) points.push({ date: end, total });
  return points;
}

// ---------------------------------------------------------------------------
// QuickBooks
// ---------------------------------------------------------------------------

export function accountName(state: PortalState, code: string): string {
  return state.grants.accounts.find(a => a.code === code)?.name ?? 'Unknown account';
}

/** "6200 Contract instructors" */
export function accountLabel(state: PortalState, code: string): string {
  return `${code} ${accountName(state, code)}`;
}

export function className(state: PortalState, classId: string | undefined): string | undefined {
  return classId ? state.grants.classes.find(c => c.id === classId)?.name : undefined;
}

/** "today, 8:40 am" on the day of the sync, "Sep 12, 8:40 am" after it. */
export function syncedLabel(state: PortalState, today: string): string {
  const at = state.grants.quickbooks.lastSyncedAt;
  if (!at) return 'never';
  const stamp = parseISO(at);
  const time = format(stamp, 'h:mm a').toLowerCase();
  return at.slice(0, 10) === today ? `today, ${time}` : `${format(stamp, 'MMM d')}, ${time}`;
}

/** The lines on a grant that already count an account, this line excluded. */
export function accountUsedBy(
  state: PortalState,
  grantId: string,
  code: string,
  exceptLineId?: string,
): BudgetLine[] {
  return grantLines(state, grantId).filter(
    l => l.id !== exceptLineId && l.accountCodes?.includes(code),
  );
}

/** A line is mapped when it names at least one account and a class. */
export function isMapped(line: BudgetLine): boolean {
  return !!line.classId && (line.accountCodes?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export function transactionById(
  state: PortalState,
  id: string | undefined,
): Transaction | undefined {
  return id ? state.grants.transactions.find(t => t.id === id) : undefined;
}

export function transactionsByStatus(
  state: PortalState,
  status: TransactionStatus | 'all',
): Transaction[] {
  return state.grants.transactions
    .filter(t => status === 'all' || t.status === status)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.payee.localeCompare(b.payee));
}

export function transactionCounts(state: PortalState): Record<TransactionStatus | 'all', number> {
  const counts = {
    'to-assign': 0,
    assigned: 0,
    'not-grant-funded': 0,
    all: state.grants.transactions.length,
  };
  for (const t of state.grants.transactions) counts[t.status] += 1;
  return counts;
}

/** Where an assigned transaction went: one part, or several when it was split. */
export function transactionAllocations(state: PortalState, transactionId: string): Allocation[] {
  return state.grants.expenses
    .filter(e => e.transactionId === transactionId)
    .map(e => ({ grantId: e.grantId, budgetLineId: e.budgetLineId, amount: e.amount }));
}

/**
 * Assigning a transaction again keeps its backup. A new part on the same grant
 * and line as an old part keeps that expense: its id, files and note. An old
 * part with no match goes; its files and note move to the first new part on
 * the same grant, else to the first new part. Nothing moves when there are no
 * new parts.
 */
export function backupCarry(
  old: Expense[],
  parts: ReadonlyArray<Pick<Allocation, 'grantId' | 'budgetLineId'>>,
): BackupCarry {
  const kept = parts.map(p =>
    old.find(e => e.grantId === p.grantId && e.budgetLineId === p.budgetLineId),
  );
  const moved: BackupCarry['moved'] = [];
  if (parts.length) {
    for (const from of old) {
      if (kept.includes(from)) continue;
      const sameGrant = parts.findIndex(p => p.grantId === from.grantId);
      moved.push({ from, to: sameGrant >= 0 ? sameGrant : 0 });
    }
  }
  return { kept, moved };
}

/**
 * The old parts whose backup would move if the transaction were assigned to
 * `parts`, with what they carry. Parts with no files and no note are left out.
 */
export function backupMoves(
  state: PortalState,
  transactionId: string,
  parts: ReadonlyArray<Pick<Allocation, 'grantId' | 'budgetLineId'>>,
): Array<{ from: Expense; to: number; files: number; note: boolean }> {
  const old = state.grants.expenses.filter(e => e.transactionId === transactionId);
  return backupCarry(old, parts)
    .moved.map(m => ({
      ...m,
      files: state.grants.files.filter(f => f.expenseId === m.from.id).length,
      note: !!m.from.backupNote?.trim(),
    }))
    .filter(m => m.files > 0 || m.note);
}

/** Where a transaction stands now, exactly, so an Undo can put it back. */
export function transactionSnapshot(
  state: PortalState,
  id: string,
): TransactionSnapshot | undefined {
  const tx = transactionById(state, id);
  if (!tx) return undefined;
  const expenses = state.grants.expenses.filter(e => e.transactionId === id);
  const ids = new Set(expenses.map(e => e.id));
  return {
    id,
    status: tx.status,
    assignedById: tx.assignedById,
    assignedAt: tx.assignedAt,
    expenses,
    files: state.grants.files.filter(f => !!f.expenseId && ids.has(f.expenseId)),
  };
}

/** Lines a transaction dated `date` could be charged to: open grants whose period covers the day. */
export function eligibleLines(state: PortalState, date: string): BudgetLine[] {
  const open = new Set(
    state.grants.grants
      .filter(
        g => (g.phase === 'awarded' || g.phase === 'active') && typeof g.amountAwarded === 'number',
      )
      .filter(
        g =>
          (!g.dates.periodStart || g.dates.periodStart <= date) &&
          (!g.dates.periodEnd || g.dates.periodEnd >= date),
      )
      .map(g => g.id),
  );
  return state.grants.budgetLines.filter(l => open.has(l.grantId));
}

/** Grants a transaction dated `date` could be charged to. */
export function eligibleGrants(state: PortalState, date: string): Grant[] {
  const ids = new Set(eligibleLines(state, date).map(l => l.grantId));
  return state.grants.grants.filter(g => ids.has(g.id));
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * What the portal proposes for a transaction. A transaction matches a budget
 * line when its account is one of the line's accounts and, when QuickBooks
 * gave it a class, the class matches too.
 */
export function suggestionFor(state: PortalState, tx: Transaction): Suggestion {
  const rule = state.grants.splitRules.find(r => r.payee === tx.payee);
  if (rule && rule.parts.every(p => lineById(state, p.budgetLineId)))
    return { kind: 'split', rule };

  let candidates = eligibleLines(state, tx.date).filter(l =>
    l.accountCodes?.includes(tx.accountCode),
  );
  if (tx.classId) candidates = candidates.filter(l => l.classId === tx.classId);

  if (candidates.length === 1) {
    return { kind: 'line', grantId: candidates[0].grantId, budgetLineId: candidates[0].id };
  }

  if (candidates.length > 1) {
    const grants = new Set(candidates.map(l => l.grantId)).size;
    const what =
      grants > 1
        ? `${COUNT_WORDS[grants] ?? grants} grants`
        : `${COUNT_WORDS[candidates.length] ?? candidates.length} lines`;
    return {
      kind: 'ambiguous',
      candidates: candidates.map(l => ({ grantId: l.grantId, budgetLineId: l.id })),
      hint: `${tx.accountCode} fits ${what}. Pick one or split.`,
    };
  }

  // Nothing matches. If this payee has been set aside before, propose that again.
  const before = state.grants.transactions.filter(
    t => t.status === 'not-grant-funded' && t.payee === tx.payee,
  );
  if (before.length >= 2) {
    const months = new Set(before.map(t => t.date.slice(0, 7))).size;
    return { kind: 'not-grant-funded', months };
  }

  return { kind: 'none', hint: `No budget line uses ${tx.accountCode} yet` };
}

/** Transactions waiting with a proposal that can be accepted in one click. */
export function acceptableSuggestions(
  state: PortalState,
): Array<{ tx: Transaction; suggestion: Suggestion }> {
  return transactionsByStatus(state, 'to-assign')
    .map(tx => ({ tx, suggestion: suggestionFor(state, tx) }))
    .filter(
      ({ suggestion }) =>
        suggestion.kind === 'line' ||
        suggestion.kind === 'split' ||
        suggestion.kind === 'not-grant-funded',
    );
}

/**
 * Split an amount by percentages into whole dollars that add back up to the
 * amount: the last part takes whatever rounding left over.
 */
export function splitByPercent(amount: number, percents: number[]): number[] {
  const parts = percents.map(p => Math.round((amount * p) / 100));
  const drift = amount - parts.reduce((sum, n) => sum + n, 0);
  if (parts.length) parts[parts.length - 1] += drift;
  return parts;
}

/**
 * The shares a transaction's parts start from, for a payee the office may
 * always split the same way. In order:
 *
 * 1. `rule`: the payee's saved split rule, when every line it names still
 *    exists. Its parts as saved; candidates the rule does not name are left out.
 * 2. `history`: the payee's most recent assigned transaction (by date, then by
 *    when it was assigned), its parts' shares by amount. A part whose line is
 *    not a candidate is dropped and the rest rescaled to 100. When none of its
 *    parts is on a candidate, history gives nothing and the shares are even.
 * 3. `even`: every candidate an equal share.
 *
 * Percentages are not rounded; `splitByPercent` turns them into dollars.
 */
export function usualShares(
  state: PortalState,
  tx: Pick<Transaction, 'id' | 'payee'>,
  candidates: ReadonlyArray<Pick<Allocation, 'grantId' | 'budgetLineId'>>,
): UsualShares {
  const rule = state.grants.splitRules.find(r => r.payee === tx.payee);
  if (rule && rule.parts.every(p => lineById(state, p.budgetLineId)))
    return { source: 'rule', parts: rule.parts.map(p => ({ ...p })) };

  const last = state.grants.transactions
    .filter(t => t.status === 'assigned' && t.payee === tx.payee && t.id !== tx.id)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || (b.assignedAt ?? '').localeCompare(a.assignedAt ?? ''),
    )[0];
  if (last) {
    const before = transactionAllocations(state, last.id);
    const kept = candidates
      .map(c => ({ c, amount: before.find(a => a.budgetLineId === c.budgetLineId)?.amount ?? 0 }))
      .filter(k => k.amount > 0);
    const sum = kept.reduce((s, k) => s + k.amount, 0);
    if (sum > 0)
      return {
        source: 'history',
        parts: kept.map(k => ({
          grantId: k.c.grantId,
          budgetLineId: k.c.budgetLineId,
          percent: (k.amount / sum) * 100,
        })),
      };
  }

  return {
    source: 'even',
    parts: candidates.map(c => ({
      grantId: c.grantId,
      budgetLineId: c.budgetLineId,
      percent: 100 / candidates.length,
    })),
  };
}

// ---------------------------------------------------------------------------
// Files and backup
// ---------------------------------------------------------------------------

/** The backup for one expense, oldest first. */
export function expenseFiles(state: PortalState, expenseId: string): GrantFile[] {
  return state.grants.files
    .filter(f => f.expenseId === expenseId)
    .slice()
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

/** Files kept with the grant itself: the award letter, the signed agreement. */
export function grantFiles(state: PortalState, grantId: string): GrantFile[] {
  return state.grants.files.filter(f => f.grantId === grantId && !f.expenseId);
}

export function awardLetter(state: PortalState, grantId: string): GrantFile | undefined {
  return grantFiles(state, grantId).find(f => f.kind === 'award-letter');
}

export function backupSummary(state: PortalState, grantId: string): BackupSummary {
  const expenses = state.grants.expenses.filter(e => e.grantId === grantId);
  const counts = new Map<string, number>();
  for (const f of state.grants.files) {
    if (f.expenseId) counts.set(f.expenseId, (counts.get(f.expenseId) ?? 0) + 1);
  }
  const summary: BackupSummary = {
    expenses: expenses.length,
    total: 0,
    withBackup: 0,
    files: 0,
    missing: 0,
    missingTotal: 0,
  };
  for (const e of expenses) {
    summary.total += e.amount;
    const n = counts.get(e.id) ?? 0;
    if (n > 0) {
      summary.withBackup += 1;
      summary.files += n;
    } else {
      summary.missing += 1;
      summary.missingTotal += e.amount;
    }
  }
  return summary;
}

/** Expenses on open grants with no backup attached yet. */
export function expensesMissingBackup(state: PortalState): Expense[] {
  const backed = new Set(state.grants.files.map(f => f.expenseId).filter(Boolean));
  const open = new Set(trackedGrants(state).map(g => g.id));
  return state.grants.expenses.filter(e => open.has(e.grantId) && !backed.has(e.id));
}

/** 412 → "412 KB", 1229 → "1.2 MB". */
export function fileSize(sizeKb: number): string {
  return sizeKb >= 1000 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.round(sizeKb)} KB`;
}

// ---------------------------------------------------------------------------
// Reports and reminders
// ---------------------------------------------------------------------------

/** The reminder days the office can choose from, furthest first. */
export const REMINDER_OFFSETS = [30, 14, 7, 3, 0];

/** "30 days before", "On the due date". */
export function offsetLabel(offset: number): string {
  if (offset === 0) return 'On the due date';
  return `${offset} ${offset === 1 ? 'day' : 'days'} before`;
}

/** "30d", "Due". */
export function offsetChip(offset: number): string {
  return offset === 0 ? 'Due' : `${offset}d`;
}

export function isReportOpen(report: Report): boolean {
  return !report.submittedDate && report.status !== 'submitted' && report.status !== 'accepted';
}

/** Reports still owed on grants that are not finished, soonest first. */
export function reportsOwed(state: PortalState): Report[] {
  const live = new Set(
    state.grants.grants
      .filter(g => !['closed', 'declined', 'withdrawn'].includes(g.phase))
      .map(g => g.id),
  );
  return state.grants.reports
    .filter(r => live.has(r.grantId) && isReportOpen(r))
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** The plan a report follows: its own, or the office defaults sent to the grant owner. */
export function reminderPlanFor(
  state: PortalState,
  reportId: string,
): ReminderPlan & { isDefault: boolean } {
  const own = state.grants.reminderPlans.find(p => p.reportId === reportId);
  if (own) return { ...own, isDefault: false };

  const defaults = state.grants.reminderDefaults;
  const report = state.grants.reports.find(r => r.id === reportId);
  const grant = report && state.grants.grants.find(g => g.id === report.grantId);
  const recipients = [
    ...new Set([grant?.ownerId, ...defaults.alsoNotifyIds].filter((id): id is string => !!id)),
  ];
  return {
    reportId,
    offsets: [...defaults.offsets],
    recipientIds: recipients,
    keepReminding: defaults.keepReminding,
    isDefault: true,
  };
}

/** The date `offset` days before the due date; a negative offset falls after it. */
export function dayBefore(dueDate: string, offset: number): string {
  return format(addDays(parseISO(dueDate), -offset), 'yyyy-MM-dd');
}

/**
 * The emails a plan sends for a report, furthest first, with where each stands
 * today. Takes any plan, saved or a draft still being edited.
 *
 * - Each chosen reminder day is dated due date minus its offset.
 * - When the plan keeps reminding, a repeat goes out every `repeatEveryDays`
 *   after the due date, the first on due date + N. Repeats are listed up to and
 *   including the first one after today, each marked `repeat` with a negative
 *   offset (-3 is three days after the due date).
 * - Emails go out in the morning, so one dated today or earlier is **sent**; the
 *   first one after today is **next**; the rest are **scheduled**.
 * - A submitted report gets nothing more: no next, no repeats; a day after it
 *   was submitted is off.
 */
export function planSchedule(
  report: Report,
  plan: Pick<ReminderPlan, 'offsets' | 'keepReminding'>,
  defaults: Pick<ReminderDefaults, 'repeatEveryDays'>,
  today: string,
): ReminderStep[] {
  const open = isReportOpen(report);
  // A closed report sent nothing after it was submitted.
  const lastSent =
    !open && report.submittedDate && report.submittedDate < today ? report.submittedDate : today;
  let nextFound = false;
  const stateOf = (date: string): ReminderStep['state'] => {
    if (date <= lastSent) return 'sent';
    if (!open) return 'off';
    if (nextFound) return 'scheduled';
    nextFound = true;
    return 'next';
  };

  const steps: ReminderStep[] = REMINDER_OFFSETS.map(offset => {
    const date = dayBefore(report.dueDate, offset);
    const enabled = plan.offsets.includes(offset);
    return { offset, date, enabled, state: enabled ? stateOf(date) : 'off' };
  });

  if (open && plan.keepReminding) {
    const every = Math.max(1, Math.round(defaults.repeatEveryDays));
    for (let after = every; ; after += every) {
      const date = dayBefore(report.dueDate, -after);
      steps.push({ offset: -after, date, enabled: true, state: stateOf(date), repeat: true });
      if (date > today) break;
    }
  }
  return steps;
}

/** The schedule of a report's saved plan: its own, or the office defaults. */
export function reminderSchedule(
  state: PortalState,
  reportId: string,
  today: string,
): ReminderStep[] {
  const report = state.grants.reports.find(r => r.id === reportId);
  if (!report) return [];
  const plan = reminderPlanFor(state, reportId);
  return planSchedule(report, plan, state.grants.reminderDefaults, today);
}

/**
 * The very next reminder email across the given reports (by default every
 * report owed), repeats after the due date included; undefined when none is left.
 */
export function nextReminder(
  state: PortalState,
  today: string,
  reports: Report[] = reportsOwed(state),
): { report: Report; step: ReminderStep; recipientIds: string[] } | undefined {
  let best: { report: Report; step: ReminderStep; recipientIds: string[] } | undefined;
  for (const report of reports) {
    const step = reminderSchedule(state, report.id, today).find(s => s.state === 'next');
    if (!step) continue;
    if (!best || step.date < best.step.date) {
      best = { report, step, recipientIds: reminderPlanFor(state, report.id).recipientIds };
    }
  }
  return best;
}

/** "Barry and Denise", from first names. */
export function firstNames(state: PortalState, staffIds: string[]): string {
  const names = staffIds
    .map(id => state.core.staff.find(s => s.id === id)?.name.split(' ')[0])
    .filter((n): n is string => !!n);
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** 8 → "8:00 am", 14 → "2:00 pm". */
export function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  return `${h}:00 ${hour < 12 ? 'am' : 'pm'}`;
}
