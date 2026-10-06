import React from 'react';
import { Button, Dialog, Field, Input, Textarea } from '../../../../design-system';
import { useStore } from '../../../../core';
import type { Grant, Phase, Transition, TransitionPayload } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { DialogFields, FieldRow } from './parts';

/** One dialog for every phase change: it collects exactly `transition.fields`. */

const WHAT_HAPPENS: Record<Phase, string> = {
  prospect: 'This moves the grant back to Prospect.',
  loi: 'This starts the letter of intent and moves the grant to LOI.',
  applying:
    'This starts the proposal and moves the grant to Applying, where the writing checklist lives.',
  submitted: 'This records the date you sent the application and moves the grant to Submitted.',
  awarded: 'This records the award amount and the grant period, and moves the grant to Awarded.',
  active:
    'This records that the agreement is signed and moves the grant to Active, where payments and spending are tracked.',
  reporting:
    'This moves the grant to Reporting while the report is written. It goes back to Active once the report is in.',
  closed: 'This closes the grant. Nothing is deleted. It stays here for history.',
  declined:
    "This records the funder's decision. The grant stays for history, so next year starts from what happened.",
  withdrawn: 'This records that we are not pursuing this grant. It stays for history.',
};

const DATE_LABEL: Partial<Record<Phase, string>> = {
  submitted: 'Date sent',
  awarded: 'Decided on',
  declined: 'Decided on',
  withdrawn: 'Date withdrawn',
};

const REASON_LABEL: Partial<Record<Phase, string>> = {
  declined: 'What the funder said',
  withdrawn: 'Why we are not pursuing it',
};

export function TransitionDialog({
  grant,
  transition,
  onClose,
}: {
  grant: Grant;
  transition: Transition;
  onClose: () => void;
}) {
  const { today, actions } = useStore();
  const toast = useToast();

  const has = (f: Transition['fields'][number]) => transition.fields.includes(f);
  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(String(grant.amountRequested ?? ''));
  const [periodStart, setPeriodStart] = React.useState(grant.dates.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = React.useState(grant.dates.periodEnd ?? '');
  const [reason, setReason] = React.useState('');

  const confirm = () => {
    const payload: TransitionPayload = {};
    if (has('date')) payload.date = date || today;
    if (has('amountAwarded') && amount.trim() !== '')
      payload.amountAwarded = Math.round(Number(amount));
    if (has('periodStart') && periodStart) payload.periodStart = periodStart;
    if (has('periodEnd') && periodEnd) payload.periodEnd = periodEnd;
    if (has('reason') && reason.trim()) payload.reason = reason.trim();
    actions.grants.transition(grant.id, transition.to, payload);
    toast({ tone: 'success', title: transition.label, message: grant.title });
    onClose();
  };

  return (
    <Dialog
      open
      title={transition.label}
      description={WHAT_HAPPENS[transition.to]}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm}>
            {transition.label}
          </Button>
        </>
      }
    >
      {transition.fields.length === 0 ? null : (
        <DialogFields>
          {has('date') && (
            <Field label={DATE_LABEL[transition.to] ?? 'Date'}>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
          )}
          {has('amountAwarded') && (
            <Field label="Amount awarded" hint="Whole dollars.">
              <Input
                type="number"
                mono
                prefix={<span style={{ font: 'var(--type-numeric)' }}>$</span>}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
          )}
          {(has('periodStart') || has('periodEnd')) && (
            <FieldRow>
              {has('periodStart') && (
                <Field label="Grant period starts">
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={e => setPeriodStart(e.target.value)}
                  />
                </Field>
              )}
              {has('periodEnd') && (
                <Field label="Grant period ends">
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={e => setPeriodEnd(e.target.value)}
                  />
                </Field>
              )}
            </FieldRow>
          )}
          {has('reason') && (
            <Field
              label={REASON_LABEL[transition.to] ?? 'Reason'}
              hint="Kept on the activity timeline."
            >
              <Textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="A sentence is enough."
              />
            </Field>
          )}
        </DialogFields>
      )}
    </Dialog>
  );
}
