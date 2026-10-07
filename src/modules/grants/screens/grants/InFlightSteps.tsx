import React from 'react';
import { Eyebrow } from '../../../../app/components/badges';
import { Field, Input, Select, Switch } from '../../../../design-system';
import { money, plainNumber } from '../../../../core';
import type { InFlightInput, Report, ReportStatus } from '../../domain';
import { AddButton, DeleteX } from '../grant/parts';

/**
 * The steps Add grant shows for a grant already under way (decision 0004):
 * the award and the dates it knows, the budget, and the payments and reports
 * so far. The dialog holds the drafts; these draw them and say what is wrong.
 */

export interface AwardDraft {
  amount: string;
  requested: string;
  decided: string;
  periodStart: string;
  periodEnd: string;
  loiDue: string;
  applicationDue: string;
  submitted: string;
}

export const EMPTY_AWARD: AwardDraft = {
  amount: '',
  requested: '',
  decided: '',
  periodStart: '',
  periodEnd: '',
  loiDue: '',
  applicationDue: '',
  submitted: '',
};

export interface LineDraft {
  key: number;
  category: string;
  planned: string;
}

export interface PaymentDraft {
  key: number;
  label: string;
  amount: string;
  expectedDate: string;
  receivedDate: string;
}

export interface ReportDraft {
  key: number;
  kind: Report['kind'];
  dueDate: string;
  status: ReportStatus;
  submittedDate: string;
}

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: 'upcoming', label: 'Not started' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
];

const isSent = (status: ReportStatus) => status === 'submitted' || status === 'accepted';
const digits = (v: string) => v.replace(/\D/g, '');
const shown = (v: string) => (v ? plainNumber(Number(v)) : '');

// ---------------------------------------------------------------------------
// What is wrong with each draft
// ---------------------------------------------------------------------------

export function awardErrors(a: AwardDraft) {
  return {
    amount: !a.amount || Number(a.amount) <= 0 ? 'Enter the amount awarded.' : undefined,
    period:
      a.periodStart && a.periodEnd && a.periodEnd < a.periodStart
        ? 'The period has to end after it starts.'
        : undefined,
  };
}

const lineBlank = (l: LineDraft) => !l.category.trim() && !l.planned;
const paymentBlank = (p: PaymentDraft) =>
  !p.label.trim() && !p.amount && !p.expectedDate && !p.receivedDate;

export function lineErrors(lines: LineDraft[]) {
  return lines.map((l, i) => {
    if (lineBlank(l)) return {};
    const name = l.category.trim();
    const earlier = lines
      .slice(0, i)
      .find(o => o.category.trim().toLowerCase() === name.toLowerCase());
    return {
      category: !name
        ? 'Give the line a category, like Instrument repair.'
        : earlier
          ? `There is already a line called ${earlier.category.trim()}.`
          : undefined,
      planned: !l.planned ? 'Enter the approved amount.' : undefined,
    };
  });
}

export function paymentErrors(payments: PaymentDraft[]) {
  return payments.map(p => {
    if (paymentBlank(p)) return {};
    return {
      label: !p.label.trim() ? 'Name the installment.' : undefined,
      amount: !p.amount || Number(p.amount) <= 0 ? 'Enter the amount.' : undefined,
      // A payment that has arrived may leave its expected date blank: it takes the day it came.
      expectedDate:
        !p.expectedDate && !p.receivedDate ? 'Pick the date it is expected.' : undefined,
    };
  });
}

export function reportErrors(reports: ReportDraft[]) {
  return reports.map(r => ({ dueDate: !r.dueDate ? 'Pick the due date.' : undefined }));
}

const anyError = (rows: Array<Record<string, string | undefined>>) =>
  rows.some(r => Object.values(r).some(Boolean));

export function budgetValid(lines: LineDraft[]) {
  return !anyError(lineErrors(lines));
}

export function paymentsReportsValid(payments: PaymentDraft[], reports: ReportDraft[]) {
  return !anyError(paymentErrors(payments)) && !anyError(reportErrors(reports));
}

/** The drafts as the store takes them. Blank rows are dropped. */
export function inFlightFrom(
  award: AwardDraft,
  lines: LineDraft[],
  payments: PaymentDraft[],
  reports: ReportDraft[],
): InFlightInput {
  return {
    amountAwarded: Number(award.amount),
    budgetLines: lines
      .filter(l => !lineBlank(l))
      .map(l => ({ category: l.category.trim(), planned: Number(l.planned) })),
    payments: payments
      .filter(p => !paymentBlank(p))
      .map(p => ({
        label: p.label.trim(),
        amount: Number(p.amount),
        expectedDate: p.expectedDate || p.receivedDate,
        receivedDate: p.receivedDate || undefined,
      })),
    reports: reports.map(r => ({
      kind: r.kind,
      dueDate: r.dueDate,
      status: r.status,
      submittedDate: isSent(r.status) && r.submittedDate ? r.submittedDate : undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

export function AwardStep({
  award,
  onChange,
  loiRequired,
  onLoiRequired,
  showErrors,
}: {
  award: AwardDraft;
  onChange: (patch: Partial<AwardDraft>) => void;
  loiRequired: boolean;
  onLoiRequired: (v: boolean) => void;
  showErrors: boolean;
}) {
  const errors = awardErrors(award);
  const date = (key: keyof AwardDraft) => ({
    type: 'date',
    value: award[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div className="ja-grid-2" style={{ alignItems: 'start' }}>
        <Field
          label="Amount awarded"
          required
          hint="Whole dollars."
          error={showErrors ? errors.amount : undefined}
        >
          <Input
            value={shown(award.amount)}
            mono
            prefix="$"
            placeholder="40,000"
            invalid={showErrors && !!errors.amount}
            onChange={e => onChange({ amount: digits(e.target.value) })}
          />
        </Field>
        <Field label="Amount requested">
          <Input
            value={shown(award.requested)}
            mono
            prefix="$"
            onChange={e => onChange({ requested: digits(e.target.value) })}
          />
        </Field>
        <Field label="Date awarded">
          <Input {...date('decided')} />
        </Field>
        <span className="ja-hide-sm" />
        <Field label="Grant period starts">
          <Input {...date('periodStart')} />
        </Field>
        <Field label="Grant period ends" error={errors.period}>
          <Input {...date('periodEnd')} invalid={!!errors.period} />
        </Field>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Eyebrow>Before the award</Eyebrow>
        <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          Leave blank any date you don’t have. The grant’s steps show a date only where you give
          one.
        </p>
        <div className="ja-grid-2" style={{ alignItems: 'start' }}>
          <div
            style={{
              gridColumn: '1/-1',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <Switch checked={loiRequired} onChange={onLoiRequired} />
            <span style={{ font: 'var(--type-label)', color: 'var(--text-strong)' }}>
              The funder asked for a letter of intent
            </span>
          </div>
          {loiRequired && (
            <>
              <Field label="LOI due">
                <Input {...date('loiDue')} />
              </Field>
              <span className="ja-hide-sm" />
            </>
          )}
          <Field label="Application due">
            <Input {...date('applicationDue')} />
          </Field>
          <Field label="Submitted on">
            <Input {...date('submitted')} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function BudgetStep({
  lines,
  onChange,
  awarded,
  newKey,
  showErrors,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  awarded: number;
  newKey: () => number;
  showErrors: boolean;
}) {
  const errors = lineErrors(lines);
  const total = lines.reduce((sum, l) => sum + (Number(l.planned) || 0), 0);
  const set = (key: number, patch: Partial<LineDraft>) =>
    onChange(lines.map(l => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
        The lines the award is split into, as the funder approved them. The QuickBooks accounts and
        class, the award terms and the award letter go on the grant’s tabs afterwards.
      </p>
      {lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="ja-inflight-line" aria-hidden>
            <Eyebrow>Category</Eyebrow>
            <Eyebrow>Approved</Eyebrow>
            <span />
          </div>
          {lines.map((l, i) => {
            const e = showErrors ? errors[i] : {};
            return (
              <div key={l.key} className="ja-inflight-line">
                <Field error={e.category}>
                  <Input
                    value={l.category}
                    placeholder="Teaching artist stipends"
                    invalid={!!e.category}
                    onChange={ev => set(l.key, { category: ev.target.value })}
                  />
                </Field>
                <Field error={e.planned}>
                  <Input
                    value={shown(l.planned)}
                    mono
                    prefix="$"
                    invalid={!!e.planned}
                    onChange={ev => set(l.key, { planned: digits(ev.target.value) })}
                  />
                </Field>
                <span style={{ paddingTop: 12 }}>
                  <DeleteX
                    label="Remove line"
                    onClick={() => onChange(lines.filter(x => x.key !== l.key))}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <AddButton
          label="Add line"
          onClick={() => onChange([...lines, { key: newKey(), category: '', planned: '' }])}
        />
        <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          {lines.length === 0
            ? 'No budget yet. You can set it up on the Budget tab.'
            : `${money(total)} of ${money(awarded)} awarded is in the budget.`}
        </span>
      </div>
    </div>
  );
}

export function PaymentsReportsStep({
  payments,
  onPayments,
  reports,
  onReports,
  awarded,
  newKey,
  showErrors,
}: {
  payments: PaymentDraft[];
  onPayments: (rows: PaymentDraft[]) => void;
  reports: ReportDraft[];
  onReports: (rows: ReportDraft[]) => void;
  awarded: number;
  newKey: () => number;
  showErrors: boolean;
}) {
  const pErrors = paymentErrors(payments);
  const rErrors = reportErrors(reports);
  const scheduled = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const received = payments
    .filter(p => p.receivedDate)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const setPayment = (key: number, patch: Partial<PaymentDraft>) =>
    onPayments(payments.map(p => (p.key === key ? { ...p, ...patch } : p)));
  const setReport = (key: number, patch: Partial<ReportDraft>) =>
    onReports(reports.map(r => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Eyebrow>Payments</Eyebrow>
        <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          Every installment the award letter promises. Give a received date to the ones that have
          already arrived.
        </p>
        {payments.map((p, i) => {
          const e = showErrors ? pErrors[i] : {};
          return (
            <RowBlock
              key={p.key}
              removeLabel="Remove payment"
              onRemove={() => onPayments(payments.filter(x => x.key !== p.key))}
            >
              <Field label="Installment" error={e.label}>
                <Input
                  value={p.label}
                  placeholder="First installment"
                  invalid={!!e.label}
                  onChange={ev => setPayment(p.key, { label: ev.target.value })}
                />
              </Field>
              <Field label="Amount" error={e.amount}>
                <Input
                  value={shown(p.amount)}
                  mono
                  prefix="$"
                  invalid={!!e.amount}
                  onChange={ev => setPayment(p.key, { amount: digits(ev.target.value) })}
                />
              </Field>
              <Field label="Expected" error={e.expectedDate}>
                <Input
                  type="date"
                  value={p.expectedDate}
                  invalid={!!e.expectedDate}
                  onChange={ev => setPayment(p.key, { expectedDate: ev.target.value })}
                />
              </Field>
              <Field label="Received" hint="Leave empty until it arrives.">
                <Input
                  type="date"
                  value={p.receivedDate}
                  onChange={ev => setPayment(p.key, { receivedDate: ev.target.value })}
                />
              </Field>
            </RowBlock>
          );
        })}
        <Footer
          add={
            <AddButton
              label="Add payment"
              onClick={() =>
                onPayments([
                  ...payments,
                  { key: newKey(), label: '', amount: '', expectedDate: '', receivedDate: '' },
                ])
              }
            />
          }
          note={
            payments.length === 0
              ? 'No payments yet. You can add them on the Award tab.'
              : `${money(scheduled)} of ${money(awarded)} awarded is scheduled; ${money(received)} has arrived.`
          }
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Eyebrow>Reports</Eyebrow>
        <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          Every report the funder asks for, the ones already sent included.
        </p>
        {reports.map((r, i) => {
          const e: { dueDate?: string } = showErrors ? rErrors[i] : {};
          return (
            <RowBlock
              key={r.key}
              removeLabel="Remove report"
              onRemove={() => onReports(reports.filter(x => x.key !== r.key))}
            >
              <Field label="Kind">
                <Select
                  value={r.kind}
                  onChange={ev => setReport(r.key, { kind: ev.target.value as Report['kind'] })}
                  options={[
                    { value: 'interim', label: 'Interim' },
                    { value: 'final', label: 'Final' },
                  ]}
                />
              </Field>
              <Field label="Due date" error={e.dueDate}>
                <Input
                  type="date"
                  value={r.dueDate}
                  invalid={!!e.dueDate}
                  onChange={ev => setReport(r.key, { dueDate: ev.target.value })}
                />
              </Field>
              <Field label="Status">
                <Select
                  value={r.status}
                  onChange={ev => setReport(r.key, { status: ev.target.value as ReportStatus })}
                  options={STATUS_OPTIONS}
                />
              </Field>
              {isSent(r.status) ? (
                <Field label="Submitted on" hint="Leave empty if you don’t know.">
                  <Input
                    type="date"
                    value={r.submittedDate}
                    onChange={ev => setReport(r.key, { submittedDate: ev.target.value })}
                  />
                </Field>
              ) : (
                <span className="ja-hide-sm" />
              )}
            </RowBlock>
          );
        })}
        <Footer
          add={
            <AddButton
              label="Add report"
              onClick={() =>
                onReports([
                  ...reports,
                  {
                    key: newKey(),
                    kind: reports.length === 0 ? 'interim' : 'final',
                    dueDate: '',
                    status: 'upcoming',
                    submittedDate: '',
                  },
                ])
              }
            />
          }
          note={
            reports.length === 0
              ? 'No reports yet. You can add them on the Reports tab.'
              : `${reports.filter(r => isSent(r.status)).length} of ${reports.length} sent.`
          }
        />
      </section>
    </div>
  );
}

function RowBlock({
  children,
  removeLabel,
  onRemove,
}: {
  children: React.ReactNode;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: 'var(--space-4)',
        border: 'var(--border-width) solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="ja-grid-2" style={{ flex: 1, minWidth: 0, alignItems: 'start' }}>
        {children}
      </div>
      <DeleteX label={removeLabel} onClick={onRemove} />
    </div>
  );
}

function Footer({ add, note }: { add: React.ReactNode; note: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      {add}
      <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>{note}</span>
    </div>
  );
}
