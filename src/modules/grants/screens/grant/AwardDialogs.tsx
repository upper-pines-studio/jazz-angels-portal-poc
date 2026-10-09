import React from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '../../../../design-system';
import { dateLong, money, pickable, staffById, useStore } from '../../../../core';
import type { ProgramId } from '../../../../core';
import { programNames } from '../../domain';
import type { AwardTerm, Grant, Payment, Restriction } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { DialogFields, FieldRow } from './parts';
import { ProgramPicker } from './ProgramPicker';
import { LetterPageField, pageFrom } from './awardShared';

/** The dialogs behind the Award tab: the award record, one installment, one term. */

const DOLLAR = <span style={{ font: 'var(--type-numeric)' }}>$</span>;
const RESTRICTION_LABEL: Record<Restriction, string> = {
  restricted: 'Restricted',
  unrestricted: 'Unrestricted',
};

/** "" → undefined, "50000.4" → 50000. */
function dollarsFrom(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** What was awarded, for how long, and who looks after it. Saves to the grant and notes the change. */
export function EditRecordDialog({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [amount, setAmount] = React.useState(
    grant.amountAwarded !== undefined ? String(grant.amountAwarded) : '',
  );
  const [periodStart, setPeriodStart] = React.useState(grant.dates.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = React.useState(grant.dates.periodEnd ?? '');
  const [decided, setDecided] = React.useState(grant.dates.decided ?? '');
  const [restriction, setRestriction] = React.useState<Restriction>(grant.restriction);
  const [programs, setPrograms] = React.useState<ProgramId[]>(grant.programs);
  const [ownerId, setOwnerId] = React.useState(grant.ownerId);

  const badAmount = amount.trim() !== '' && dollarsFrom(amount) === undefined;
  const badPeriod = !!periodStart && !!periodEnd && periodEnd < periodStart;

  const save = () => {
    const amountAwarded = dollarsFrom(amount);
    const changes: string[] = [];
    if (amountAwarded !== grant.amountAwarded)
      changes.push(
        `amount ${grant.amountAwarded === undefined ? 'not set' : money(grant.amountAwarded)} to ${amountAwarded === undefined ? 'not set' : money(amountAwarded)}`,
      );
    if (
      (periodStart || undefined) !== grant.dates.periodStart ||
      (periodEnd || undefined) !== grant.dates.periodEnd
    ) {
      changes.push(
        `period to ${periodStart ? dateLong(periodStart) : 'no start'} through ${periodEnd ? dateLong(periodEnd) : 'no end'}`,
      );
    }
    if ((decided || undefined) !== grant.dates.decided)
      changes.push(`date awarded to ${decided ? dateLong(decided) : 'not set'}`);
    if (restriction !== grant.restriction)
      changes.push(`restriction to ${RESTRICTION_LABEL[restriction].toLowerCase()}`);
    if (programs.join() !== grant.programs.join())
      changes.push(`programs to ${programNames(state, { programs })}`);
    if (ownerId !== grant.ownerId)
      changes.push(`owner to ${staffById(state, ownerId)?.name ?? 'someone else'}`);

    if (changes.length === 0) {
      onClose();
      return;
    }
    actions.grants.updateGrant(grant.id, {
      amountAwarded,
      restriction,
      programs,
      ownerId,
      dates: {
        ...grant.dates,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        decided: decided || undefined,
      },
    });
    const sentence = changes.join('; ');
    actions.grants.addNote(grant.id, `Award record edited: ${sentence}.`);
    toast({
      tone: 'success',
      title: 'Award record saved',
      message: sentence.charAt(0).toUpperCase() + sentence.slice(1),
    });
    onClose();
  };

  return (
    <Dialog
      open
      title="Edit award record"
      description="What the funder awarded, as the award letter states it. The change is noted in the activity timeline."
      onClose={onClose}
      width={540}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={badAmount || badPeriod || programs.length === 0}
            onClick={save}
          >
            Save record
          </Button>
        </>
      }
    >
      <DialogFields>
        <FieldRow>
          <Field
            label="Amount awarded"
            error={badAmount ? 'Enter a whole dollar amount.' : undefined}
          >
            <Input
              type="number"
              mono
              prefix={DOLLAR}
              value={amount}
              invalid={badAmount}
              onChange={e => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date awarded">
            <Input type="date" value={decided} onChange={e => setDecided(e.target.value)} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Grant period starts">
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          </Field>
          <Field
            label="Grant period ends"
            error={badPeriod ? 'The period has to end after it starts.' : undefined}
          >
            <Input
              type="date"
              value={periodEnd}
              invalid={badPeriod}
              onChange={e => setPeriodEnd(e.target.value)}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Restriction">
            <Select
              value={restriction}
              onChange={e => setRestriction(e.target.value as Restriction)}
              options={[
                { value: 'restricted', label: 'Restricted' },
                { value: 'unrestricted', label: 'Unrestricted' },
              ]}
            />
          </Field>
        </FieldRow>
        <ProgramPicker value={programs} onChange={setPrograms} keep={grant.programs} />
        <Field label="Owner">
          <Select
            value={ownerId}
            onChange={e => setOwnerId(e.target.value)}
            options={pickable(state.core.staff, grant.ownerId).map(s => ({
              value: s.id,
              label: s.name,
            }))}
          />
        </Field>
      </DialogFields>
    </Dialog>
  );
}

export interface PaymentValues {
  label: string;
  expectedDate: string;
  amount: number;
  sourcePage?: number;
  receivedDate?: string;
}

/** One installment: add a new one, or edit what we have. */
export function PaymentDialog({
  payment,
  letterPages,
  onClose,
  onSave,
  onDelete,
}: {
  payment?: Payment;
  letterPages?: number;
  onClose: () => void;
  onSave: (v: PaymentValues) => void;
  onDelete?: () => void;
}) {
  const { today } = useStore();
  const [label, setLabel] = React.useState(payment?.label ?? '');
  const [expectedDate, setExpectedDate] = React.useState(payment?.expectedDate ?? today);
  const [amount, setAmount] = React.useState(payment ? String(payment.amount) : '');
  const [page, setPage] = React.useState(payment?.sourcePage ? String(payment.sourcePage) : '');
  const [receivedDate, setReceivedDate] = React.useState(payment?.receivedDate ?? '');
  const dollars = dollarsFrom(amount);
  const ok = !!label.trim() && !!expectedDate && dollars !== undefined && dollars > 0;

  return (
    <Dialog
      open
      title={payment ? 'Edit payment' : 'Add payment'}
      description={
        payment
          ? 'An installment the funder has promised.'
          : 'An installment the funder has promised, and the page of the award letter that says so.'
      }
      onClose={onClose}
      width={500}
      footer={
        <>
          {/* A payment that has arrived is money on the record, so it is not deleted (decision 0002). */}
          {payment && onDelete && !payment.receivedDate && (
            <Button
              variant="secondary"
              style={{ marginRight: 'auto', color: 'var(--danger-500)' }}
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() =>
              dollars !== undefined &&
              onSave({
                label: label.trim(),
                expectedDate,
                amount: dollars,
                sourcePage: pageFrom(page),
                receivedDate: receivedDate || undefined,
              })
            }
          >
            {payment ? 'Save payment' : 'Add payment'}
          </Button>
        </>
      }
    >
      <DialogFields>
        <Field label="Installment" required>
          <Input
            value={label}
            placeholder="Second installment"
            onChange={e => setLabel(e.target.value)}
          />
        </Field>
        <FieldRow>
          <Field label="Expected" required>
            <Input
              type="date"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
            />
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              mono
              prefix={DOLLAR}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Award letter page" hint="Where the letter promises it.">
            <LetterPageField value={page} onChange={setPage} pages={letterPages} />
          </Field>
          <Field label="Received" hint="Leave empty until it arrives.">
            <Input
              type="date"
              value={receivedDate}
              onChange={e => setReceivedDate(e.target.value)}
            />
          </Field>
        </FieldRow>
      </DialogFields>
    </Dialog>
  );
}

/** One term of the award, as the letter words it. */
export function TermDialog({
  term,
  letterPages,
  onClose,
  onSave,
}: {
  term?: AwardTerm;
  letterPages?: number;
  onClose: () => void;
  onSave: (v: { label: string; text: string; page?: number }) => void;
}) {
  const [label, setLabel] = React.useState(term?.label ?? '');
  const [text, setText] = React.useState(term?.text ?? '');
  const [page, setPage] = React.useState(term?.page ? String(term.page) : '');

  return (
    <Dialog
      open
      title={term ? 'Edit term' : 'Add term'}
      description="Copy the wording from the award letter, and note the page it is on."
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!label.trim() || !text.trim()}
            onClick={() => onSave({ label: label.trim(), text: text.trim(), page: pageFrom(page) })}
          >
            {term ? 'Save term' : 'Add term'}
          </Button>
        </>
      }
    >
      <DialogFields>
        <Field label="Term" required>
          <Input
            value={label}
            placeholder="Capital purchases"
            onChange={e => setLabel(e.target.value)}
          />
        </Field>
        <Field label="As written" required>
          <Textarea
            rows={3}
            value={text}
            placeholder="No single equipment purchase over $5,000 without written approval."
            onChange={e => setText(e.target.value)}
          />
        </Field>
        <Field label="Award letter page">
          <LetterPageField value={page} onChange={setPage} pages={letterPages} />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
