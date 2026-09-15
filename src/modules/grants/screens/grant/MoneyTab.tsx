import React from 'react';
import { Button, DataTable, Dialog, EmptyState, Field, Icon, Input, ProgressBar, Select } from '../../../../design-system';
import { dateShort, money, useStore } from '../../../../core';
import { grantMoney, isPostAward } from '../../domain';
import type { BudgetLine, Expense, Grant, Payment } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { AddButton, DeleteX, DialogFields, DoneMark, SectionBand, useRowHover } from './parts';
import { TableScroll } from '../../../../app/components/TableScroll';
import './grant.css';

/** Post-award money: what was awarded, what arrived, what it was spent on. */
export function MoneyTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [addingPayment, setAddingPayment] = React.useState(false);
  const [addingLine, setAddingLine] = React.useState(false);
  const [editingLine, setEditingLine] = React.useState<BudgetLine | null>(null);
  const [loggingExpense, setLoggingExpense] = React.useState(false);
  const expenseHover = useRowHover();

  if (!isPostAward(grant.phase)) {
    return (
      <EmptyState icon={<Icon name="landmark" size={22} />} title="Nothing to track yet"
        message="Budget and payments appear here once the grant is awarded." />
    );
  }

  const m = grantMoney(state, grant.id);
  const payments = state.grants.payments.filter(p => p.grantId === grant.id)
    .slice().sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  const expenses = state.grants.expenses.filter(e => e.grantId === grant.id)
    .slice().sort((a, b) => b.date.localeCompare(a.date));
  const lines = state.grants.budgetLines.filter(l => l.grantId === grant.id);
  const lineName = (id: string) => lines.find(l => l.id === id)?.category ?? '—';

  return (
    <div>
      <div className="ja-money-summary" style={{ padding: 'var(--space-5) var(--space-6)' }}>
        {[
          ['Awarded', m.awarded], ['Received', m.received], ['Spent', m.spent], ['Remaining', m.remaining],
        ].map(([label, value]) => (
          <div key={label as string} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ font: 'var(--weight-semibold) var(--text-2xl)/1 var(--font-display)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)' }}>
              {money(value as number)}
            </span>
          </div>
        ))}
      </div>

      <SectionBand title="Payments from funder" action={<AddButton label="Add payment" onClick={() => setAddingPayment(true)} />} />
      <TableScroll minWidth={560}>
      <DataTable
        columns={[
          { key: 'label', label: 'Label', strong: true, width: '1.4fr' },
          { key: 'expectedDate', label: 'Expected', width: '110px', mono: true, render: (r: Payment) => dateShort(r.expectedDate) },
          { key: 'amount', label: 'Amount', width: '110px', mono: true, align: 'right', render: (r: Payment) => money(r.amount) },
          {
            key: 'receivedDate', label: 'Received', width: '1fr', render: (r: Payment) => r.receivedDate
              ? <DoneMark>{dateShort(r.receivedDate)}</DoneMark>
              : <Button variant="secondary" size="sm" onClick={() => {
                actions.grants.markPaymentReceived(r.id, today);
                toast({ tone: 'success', title: 'Payment received', message: `${money(r.amount)} · ${r.label}` });
              }}>Mark received</Button>,
          },
        ]}
        rows={payments}
        emptyLabel="No installments recorded yet."
      />
      </TableScroll>

      <SectionBand title="Budget" action={<AddButton label="Add line" onClick={() => setAddingLine(true)} />} />
      {lines.length === 0 ? (
        <p style={{ margin: 0, padding: '0 var(--space-6) var(--space-4)', font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          No budget lines yet. Add one to track spending against the award.
        </p>
      ) : (
        <div className="ja-grid-2" style={{ gap: 'var(--space-4) var(--space-7)', padding: '2px var(--space-6) var(--space-3)' }}>
          {m.byLine.map(({ line, spent }) => {
            const over = spent > line.planned;
            return (
              <div key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-body)' }}>
                  <button onClick={() => setEditingLine(line)} title="Edit this line"
                    style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {line.category}
                  </button>
                  <span style={{ flex: '0 0 auto', font: 'var(--weight-medium) var(--text-2xs)/1.3 var(--font-mono)', color: 'var(--text-strong)' }}>
                    {money(spent)} / {money(line.planned)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <ProgressBar style={{ flex: 1 }} value={spent} max={Math.max(line.planned, 1)}
                    color={over ? 'var(--danger-500)' : 'var(--blue-500)'} />
                  <span style={{ flex: '0 0 auto', font: 'var(--type-body-sm)', fontSize: 'var(--text-2xs)', color: over ? 'var(--danger-500)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {over ? `${money(spent - line.planned)} over` : `${money(line.planned - spent)} remaining`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionBand title="Expenses" action={<AddButton label="Log expense" onClick={() => setLoggingExpense(true)} />} />
      <TableScroll minWidth={640}>
      <div ref={expenseHover.ref} {...expenseHover.hoverProps}>
      <DataTable
        columns={[
          { key: 'date', label: 'Date', width: '90px', mono: true, render: (r: Expense) => dateShort(r.date) },
          { key: 'payee', label: 'Payee', strong: true, width: '1.4fr' },
          { key: 'category', label: 'Category', width: '1.2fr', render: (r: Expense) => lineName(r.budgetLineId) },
          { key: 'amount', label: 'Amount', width: '100px', mono: true, align: 'right', render: (r: Expense) => money(r.amount) },
          {
            key: 'note', label: 'Note', width: '1fr', render: (r: Expense) => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note ?? ''}</span>
                {expenses[expenseHover.index]?.id === r.id && (
                  <span style={{ marginLeft: 'auto', display: 'flex' }}>
                    <DeleteX label="Delete expense" onClick={e => {
                      e.stopPropagation();
                      actions.grants.deleteExpense(r.id);
                      toast({ tone: 'info', title: 'Expense deleted', message: `${r.payee} · ${money(r.amount)}` });
                    }} />
                  </span>
                )}
              </span>
            ),
          },
        ]}
        rows={expenses}
        emptyLabel="Nothing spent against this grant yet."
      />
      </div>
      </TableScroll>

      {addingPayment && (
        <PaymentDialog onClose={() => setAddingPayment(false)} onSave={v => {
          actions.grants.addPayment({ grantId: grant.id, label: v.label, expectedDate: v.expectedDate, amount: v.amount });
          toast({ tone: 'success', title: 'Payment added', message: `${v.label} · ${money(v.amount)}` });
          setAddingPayment(false);
        }} />
      )}

      {addingLine && (
        <BudgetLineDialog title="Add budget line" onClose={() => setAddingLine(false)} onSave={v => {
          actions.grants.addBudgetLine({ grantId: grant.id, category: v.category, planned: v.planned });
          toast({ tone: 'success', title: 'Budget line added', message: `${v.category} · ${money(v.planned)}` });
          setAddingLine(false);
        }} />
      )}

      {editingLine && (
        <BudgetLineDialog title="Edit budget line" line={editingLine} onClose={() => setEditingLine(null)}
          onDelete={() => {
            actions.grants.deleteBudgetLine(editingLine.id);
            toast({ tone: 'info', title: 'Budget line removed', message: editingLine.category });
            setEditingLine(null);
          }}
          onSave={v => {
            actions.grants.updateBudgetLine(editingLine.id, { category: v.category, planned: v.planned });
            toast({ tone: 'success', title: 'Budget line saved', message: `${v.category} · ${money(v.planned)}` });
            setEditingLine(null);
          }} />
      )}

      {loggingExpense && (
        <ExpenseDialog grant={grant} lines={lines} today={today} onClose={() => setLoggingExpense(false)} onSave={v => {
          actions.grants.addExpense({ grantId: grant.id, ...v });
          toast({ tone: 'success', title: 'Expense logged', message: `${v.payee} · ${money(v.amount)}` });
          setLoggingExpense(false);
        }} />
      )}
    </div>
  );
}

function PaymentDialog({ onClose, onSave }: {
  onClose: () => void;
  onSave: (v: { label: string; expectedDate: string; amount: number }) => void;
}) {
  const { today } = useStore();
  const [label, setLabel] = React.useState('');
  const [expectedDate, setExpectedDate] = React.useState(today);
  const [amount, setAmount] = React.useState('');
  return (
    <Dialog open title="Add payment" description="An installment the funder has promised." onClose={onClose} width={460}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!label.trim() || !amount}
          onClick={() => onSave({ label: label.trim(), expectedDate, amount: Math.round(Number(amount)) })}>Add payment</Button>
      </>}>
      <DialogFields>
        <Field label="Label" required>
          <Input value={label} placeholder="Second installment" onChange={e => setLabel(e.target.value)} />
        </Field>
        <Field label="Expected date">
          <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
        </Field>
        <Field label="Amount" required>
          <Input type="number" mono prefix={<span style={{ font: 'var(--type-numeric)' }}>$</span>}
            value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}

function BudgetLineDialog({ title, line, onClose, onSave, onDelete }: {
  title: string;
  line?: BudgetLine;
  onClose: () => void;
  onSave: (v: { category: string; planned: number }) => void;
  onDelete?: () => void;
}) {
  const [category, setCategory] = React.useState(line?.category ?? '');
  const [planned, setPlanned] = React.useState(line ? String(line.planned) : '');
  return (
    <Dialog open title={title} description="How the award is allocated. Expenses are logged against these lines."
      onClose={onClose} width={460}
      footer={<>
        {onDelete && <Button variant="secondary" style={{ marginRight: 'auto', color: 'var(--danger-500)' }} onClick={onDelete}>Delete</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!category.trim() || !planned}
          onClick={() => onSave({ category: category.trim(), planned: Math.round(Number(planned)) })}>Save</Button>
      </>}>
      <DialogFields>
        <Field label="Category" required>
          <Input value={category} placeholder="Teaching artist stipends" onChange={e => setCategory(e.target.value)} />
        </Field>
        <Field label="Planned" required>
          <Input type="number" mono prefix={<span style={{ font: 'var(--type-numeric)' }}>$</span>}
            value={planned} onChange={e => setPlanned(e.target.value)} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}

function ExpenseDialog({ grant, lines, today, onClose, onSave }: {
  grant: Grant;
  lines: BudgetLine[];
  today: string;
  onClose: () => void;
  onSave: (v: { date: string; payee: string; budgetLineId: string; amount: number; note?: string }) => void;
}) {
  const [date, setDate] = React.useState(today);
  const [payee, setPayee] = React.useState('');
  const [budgetLineId, setBudgetLineId] = React.useState(lines[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  return (
    <Dialog open title="Log expense" description={`Money spent against ${grant.title}.`} onClose={onClose} width={480}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!payee.trim() || !amount || !budgetLineId}
          onClick={() => onSave({ date, payee: payee.trim(), budgetLineId, amount: Math.round(Number(amount)), note: note.trim() || undefined })}>Log expense</Button>
      </>}>
      <DialogFields>
        <Field label="Date">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Payee" required>
          <Input value={payee} placeholder="Long Beach Band Repair" onChange={e => setPayee(e.target.value)} />
        </Field>
        <Field label="Budget line" required hint={lines.length === 0 ? 'Add a budget line first.' : undefined}>
          <Select value={budgetLineId} onChange={e => setBudgetLineId(e.target.value)}
            options={lines.map(l => ({ value: l.id, label: l.category }))} />
        </Field>
        <Field label="Amount" required>
          <Input type="number" mono prefix={<span style={{ font: 'var(--type-numeric)' }}>$</span>}
            value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} placeholder="Two trombones, one alto" onChange={e => setNote(e.target.value)} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
