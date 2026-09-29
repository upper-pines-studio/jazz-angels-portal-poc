import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Select } from '../../../../design-system';
import { money, plainNumber, useStore } from '../../../../core';
import { accountLabel, accountUsedBy } from '../../domain';
import type { BudgetLine, Grant } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { BudgetAccountPicker } from './BudgetAccountPicker';
import { BudgetMatched, budgetTransactionsHref } from './budgetBits';

/** Props the design-system Input passes through to its `<input>` but does not type. */
const inputExtras = (o: Record<string, unknown>) => o as object;

/** "8,000", "$8000", " 8000 " → 8000; blank → 0; anything else → undefined. */
function parseDollars(text: string): number | undefined {
  const clean = text.replace(/[$,\s]/g, '');
  if (clean === '') return 0;
  return /^\d+$/.test(clean) ? Number(clean) : undefined;
}

/** What the helper line under the editor says about the chosen accounts. */
function accountHint(codes: string[], classId: string, clash: string | undefined): string {
  if (clash) return clash;
  if (codes.length === 0) return 'Pick the QuickBooks accounts whose spending counts here.';
  const tail = classId ? '' : ' Pick a class so only this grant’s spending matches.';
  if (codes.length === 1) return `Spending in ${codes[0]} counts here.${tail}`;
  if (codes.length === 2) return `Spending in either account counts here.${tail}`;
  return `Spending in any of these accounts counts here.${tail}`;
}

/**
 * One budget line opened for editing in place: category, approved amount,
 * QuickBooks accounts and class, then Remove, Cancel and Save underneath.
 * With no `line` it adds a new one at the foot of the table.
 */
export function BudgetLineEditor({ grant, line, lines, onClose, onSaved, onDirty, startRemoving = false }: {
  grant: Grant;
  line?: BudgetLine;
  /** Every line on the grant, for the duplicate check and the default class. */
  lines: BudgetLine[];
  onClose: () => void;
  onSaved: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  /** Opened from "Remove line" in the row menu: show the confirmation straight away. */
  startRemoving?: boolean;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const classes = state.grants.classes;

  // A new line takes the class the rest of the grant already uses.
  const usualClass = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) if (l.classId) counts.set(l.classId, (counts.get(l.classId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [lines]);

  const initial = React.useMemo(() => ({
    category: line?.category ?? '',
    amount: line ? plainNumber(line.planned) : '',
    codes: line?.accountCodes ?? [],
    classId: line ? line.classId ?? '' : usualClass,
  }), [line, usualClass]);

  const [category, setCategory] = React.useState(initial.category);
  const [amount, setAmount] = React.useState(initial.amount);
  const [codes, setCodes] = React.useState<string[]>(initial.codes);
  const [classId, setClassId] = React.useState(initial.classId);
  const [tried, setTried] = React.useState(false);
  const [removing, setRemoving] = React.useState(startRemoving);
  const categoryRef = React.useRef<HTMLDivElement | null>(null);

  const dirty = category !== initial.category || amount !== initial.amount
    || codes.join() !== initial.codes.join() || classId !== initial.classId;
  React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  React.useEffect(() => () => onDirty(false), [onDirty]);

  React.useEffect(() => {
    if (!startRemoving) categoryRef.current?.querySelector('input')?.focus();
  }, [startRemoving]);

  const name = category.trim();
  const dollars = parseDollars(amount);
  const duplicate = lines.find(l => l.id !== line?.id && l.category.trim().toLowerCase() === name.toLowerCase());
  const categoryError = !name ? 'Give the line a category, like Instrument repair.'
    : duplicate ? `This grant already has a line called ${duplicate.category}.` : undefined;
  const amountError = dollars === undefined ? 'Enter the approved amount in whole dollars, like 8000. Zero is fine.' : undefined;
  const error = tried ? categoryError ?? amountError : undefined;

  // Two lines with the same account and class would make every such transaction ask which line.
  const clashes = codes
    .map(code => ({ code, other: accountUsedBy(state, grant.id, code, line?.id).find(l => l.classId === classId && !!classId) }))
    .filter((c): c is { code: string; other: BudgetLine } => !!c.other);
  const clash = clashes.length
    ? `${accountLabel(state, clashes[0].code)} also counts on ${clashes[0].other.category}, so its transactions will ask which line.`
    : undefined;

  const save = () => {
    setTried(true);
    if (categoryError || amountError || dollars === undefined) return;
    const patch = { category: name, planned: dollars, accountCodes: codes, classId: classId || undefined };
    if (line) {
      actions.grants.updateBudgetLine(line.id, patch);
      toast({ tone: 'success', title: 'Line saved', message: `${name}, ${money(dollars)}` });
      onSaved(line.id);
    } else {
      const id = actions.grants.addBudgetLine({ grantId: grant.id, ...patch });
      toast({ tone: 'success', title: 'Line added', message: `${name}, ${money(dollars)}` });
      onSaved(id);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Enter' && tag === 'INPUT') { e.preventDefault(); save(); }
  };

  return (
    <div className="budget-edit" onKeyDown={onKeyDown} role="group" aria-label={line ? `Edit ${line.category}` : 'New budget line'}>
      <div className="budget-row budget-row--edit">
        <label className="budget-cell budget-cell--cat">
          <span className="budget-sr">Category</span>
          <div ref={categoryRef}>
            <Input value={category} placeholder="Category" invalid={tried && !!categoryError}
              onChange={e => setCategory(e.target.value)} {...inputExtras({ 'aria-invalid': tried && !!categoryError })} />
          </div>
        </label>
        <label className="budget-cell budget-cell--amt budget-amount">
          <span className="budget-sr">Approved amount in dollars</span>
          <Input value={amount} mono prefix={<span className="budget-dollar">$</span>} placeholder="0"
            invalid={tried && !!amountError} onChange={e => setAmount(e.target.value)}
            {...inputExtras({ inputMode: 'numeric', 'aria-invalid': tried && !!amountError })} />
        </label>
        <div className="budget-cell budget-cell--acc">
          <BudgetAccountPicker grantId={grant.id} lineId={line?.id} value={codes} onChange={setCodes} />
        </div>
        <label className="budget-cell budget-cell--cls">
          <span className="budget-sr">QuickBooks class</span>
          <Select value={classId} onChange={e => setClassId(e.target.value)}
            options={[{ value: '', label: 'No class yet' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
        </label>
        <div className="budget-cell budget-cell--match">{line && <BudgetMatched grantId={grant.id} lineId={line.id} />}</div>
        <span className="budget-cell budget-cell--menu" />
      </div>

      <div className="budget-edit__foot">
        {removing && line ? (
          <RemoveConfirm grant={grant} line={line} onKeep={() => setRemoving(false)} onRemoved={onClose} />
        ) : (
          <>
            <span className="budget-edit__eyebrow">{line ? 'Editing' : 'New line'}</span>
            <span className={`budget-edit__hint${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
              {error ?? accountHint(codes, classId, clash)}
            </span>
            <span className="budget-edit__actions">
              {line && (
                <Button variant="ghost" size="sm" onClick={() => setRemoving(true)} style={{ color: 'var(--danger-500)' }}>Remove line</Button>
              )}
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={save}>{line ? 'Save line' : 'Add line'}</Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The question before a line goes. A line with expenses on it stays: removing
 * it would leave those expenses on nothing, so it says where they are instead.
 */
function RemoveConfirm({ grant, line, onKeep, onRemoved }: {
  grant: Grant;
  line: BudgetLine;
  onKeep: () => void;
  onRemoved: () => void;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const keep = React.useRef<HTMLDivElement | null>(null);
  const expenses = state.grants.expenses.filter(e => e.budgetLineId === line.id);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  React.useEffect(() => { keep.current?.querySelector('button')?.focus(); }, []);

  if (expenses.length > 0) {
    const n = expenses.length;
    return (
      <div className="budget-remove" role="alert">
        <span className="budget-remove__text">
          <strong>{line.category}</strong> cannot be removed while {n} {n === 1 ? 'expense' : 'expenses'} ({money(total)}) {n === 1 ? 'is' : 'are'} assigned to it.
          Move {n === 1 ? 'it' : 'them'} to another line first.{' '}
          <Link to={budgetTransactionsHref(grant.id, line.id)}>View {n === 1 ? 'that transaction' : `those ${n} transactions`}</Link>
        </span>
        <span className="budget-edit__actions" ref={keep}>
          <Button variant="secondary" size="sm" onClick={onKeep}>Keep line</Button>
        </span>
      </div>
    );
  }

  return (
    <div className="budget-remove" role="alert">
      <span className="budget-remove__text">
        Remove <strong>{line.category}</strong>? Nothing is matched to it yet, so no expense is affected.
      </span>
      <span className="budget-edit__actions" ref={keep}>
        <Button variant="secondary" size="sm" onClick={onKeep}>Keep line</Button>
        <Button variant="danger" size="sm" onClick={() => {
          actions.grants.deleteBudgetLine(line.id);
          toast({ tone: 'info', title: 'Line removed', message: `${line.category} is off the ${grant.title} budget.` });
          onRemoved();
        }}>Remove line</Button>
      </span>
    </div>
  );
}
