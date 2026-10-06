import React from 'react';
import { Button, Icon, IconButton, Input, Select } from '../../../../design-system';
import { dateShort, money, useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import { SidePanel } from '../../../../app/components/SidePanel';
import {
  accountName,
  backupMoves,
  eligibleGrants,
  funderShortName,
  grantById,
  grantLines,
  lineById,
  lineMatched,
  splitByPercent,
  suggestionFor,
  transactionAllocations,
} from '../../domain';
import type { Allocation, Transaction } from '../../domain';
import { LinkButton } from './shared';
import type { DraftSummary } from './TransactionRow';
import {
  MAX_PARTS,
  PART_COLORS,
  funderOfGrant,
  grantOptionLabel,
  joinWords,
} from './transactionHelpers';

/** One part of the split while it is being edited. The text fields keep what was typed. */
interface Part {
  key: number;
  grantId: string;
  lineId: string;
  amount: number;
  pct: string;
  amt: string;
}

/**
 * How the office shares a bill it always splits the same way, before anyone
 * has saved a rule for it. The studio rent is three quarters Herb Alpert.
 */
const USUAL_SHARES: Record<string, number[]> = {
  'Signal Hill Properties': [75, 25],
};

let nextKey = 1;

function pctText(amount: number, total: number): string {
  if (total <= 0) return '0';
  return String(Math.round((amount / total) * 1000) / 10);
}

/** 1800 → "1,800", for the dollar field. */
function amtText(n: number): string {
  return n.toLocaleString('en-US');
}

function makePart(total: number, grantId: string, lineId: string, amount: number): Part {
  return {
    key: nextKey++,
    grantId,
    lineId,
    amount,
    pct: pctText(amount, total),
    amt: amtText(amount),
  };
}

/** Where the panel starts: what it is on now, the saved rule, the suggestion, or one empty part. */
function proposal(state: PortalState, tx: Transaction): Part[] {
  const total = tx.amount;
  const current = tx.status === 'assigned' ? transactionAllocations(state, tx.id) : [];
  if (current.length) return current.map(a => makePart(total, a.grantId, a.budgetLineId, a.amount));

  const suggestion = suggestionFor(state, tx);
  if (suggestion.kind === 'split') {
    const amounts = splitByPercent(
      total,
      suggestion.rule.parts.map(p => p.percent),
    );
    return suggestion.rule.parts.map((p, i) =>
      makePart(total, p.grantId, p.budgetLineId, amounts[i]),
    );
  }
  if (suggestion.kind === 'line')
    return [makePart(total, suggestion.grantId, suggestion.budgetLineId, total)];
  if (suggestion.kind === 'ambiguous') {
    // The bigger award first, and never more parts than the panel holds.
    const award = (id: string) => grantById(state, id)?.amountAwarded ?? 0;
    const candidates = suggestion.candidates
      .slice()
      .sort((a, b) => award(b.grantId) - award(a.grantId))
      .slice(0, MAX_PARTS);
    const usual = USUAL_SHARES[tx.payee];
    const shares =
      usual && usual.length === candidates.length
        ? usual
        : candidates.map(() => 100 / candidates.length);
    const amounts = splitByPercent(total, shares);
    return candidates.map((c, i) => makePart(total, c.grantId, c.budgetLineId, amounts[i]));
  }
  return [makePart(total, '', '', total)];
}

/**
 * The split editor docked on the right of Transactions: one card per part,
 * a bar showing each part's share, and a check that the parts add up.
 */
export function SplitPanel({
  tx,
  onClose,
  onDraft,
  onSave,
}: {
  tx: Transaction;
  onClose: () => void;
  onDraft: (draft: DraftSummary | undefined) => void;
  /** Assign the parts; the page shows the toast with its Undo. */
  onSave: (tx: Transaction, parts: Allocation[], note?: string) => void;
}) {
  const { state, actions } = useStore();
  const total = tx.amount;
  const [parts, setParts] = React.useState<Part[]>(() => proposal(state, tx));
  const existingRule = state.grants.splitRules.find(r => r.payee === tx.payee);
  const [rule, setRule] = React.useState(!!existingRule);

  React.useEffect(() => {
    onDraft({
      txId: tx.id,
      parts: parts.map(p => ({ grantId: p.grantId, budgetLineId: p.lineId, amount: p.amount })),
    });
  }, [parts, tx.id, onDraft]);
  React.useEffect(() => () => onDraft(undefined), [onDraft]);

  const grants = eligibleGrants(state, tx.date);
  // A transaction already on a grant that has since closed keeps that grant in the list.
  const grantIds = [
    ...new Set([...grants.map(g => g.id), ...parts.map(p => p.grantId).filter(Boolean)]),
  ];

  const placed = parts.reduce((s, p) => s + p.amount, 0);
  const left = total - placed;
  const split = parts.length > 1;

  const update = (i: number, patch: Partial<Part>) =>
    setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  /** With exactly two parts, the other one takes whatever is left, so they keep adding up. */
  const balance = (ps: Part[], edited: number): Part[] => {
    if (ps.length !== 2) return ps;
    const other = 1 - edited;
    const rest = total - ps[edited].amount;
    if (rest < 0) return ps;
    return ps.map((p, j) =>
      j === other ? { ...p, amount: rest, amt: amtText(rest), pct: pctText(rest, total) } : p,
    );
  };

  const setPercent = (i: number, raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    const n = parseFloat(clean);
    const amount = Number.isFinite(n) ? Math.round((total * n) / 100) : 0;
    setParts(ps =>
      balance(
        ps.map((p, j) => (j === i ? { ...p, pct: clean, amount, amt: amtText(amount) } : p)),
        i,
      ),
    );
  };

  const setAmount = (i: number, raw: string) => {
    const clean = raw.replace(/[^0-9]/g, '');
    const amount = clean ? parseInt(clean, 10) : 0;
    setParts(ps =>
      balance(
        ps.map((p, j) =>
          j === i
            ? { ...p, amt: clean ? amtText(amount) : '', amount, pct: pctText(amount, total) }
            : p,
        ),
        i,
      ),
    );
  };

  const setGrant = (i: number, grantId: string) => {
    const lines = grantLines(state, grantId);
    const was = lineById(state, parts[i].lineId);
    const line =
      lines.find(l => was && l.category === was.category) ??
      lines.find(l => l.accountCodes?.includes(tx.accountCode)) ??
      lines[0];
    update(i, { grantId, lineId: line?.id ?? '' });
  };

  const addPart = () => {
    if (parts.length >= MAX_PARTS) return;
    setParts(ps => [...ps, makePart(total, '', '', Math.max(0, left))]);
  };

  const removePart = (i: number) =>
    setParts(ps => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps));

  const splitEvenly = () => {
    const amounts = splitByPercent(
      total,
      parts.map(() => 100 / parts.length),
    );
    setParts(ps =>
      ps.map((p, j) => ({
        ...p,
        amount: amounts[j],
        amt: amtText(amounts[j]),
        pct: pctText(amounts[j], total),
      })),
    );
  };

  const restToLast = () => {
    setParts(ps => {
      const last = ps.length - 1;
      const amount = Math.max(0, ps[last].amount + left);
      return ps.map((p, j) =>
        j === last ? { ...p, amount, amt: amtText(amount), pct: pctText(amount, total) } : p,
      );
    });
  };

  // What stops a save, in the order someone would fix it.
  const problems: string[] = [];
  if (parts.some(p => !p.grantId || !p.lineId))
    problems.push('Choose a grant and a budget line for every part.');
  const lineIds = parts.map(p => p.lineId).filter(Boolean);
  if (new Set(lineIds).size !== lineIds.length)
    problems.push('Two parts are on the same line. Put them together or choose another line.');
  if (parts.some(p => p.amount <= 0)) problems.push('Every part needs an amount above $0.');
  const adds = left === 0;
  const canSave = adds && problems.length === 0;

  // This transaction's own dollars already on a line do not count against it twice.
  const ownOnLine = (lineId: string) =>
    transactionAllocations(state, tx.id)
      .filter(a => a.budgetLineId === lineId)
      .reduce((s, a) => s + a.amount, 0);

  const save = () => {
    if (!canSave) return;
    const allocations = parts.map(p => ({
      grantId: p.grantId,
      budgetLineId: p.lineId,
      amount: p.amount,
    }));
    let note: string | undefined;
    if (rule) {
      actions.grants.saveSplitRule({
        payee: tx.payee,
        parts: parts.map(p => ({
          grantId: p.grantId,
          budgetLineId: p.lineId,
          percent: Math.round((p.amount / total) * 10000) / 100,
        })),
      });
      note = `The next one from ${tx.payee} arrives with this ${split ? 'split' : 'line'} suggested.`;
    } else if (existingRule) {
      actions.grants.deleteSplitRule(existingRule.id);
      note = `The rule for ${tx.payee} is gone.`;
    }
    onSave(tx, allocations, note);
  };

  // A part that leaves its line hands its backup on; say where before saving.
  const lineName = (grantId: string, lineId: string) =>
    `${lineById(state, lineId)?.category ?? 'a removed line'} on ${funderShortName(funderOfGrant(state, grantId), true)}`;
  const moves = parts.every(p => p.grantId && p.lineId)
    ? backupMoves(
        state,
        tx.id,
        parts.map(p => ({ grantId: p.grantId, budgetLineId: p.lineId })),
      ).map(m => {
        const what = joinWords(
          [
            m.files ? (m.files === 1 ? 'the backup file' : `the ${m.files} backup files`) : '',
            m.note ? 'the backup note' : '',
          ].filter(Boolean),
        );
        const to = parts[m.to];
        return `On save, ${what} from ${lineName(m.from.grantId, m.from.budgetLineId)} move${
          m.files + (m.note ? 1 : 0) === 1 ? 's' : ''
        } to ${lineName(to.grantId, to.lineId)}.`;
      })
    : [];

  const legendName = (p: Part, i: number) => {
    if (!p.grantId) return `Part ${i + 1}`;
    const name = funderShortName(funderOfGrant(state, p.grantId));
    const twice = parts.filter(q => q.grantId === p.grantId).length > 1;
    const line = lineById(state, p.lineId);
    return twice && line ? `${name}, ${line.category}` : name;
  };

  return (
    <SidePanel
      eyebrow={split ? 'Split across grants' : 'Assign'}
      title={tx.payee}
      titleAside={money(total)}
      onClose={onClose}
      subtitle={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>
            <span className="tx-mono tx-strong">{dateShort(tx.date)}</span> · {tx.memo || tx.ref} ·{' '}
            <span className="tx-mono tx-strong">{tx.accountCode}</span>{' '}
            {accountName(state, tx.accountCode)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={13} />
            From QuickBooks. Splitting here does not change QuickBooks.
          </span>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {split ? 'Save split' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="tx-split">
        <div>
          <div
            className="tx-bar"
            role="img"
            aria-label={parts
              .map((p, i) => `${legendName(p, i)} ${pctText(p.amount, total)}%`)
              .join(', ')}
          >
            {parts.map((p, i) => (
              <span
                key={p.key}
                style={{
                  width: `${(Math.max(0, p.amount) / Math.max(total, placed, 1)) * 100}%`,
                  background: PART_COLORS[i],
                }}
              />
            ))}
          </div>
          <div className="tx-legend">
            {parts.map((p, i) => (
              <span key={p.key}>
                <i style={{ background: PART_COLORS[i] }} />
                {legendName(p, i)} {pctText(p.amount, total)}%
              </span>
            ))}
          </div>
        </div>

        {parts.map((p, i) => {
          const line = lineById(state, p.lineId);
          const lines = p.grantId ? grantLines(state, p.grantId) : [];
          const before = line ? lineMatched(state, line.id).amount - ownOnLine(line.id) : 0;
          const after = before + p.amount;
          const over = line ? after - line.planned : 0;
          const n = i + 1;
          return (
            <div
              key={p.key}
              className="tx-part"
              style={{ '--tx-part': PART_COLORS[i] } as React.CSSProperties}
            >
              <div className="tx-part__row">
                <Select
                  aria-label={`Grant for part ${n}`}
                  value={p.grantId}
                  onChange={e => setGrant(i, e.target.value)}
                  options={[
                    ...(p.grantId ? [] : [{ value: '', label: 'Choose a grant' }]),
                    ...grantIds.map(id => ({ value: id, label: grantOptionLabel(state, id) })),
                  ]}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <IconButton
                  label={`Remove part ${n}`}
                  variant="ghost"
                  size="sm"
                  disabled={parts.length === 1}
                  onClick={() => removePart(i)}
                >
                  <Icon name="x" size={15} />
                </IconButton>
              </div>
              <div className="tx-part__row">
                <Select
                  aria-label={`Budget line for part ${n}`}
                  value={p.lineId}
                  disabled={!p.grantId}
                  invalid={!!p.lineId && lineIds.filter(id => id === p.lineId).length > 1}
                  onChange={e => update(i, { lineId: e.target.value })}
                  options={[
                    ...(p.lineId
                      ? []
                      : [
                          {
                            value: '',
                            label: p.grantId ? 'Choose a line' : 'Choose a grant first',
                          },
                        ]),
                    ...lines.map(l => ({ value: l.id, label: l.category })),
                  ]}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Input
                  aria-label={`Percent for part ${n}`}
                  value={p.pct}
                  mono
                  suffix="%"
                  onChange={e => setPercent(i, e.target.value)}
                  style={{ width: 68, flex: '0 0 auto', padding: '0 var(--space-2)' }}
                />
                <Input
                  aria-label={`Dollars for part ${n}`}
                  value={p.amt}
                  mono
                  prefix="$"
                  invalid={p.amount <= 0}
                  onChange={e => setAmount(i, e.target.value)}
                  style={{ width: 92, flex: '0 0 auto', padding: '0 var(--space-2)' }}
                />
              </div>
              <p className={'tx-part__hint' + (over > 0 ? ' is-over' : '')}>
                {line ? (
                  <>
                    Line spent <span className="tx-mono">{money(before)}</span> of{' '}
                    <span className="tx-mono">{money(line.planned)}</span>,{' '}
                    <span className="tx-mono">{money(after)}</span> after this
                    {split ? ' split' : ''}
                    {over > 0 && (
                      <>
                        , over by <span className="tx-mono">{money(over)}</span>
                      </>
                    )}
                  </>
                ) : (
                  'Choose a line to see what it has left.'
                )}
              </p>
            </div>
          );
        })}

        {parts.length < MAX_PARTS && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon name="plus" size={15} />}
              onClick={addPart}
            >
              Add another grant
            </Button>
          </div>
        )}

        <div className={'tx-check' + (adds ? '' : ' is-off')} role="status">
          <Icon name={adds ? 'circle-check' : 'circle-alert'} size={16} />
          <span>
            Parts add up to <span className="tx-mono">{money(placed)}</span>
          </span>
          <span className="tx-check__right">
            {adds
              ? '$0 left'
              : left > 0
                ? `${money(left)} left to place`
                : `${money(-left)} too much`}
          </span>
        </div>
        {(split || !adds) && (
          <div className="tx-links">
            {split && <LinkButton onClick={splitEvenly}>Split evenly</LinkButton>}
            {!adds && parts[parts.length - 1].amount + left > 0 && (
              <LinkButton onClick={restToLast}>
                {left > 0 ? 'Give the rest to the last part' : 'Take the extra off the last part'}
              </LinkButton>
            )}
          </div>
        )}
        {problems.length > 0 && (
          <ul className="tx-problems">
            {problems.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <label className="tx-rule">
          <input type="checkbox" checked={rule} onChange={e => setRule(e.target.checked)} />
          <span>
            Always {split ? 'split' : 'assign'} {tx.payee} this way
          </span>
          <span className="tx-rule__tag">Rules</span>
        </label>
        {rule !== !!existingRule && (
          <p className="tx-rule__note">
            {rule
              ? `On save, the next transaction from ${tx.payee} arrives with this suggested.`
              : `On save, the rule for ${tx.payee} is removed.`}
          </p>
        )}
        {moves.map(text => (
          <p key={text} className="tx-rule__note">
            {text}
          </p>
        ))}
      </div>
    </SidePanel>
  );
}
