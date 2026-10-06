import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { money, useStore } from '../../../../core';
import { grantLines } from '../../domain';
import type { Expense, Grant } from '../../domain';
import { DialogFields, FieldRow } from './parts';

/** The two small dialogs on the Expenses tab: log one by hand, and move one to another line. */

const NOTE: React.CSSProperties = {
  margin: 0,
  font: 'var(--type-body-sm)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

/**
 * For something that never went through QuickBooks: a reimbursement paid in
 * cash, an in-kind cost the funder asked us to count. Calls `onSaved` with the new id.
 */
export function LogExpenseDialog({
  grant,
  onClose,
  onSaved,
}: {
  grant: Grant;
  onClose: () => void;
  onSaved: (id: string, expense: Omit<Expense, 'id'>) => void;
}) {
  const { state, today, actions } = useStore();
  const lines = grantLines(state, grant.id);
  const [date, setDate] = React.useState(today);
  const [payee, setPayee] = React.useState('');
  const [lineId, setLineId] = React.useState(lines[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [tried, setTried] = React.useState(false);

  const dollars = Math.round(Number(amount.replace(/[$,\s]/g, '')));
  const errors = {
    date: !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Pick the day it was paid.' : undefined,
    payee: !payee.trim() ? 'Who was paid?' : undefined,
    line: !lineId ? 'Pick a budget line.' : undefined,
    amount:
      !amount.trim() || !Number.isFinite(dollars) || dollars <= 0
        ? 'Enter the amount in whole dollars.'
        : undefined,
  };
  const ok = !errors.date && !errors.payee && !errors.line && !errors.amount;

  const save = () => {
    setTried(true);
    if (!ok) return;
    const input: Omit<Expense, 'id'> = {
      grantId: grant.id,
      budgetLineId: lineId,
      date,
      payee: payee.trim(),
      amount: dollars,
      note: note.trim() || undefined,
    };
    const id = actions.grants.addExpense(input);
    onSaved(id, input);
  };

  if (lines.length === 0) {
    return (
      <Dialog
        open
        title="Log an expense by hand"
        onClose={onClose}
        width={440}
        footer={
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p style={{ ...NOTE, fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
          This grant has no budget lines yet, so there is nowhere to count an expense. Add the lines
          on the Budget tab first.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="Log an expense by hand"
      onClose={onClose}
      width={480}
      description="For something that never went through QuickBooks. It counts against the budget line like any other expense."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Log expense
          </Button>
        </>
      }
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <DialogFields>
          <FieldRow>
            <Field label="Date" error={tried ? errors.date : undefined}>
              <Input
                type="date"
                value={date}
                invalid={tried && !!errors.date}
                onChange={e => setDate(e.target.value)}
              />
            </Field>
            <Field label="Amount" error={tried ? errors.amount : undefined}>
              <Input
                mono
                prefix="$"
                value={amount}
                placeholder="0"
                invalid={tried && !!errors.amount}
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
          </FieldRow>
          <Field label="Payee" error={tried ? errors.payee : undefined}>
            <Input
              value={payee}
              placeholder="Who was paid"
              invalid={tried && !!errors.payee}
              onChange={e => setPayee(e.target.value)}
            />
          </Field>
          <Field label="Budget line" error={tried ? errors.line : undefined}>
            <Select
              value={lineId}
              onChange={e => setLineId(e.target.value)}
              options={lines.map(l => ({ value: l.id, label: l.category }))}
            />
          </Field>
          <Field
            label="What it was for"
            hint="Shows as the description, and in the audit download."
          >
            <Input
              value={note}
              placeholder="Reed order for the spring clinic"
              onChange={e => setNote(e.target.value)}
            />
          </Field>
        </DialogFields>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Count an expense against another line on the same grant. QuickBooks is not touched. */
export function ReassignDialog({
  grant,
  expense,
  onClose,
  onSaved,
}: {
  grant: Grant;
  expense: Expense;
  onClose: () => void;
  onSaved: (lineId: string) => void;
}) {
  const { state } = useStore();
  const lines = grantLines(state, grant.id);
  const [lineId, setLineId] = React.useState(expense.budgetLineId);
  const same = lineId === expense.budgetLineId;

  return (
    <Dialog
      open
      title="Move to another budget line"
      onClose={onClose}
      width={440}
      description={`${expense.payee}, ${money(expense.amount)}. ${expense.transactionId ? 'QuickBooks is read-only, so this only changes where the portal counts it.' : 'Entered by hand, so only the portal knows about it.'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={same} onClick={() => onSaved(lineId)}>
            Move expense
          </Button>
        </>
      }
    >
      <Field
        label="Budget line"
        hint={lines.length < 2 ? 'This grant has only one budget line.' : undefined}
      >
        <Select
          value={lineId}
          onChange={e => setLineId(e.target.value)}
          options={lines.map(l => ({
            value: l.id,
            label: l.id === expense.budgetLineId ? `${l.category} (now)` : l.category,
          }))}
        />
      </Field>
    </Dialog>
  );
}
