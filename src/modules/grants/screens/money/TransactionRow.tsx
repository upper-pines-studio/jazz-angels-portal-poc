import React from 'react';
import { Badge, Button, Icon } from '../../../../design-system';
import { dateShort, money, staffById, useStore } from '../../../../core';
import { accountName, eligibleGrants, eligibleLines, grantById, lineById, suggestionFor } from '../../domain';
import type { Expense, Suggestion, Transaction } from '../../domain';
import { LinkButton } from './shared';
import { TransactionMenu } from './TransactionMenu';
import { grantFunder, joinWords } from './transactionHelpers';

/** What a row can ask the page to do. The page owns the toasts and the Undo. */
export interface RowHandlers {
  open: (tx: Transaction) => void;
  assignLine: (tx: Transaction, budgetLineId: string) => void;
  acceptSuggestion: (tx: Transaction, suggestion: Suggestion) => void;
  setAside: (tx: Transaction) => void;
  sendBack: (tx: Transaction) => void;
  seeInGrant: (expense: Expense) => void;
  setChanging: (tx: Transaction, on: boolean) => void;
}

/** A split being edited in the panel, as the selected row shows it. */
export interface DraftSummary {
  txId: string;
  parts: Array<{ grantId: string; budgetLineId: string; amount: number }>;
}

/** One transaction: date, payee and memo, account, amount, and where it goes. */
export function TransactionRow({ tx, parts, selected, draft, changing, on }: {
  tx: Transaction;
  parts: Expense[];
  selected: boolean;
  draft?: DraftSummary;
  changing: boolean;
  on: RowHandlers;
}) {
  const { state, today } = useStore();

  // A click on the row itself opens the panel; clicks on its controls do their own thing.
  const onRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, a, input, label, [role="menu"]')) return;
    on.open(tx);
  };

  return (
    <div className={'tx-row' + (selected ? ' is-selected' : '')} onClick={onRowClick}>
      <div className="tx-cell tx-cell--date">
        {dateShort(tx.date)}
        {tx.date.slice(0, 4) !== today.slice(0, 4) && <span className="tx-year">{tx.date.slice(0, 4)}</span>}
      </div>
      <div className="tx-cell tx-cell--payee tx-two">
        <button type="button" className="tx-payee" onClick={() => on.open(tx)} title={tx.payee}>{tx.payee}</button>
        <span className="tx-l2" title={tx.memo}>{tx.memo || tx.ref}</span>
      </div>
      <div className="tx-cell tx-cell--account tx-two">
        <span className="tx-code">{tx.accountCode}</span>
        <span className="tx-l2" title={accountName(state, tx.accountCode)}>{accountName(state, tx.accountCode)}</span>
      </div>
      <div className="tx-cell tx-cell--amount">{money(tx.amount)}</div>
      <div className="tx-cell tx-cell--assign">
        {selected && draft && draft.txId === tx.id
          ? <DraftCell draft={draft} />
          : <AssignCell tx={tx} parts={parts} changing={changing} on={on} />}
      </div>
    </div>
  );
}

/** The selected row while its split is open on the right. */
function DraftCell({ draft }: { draft: DraftSummary }) {
  const { state } = useStore();
  const total = draft.parts.reduce((s, p) => s + p.amount, 0);
  if (draft.parts.length > 1) {
    const funders = joinWords(draft.parts.map((p) => (p.grantId ? grantFunder(state, p.grantId, true) : 'a grant to choose')));
    const shares = joinWords(draft.parts.map((p) => `${total > 0 ? Math.round((p.amount / total) * 100) : 0}%`));
    return (
      <div className="tx-two">
        <span className="tx-splitcell"><Badge tone="blue">Split</Badge><span className="tx-l1 plain">{funders}</span></span>
        <span className="tx-l2">{shares} · Editing on the right</span>
      </div>
    );
  }
  const part = draft.parts[0];
  const line = part && lineById(state, part.budgetLineId);
  return (
    <div className="tx-two">
      <span className="tx-l1 plain">{line?.category ?? 'Choosing a line'}</span>
      <span className="tx-l2">{part?.grantId ? `${grantFunder(state, part.grantId, true)} · ` : ''}Editing on the right</span>
    </div>
  );
}

/** "Denise, Sep 12" or "Barry, today". */
function whoWhen(stateName: string | undefined, date: string | undefined, today: string): string {
  const who = stateName?.split(' ')[0] ?? 'Someone';
  if (!date) return who;
  return `${who}, ${date === today ? 'today' : dateShort(date)}`;
}

function AssignCell({ tx, parts, changing, on }: { tx: Transaction; parts: Expense[]; changing: boolean; on: RowHandlers }) {
  const { state, today } = useStore();
  const who = whoWhen(staffById(state, tx.assignedById)?.name, tx.assignedAt, today);

  if (tx.status === 'assigned') {
    const grants = [...new Map(parts.map((p) => [p.grantId, p])).values()];
    const items = [
      { label: 'Change', icon: 'split', onSelect: () => on.open(tx) },
      { label: 'Send back to assign', icon: 'undo-2', onSelect: () => on.sendBack(tx) },
      ...grants.map((p) => ({
        label: grants.length > 1 ? `See in ${grantFunder(state, p.grantId, true)}` : 'See in grant',
        icon: 'arrow-up-right',
        onSelect: () => on.seeInGrant(p),
      })),
    ];
    return (
      <div className="tx-assign">
        {parts.length <= 1 ? (
          <div className="tx-two">
            <span className="tx-l1 plain">{parts[0] ? lineById(state, parts[0].budgetLineId)?.category ?? 'A removed line' : 'Assigned'}</span>
            <span className="tx-l2">{parts[0] ? `${grantFunder(state, parts[0].grantId, true)} · ` : ''}{who}</span>
          </div>
        ) : (
          <div className="tx-two">
            {parts.map((p) => (
              <span key={p.id} className="tx-partline">
                <span className="tx-partline__what">
                  {lineById(state, p.budgetLineId)?.category ?? 'A removed line'}
                  <span className="tx-muted"> · {grantFunder(state, p.grantId, true)}</span>
                </span>
                <span className="tx-mono">{money(p.amount)}</span>
              </span>
            ))}
            <span className="tx-l2">Split · {who}</span>
          </div>
        )}
        <TransactionMenu label={`More for ${tx.payee}, ${money(tx.amount)}`} items={items} />
      </div>
    );
  }

  if (tx.status === 'not-grant-funded') {
    return (
      <div className="tx-assign">
        <div className="tx-two">
          <span className="tx-l1 plain">Not grant-funded</span>
          <span className="tx-l2">Set aside · {who}</span>
        </div>
        <TransactionMenu
          label={`More for ${tx.payee}, ${money(tx.amount)}`}
          items={[
            { label: 'Assign to a grant', icon: 'split', onSelect: () => on.open(tx) },
            { label: 'Send back to assign', icon: 'undo-2', onSelect: () => on.sendBack(tx) },
          ]}
        />
      </div>
    );
  }

  const suggestion = suggestionFor(state, tx);
  if (!changing && (suggestion.kind === 'line' || suggestion.kind === 'split' || suggestion.kind === 'not-grant-funded')) {
    return <SuggestionCell tx={tx} suggestion={suggestion} on={on} />;
  }
  return (
    <div className="tx-pick">
      <LinePicker tx={tx} suggestion={suggestion} onPick={(lineId) => on.assignLine(tx, lineId)} />
      <div className="tx-pick__foot">
        {!changing && (suggestion.kind === 'ambiguous' || suggestion.kind === 'none') && (
          <span className="tx-l2 tx-pick__hint">{suggestion.hint}</span>
        )}
        <span className="tx-links">
          <LinkButton onClick={() => on.open(tx)}>Split</LinkButton>
          <LinkButton onClick={() => on.setAside(tx)}>Not grant-funded</LinkButton>
          {changing && <LinkButton onClick={() => on.setChanging(tx, false)}>Keep suggestion</LinkButton>}
        </span>
      </div>
    </div>
  );
}

/** A proposal that one click accepts, with a way to choose something else. */
function SuggestionCell({ tx, suggestion, on }: { tx: Transaction; suggestion: Suggestion; on: RowHandlers }) {
  const { state } = useStore();
  let what: React.ReactNode = null;
  let why: React.ReactNode = null;

  if (suggestion.kind === 'line') {
    what = lineById(state, suggestion.budgetLineId)?.category;
    why = grantFunder(state, suggestion.grantId, true);
  } else if (suggestion.kind === 'not-grant-funded') {
    what = 'Not grant-funded';
    why = `Last ${suggestion.months} ${suggestion.months === 1 ? 'month' : 'months'}`;
  } else if (suggestion.kind === 'split' && suggestion.rule.parts.length === 1) {
    // A saved rule with one part is simply "always this line".
    what = lineById(state, suggestion.rule.parts[0].budgetLineId)?.category;
    why = `${grantFunder(state, suggestion.rule.parts[0].grantId, true)} · Rule`;
  } else if (suggestion.kind === 'split') {
    const funders = [...new Set(suggestion.rule.parts.map((p) => grantFunder(state, p.grantId, true)))];
    what = <span className="tx-splitcell"><Badge tone="blue">Split</Badge><span>{joinWords(funders)}</span></span>;
    why = joinWords(suggestion.rule.parts.map((p) => `${Math.round(p.percent)}%`));
  }

  return (
    <div className="tx-assign">
      <div className="tx-two">
        <span className="tx-l1 plain">{what}</span>
        <span className="tx-l2">
          <span className="tx-sug">Suggested</span>{why}
          <span className="tx-change"><LinkButton onClick={() => on.setChanging(tx, true)}>Change</LinkButton></span>
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Icon name="check" size={14} />}
        onClick={() => on.acceptSuggestion(tx, suggestion)}
      >
        Accept
      </Button>
    </div>
  );
}

/**
 * "Choose grant and line": every line open on the transaction's date, grouped
 * by grant. The lines that fit the account come first when there are several.
 */
export function LinePicker({ tx, suggestion, onPick }: { tx: Transaction; suggestion: Suggestion; onPick: (lineId: string) => void }) {
  const { state } = useStore();
  const lines = eligibleLines(state, tx.date);
  const grants = eligibleGrants(state, tx.date);
  const fits = suggestion.kind === 'ambiguous' ? suggestion.candidates : [];

  return (
    <div className="tx-select">
      <select
        aria-label={`Grant and budget line for ${tx.payee}, ${money(tx.amount)}`}
        value=""
        disabled={lines.length === 0}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      >
        <option value="" disabled>{lines.length ? 'Choose grant and line' : 'No open grant covers this date'}</option>
        {fits.length > 0 && (
          <optgroup label={`Fits ${tx.accountCode}`}>
            {fits.map((c) => (
              <option key={`fit-${c.budgetLineId}`} value={c.budgetLineId}>
                {lineById(state, c.budgetLineId)?.category} · {grantFunder(state, c.grantId, true)}
              </option>
            ))}
          </optgroup>
        )}
        {grants.map((g) => (
          <optgroup key={g.id} label={`${grantById(state, g.id)?.title} · ${grantFunder(state, g.id)}`}>
            {lines.filter((l) => l.grantId === g.id).map((l) => (
              <option key={l.id} value={l.id}>{l.category}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="tx-select__caret" aria-hidden="true">&#9662;</span>
    </div>
  );
}
