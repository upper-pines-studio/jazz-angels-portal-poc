import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { activeOnly, money, plainNumber, useStore } from '../../../../core';
import type { ProgramId } from '../../../../core';
import {
  funderById,
  renewalDraft,
  renewalRefusal,
  renewalTemplateId,
  suggestedStartBy,
} from '../../domain';
import type { Grant, GrantDates } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { ProgramPicker } from './ProgramPicker';

/**
 * "Start next year's" (#67): next year's grant from this one, prefilled and
 * editable. Everything not asked here is copied by `renewGrant`.
 */

type DateKey = 'loiDue' | 'applicationDue' | 'decisionExpected' | 'periodStart' | 'periodEnd';

export function RenewDialog({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const funder = funderById(state, grant.funderId);
  // Only an archived funder can stop it here: the button is not offered otherwise.
  const refusal = renewalRefusal(state, grant.id);

  const [draft] = React.useState(() => renewalDraft(state, grant));
  const [title, setTitle] = React.useState(draft.title);
  const [amount, setAmount] = React.useState(
    draft.amountRequested === undefined ? '' : String(draft.amountRequested),
  );
  const [ownerId, setOwnerId] = React.useState(draft.ownerId);
  const [programs, setPrograms] = React.useState<ProgramId[]>(draft.programs);
  const [dates, setDates] = React.useState<Record<DateKey, string>>({
    loiDue: draft.dates.loiDue ?? '',
    applicationDue: draft.dates.applicationDue ?? '',
    decisionExpected: draft.dates.decisionExpected ?? '',
    periodStart: draft.dates.periodStart ?? '',
    periodEnd: draft.dates.periodEnd ?? '',
  });
  const [startByTouched, setStartByTouched] = React.useState(false);
  const [startByOwn, setStartByOwn] = React.useState('');
  const [showErrors, setShowErrors] = React.useState(false);

  const setDate = (k: DateKey, v: string) => setDates(d => ({ ...d, [k]: v }));
  // "Start working by" trails the application due date until it is set by hand, as in Add grant.
  const startBy = startByTouched ? startByOwn : (suggestedStartBy(dates.applicationDue) ?? '');

  const template = state.grants.templates.find(
    t => t.id === renewalTemplateId(state.grants.templates),
  );
  const lines = state.grants.budgetLines.filter(l => l.grantId === grant.id).length;
  const owners = activeOnly(state.core.staff);

  const titleError = !title.trim() ? "Give next year's grant a title." : undefined;
  const programsError = programs.length === 0 ? 'Choose at least one program.' : undefined;
  const ownerError = !ownerId ? "Pick who owns next year's grant." : undefined;

  function start() {
    if (titleError || programsError || ownerError) {
      setShowErrors(true);
      return;
    }
    const grantDates: GrantDates = {};
    for (const key of Object.keys(dates) as DateKey[]) {
      if (dates[key] && (key !== 'loiDue' || grant.loiRequired)) grantDates[key] = dates[key];
    }
    if (startBy) grantDates.startBy = startBy;
    const id = actions.grants.renewGrant({
      grantId: grant.id,
      title: title.trim(),
      amountRequested: amount ? Number(amount) : undefined,
      dates: grantDates,
      ownerId,
      programs,
    });
    // The store refuses with a toast of its own.
    if (!id) return;
    toast({
      tone: 'success',
      title: "Next year's grant started",
      message: `${funder?.name ?? 'Funder'} · ${title.trim()}`,
    });
    onClose();
    nav(`/grants/${id}`);
  }

  if (refusal) {
    return (
      <Dialog
        open
        title="Start next year's grant"
        onClose={onClose}
        width={520}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-body)' }}>{refusal}</p>
      </Dialog>
    );
  }

  const carried = [
    template ? `the ${template.name} checklist` : 'no checklist',
    lines === 0
      ? 'no budget lines'
      : `this year's ${lines} budget ${lines === 1 ? 'line' : 'lines'}`,
  ].join(' and ');

  return (
    <Dialog
      open
      title="Start next year's grant"
      description={`It starts at Prospect with ${carried}, and is linked to ${grant.title}. Check the title, amount and dates.`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start}>
            Start next year's grant
          </Button>
        </>
      }
    >
      <div
        style={{
          maxHeight: 'min(60vh, 560px)',
          overflow: 'auto',
          // Room for the focus ring, and for the scrollbar on the right.
          margin: -3,
          padding: '3px var(--space-3) 3px 3px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {(draft.archivedOwner || draft.archivedPrograms.length > 0) && (
          <Notice>
            {[
              draft.archivedOwner &&
                `${draft.archivedOwner} is archived, so pick who owns next year's grant.`,
              draft.archivedPrograms.length > 0 &&
                `${listOf(draft.archivedPrograms)} ${draft.archivedPrograms.length === 1 ? 'is' : 'are'} archived and left off. Choose the programs next year's grant is for.`,
            ]
              .filter(Boolean)
              .join(' ')}
          </Notice>
        )}
        <Field label="Grant title" required error={showErrors ? titleError : undefined}>
          <Input
            value={title}
            invalid={showErrors && !!titleError}
            onChange={e => setTitle(e.target.value)}
          />
        </Field>
        <div className="ja-grid-2" style={{ alignItems: 'start' }}>
          <Field
            label="Amount to request"
            hint={
              grant.amountAwarded !== undefined
                ? `This year's award was ${money(grant.amountAwarded)}.`
                : grant.amountRequested !== undefined
                  ? `This year's request was ${money(grant.amountRequested)}.`
                  : 'Whole dollars.'
            }
          >
            <Input
              value={amount ? plainNumber(Number(amount)) : ''}
              mono
              prefix="$"
              onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="Owner" required error={showErrors ? ownerError : undefined}>
            <Select
              value={ownerId}
              invalid={showErrors && !!ownerError}
              onChange={e => setOwnerId(e.target.value)}
              options={[
                ...(ownerId ? [] : [{ value: '', label: 'Pick an owner…' }]),
                ...owners.map(s => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
        </div>
        <ProgramPicker
          value={programs}
          onChange={setPrograms}
          error={showErrors ? programsError : undefined}
        />
        <div className="ja-grid-2" style={{ alignItems: 'start' }}>
          {grant.loiRequired && (
            <DateField label="LOI due" value={dates.loiDue} onChange={v => setDate('loiDue', v)} />
          )}
          <DateField
            label="Application due"
            value={dates.applicationDue}
            onChange={v => setDate('applicationDue', v)}
          />
          <DateField
            label="Expected decision"
            value={dates.decisionExpected}
            onChange={v => setDate('decisionExpected', v)}
          />
          {grant.loiRequired && <span className="ja-hide-sm" />}
          <DateField
            label="Grant period start"
            value={dates.periodStart}
            onChange={v => setDate('periodStart', v)}
          />
          <DateField
            label="Grant period end"
            value={dates.periodEnd}
            onChange={v => setDate('periodEnd', v)}
          />
        </div>
        <Field label="Start working by" hint="We suggest 45 days before the application is due.">
          <Input
            type="date"
            value={startBy}
            onChange={e => {
              setStartByTouched(true);
              setStartByOwn(e.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Input type="date" value={value} onChange={e => onChange(e.target.value)} />
    </Field>
  );
}

/** What must be picked again before saving: gold, the attention colour. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      style={{
        margin: 0,
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--gold-50)',
        borderLeft: '3px solid var(--gold-400)',
        borderRadius: 'var(--radius-sm)',
        font: 'var(--type-body-sm)',
        color: 'var(--text-body)',
      }}
    >
      {children}
    </p>
  );
}

function listOf(names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
