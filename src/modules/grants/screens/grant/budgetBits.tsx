import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../../design-system';
import { money, useStore } from '../../../../core';
import { accountName, className, lineMatched } from '../../domain';

/** Small pieces of the budget tab: the cells a line shows, and the links it makes. */

export const budgetTransactionsHref = (grantId: string, lineId?: string) =>
  `/transactions?tab=assigned&grant=${encodeURIComponent(grantId)}${lineId ? `&line=${encodeURIComponent(lineId)}` : ''}`;

export const budgetPacingHref = (grantId: string) => `/budget?grant=${encodeURIComponent(grantId)}`;

/** The teal check and a short "all good": "Budget matches the award". */
export function BudgetOk({ children }: { children: React.ReactNode }) {
  return (
    <span className="budget-ok">
      <Icon name="check" size={13} color="var(--teal-500)" />
      {children}
    </span>
  );
}

/** A gold mark for something that needs a person: "Not mapped", "$2,000 over the award". */
export function BudgetAttention({ children }: { children: React.ReactNode }) {
  return (
    <span className="budget-attention">
      <Icon name="circle-alert" size={13} color="var(--gold-500)" />
      {children}
    </span>
  );
}

/** The QuickBooks accounts on a line, as chips: mono code, then the name. */
export function BudgetAccountChips({ codes }: { codes?: string[] }) {
  const { state } = useStore();
  if (!codes || codes.length === 0) return <BudgetAttention>Not mapped</BudgetAttention>;
  return (
    <span className="budget-chips">
      {codes.map(code => (
        <span key={code} className="budget-chip">
          <b>{code}</b>
          {accountName(state, code)}
        </span>
      ))}
    </span>
  );
}

/** The QuickBooks class on a line: a teal dot and its name. */
export function BudgetClassMark({ classId }: { classId?: string }) {
  const { state } = useStore();
  const name = className(state, classId);
  if (!name) return <BudgetAttention>Not mapped</BudgetAttention>;
  return <span className="budget-class">{name}</span>;
}

/**
 * What has been matched to a line so far: dollars, then how many expenses.
 * It opens those transactions; with nothing matched there is nothing to open.
 */
export function BudgetMatched({ grantId, lineId }: { grantId: string; lineId: string }) {
  const { state } = useStore();
  const navigate = useNavigate();
  const { amount, count } = lineMatched(state, lineId);
  if (count === 0) return <span className="budget-match budget-match--none">Nothing yet</span>;
  return (
    <button
      type="button"
      className="budget-match budget-match--link"
      aria-label={`${money(amount)} matched from ${count} ${count === 1 ? 'expense' : 'expenses'}. View transactions`}
      title="View these transactions"
      onClick={e => {
        e.stopPropagation();
        navigate(budgetTransactionsHref(grantId, lineId));
      }}
    >
      <span className="budget-match__amt">{money(amount)}</span>
      <span className="budget-match__n">{count}</span>
    </button>
  );
}
