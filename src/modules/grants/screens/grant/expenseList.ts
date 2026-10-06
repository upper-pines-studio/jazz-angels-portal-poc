import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import { grantExpenses } from '../../domain';
import type { Expense, Grant } from '../../domain';

/**
 * What the Expenses tab and its right-hand column share. They are siblings, so
 * the selected expense and the filter live in the URL: `?tab=expenses&expense=…&backup=missing`.
 */

export type BackupFilter = 'all' | 'missing';

/** How many backup files each expense has. */
export function fileCounts(state: PortalState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of state.grants.files) {
    if (f.expenseId) counts.set(f.expenseId, (counts.get(f.expenseId) ?? 0) + 1);
  }
  return counts;
}

/** How many expenses carry each QuickBooks transaction; more than one means it was split. */
export function partCounts(state: PortalState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of state.grants.expenses) {
    if (e.transactionId) counts.set(e.transactionId, (counts.get(e.transactionId) ?? 0) + 1);
  }
  return counts;
}

/** "1 file", "2 files". */
export function filesLabel(n: number): string {
  return `${n} ${n === 1 ? 'file' : 'files'}`;
}

/** "1 expense", "10 expenses". */
export function expensesLabel(n: number): string {
  return `${n} ${n === 1 ? 'expense' : 'expenses'}`;
}

export function useExpenseView(grant: Grant) {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();

  const all = grantExpenses(state, grant.id);
  const counts = fileCounts(state);
  const filter: BackupFilter = params.get('backup') === 'missing' ? 'missing' : 'all';
  const missing = all.filter(e => !counts.get(e.id));
  const shown = filter === 'missing' ? missing : all;
  const selectedId = params.get('expense');
  const selected: Expense | undefined = selectedId ? all.find(e => e.id === selectedId) : undefined;

  /** Change some params and keep the rest. `null` removes one. */
  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  return {
    all,
    shown,
    missing,
    counts,
    filter,
    selectedId,
    selected,
    patch,
    select: (id: string | null) => patch({ expense: id }),
    setFilter: (f: BackupFilter) => patch({ backup: f === 'missing' ? 'missing' : null }),
  };
}
