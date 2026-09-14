import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Dialog, Field, Input, Select, Textarea } from '../../../design-system';
import {
  dateLong, dateRange, funderById, isPostAward, money, programName, staffById, useStore,
} from '../../../domain';
import type { Grant, GrantDates, ProgramId, Restriction } from '../../../domain';
import { KV } from '../../components/badges';
import { useToast } from '../../ToastHost';
import { DialogFields, FieldRow } from './parts';

/** The right-hand column of grant detail: key dates, the funder, the terms. */

const CARD_BODY = '4px var(--space-6) var(--space-4)';
const MONO: React.CSSProperties = { font: 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)' };

const FUNDER_TYPE: Record<string, string> = {
  foundation: 'Foundation', government: 'Government', corporate: 'Corporate', individual: 'Individual', other: 'Other',
};

function EditAction({ onClick }: { onClick: () => void }) {
  return <Button variant="ghost" size="sm" onClick={onClick}>Edit</Button>;
}

export function SideCards({ grant }: { grant: Grant }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <KeyDatesCard grant={grant} />
      <FunderCard grant={grant} />
      <DetailsCard grant={grant} />
    </div>
  );
}

function KeyDatesCard({ grant }: { grant: Grant }) {
  const { state } = useStore();
  const [editing, setEditing] = React.useState(false);
  const d = grant.dates;
  const reports = !isPostAward(grant.phase) ? [] : state.reports
    .filter(r => r.grantId === grant.id)
    .slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const rows: Array<[string, string]> = [];
  if (d.startBy) rows.push(['Start working by', dateLong(d.startBy)]);
  if (d.loiDue) rows.push(['LOI due', dateLong(d.loiDue)]);
  if (d.applicationDue) rows.push(['Application due', dateLong(d.applicationDue)]);
  if (d.submitted) rows.push(['Submitted', dateLong(d.submitted)]);
  if (d.decisionExpected) rows.push(['Decision expected', dateLong(d.decisionExpected)]);
  if (d.decided) rows.push(['Decided', dateLong(d.decided)]);
  if (d.periodStart || d.periodEnd) rows.push(['Grant period', dateRange(d.periodStart, d.periodEnd)]);
  for (const r of reports) {
    rows.push([`${r.kind === 'final' ? 'Final' : 'Interim'} report due`, dateLong(r.dueDate)]);
  }

  return (
    <Card title="Key dates" padding={CARD_BODY} action={<EditAction onClick={() => setEditing(true)} />}>
      {rows.length === 0
        ? <p style={{ margin: '6px 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            No dates yet. Add them so they show up on the deadlines list.
          </p>
        : rows.map(([label, value]) => (
          <KV key={label} k={<span style={{ fontSize: 'var(--text-xs)' }}>{label}</span>} v={<span style={MONO}>{value}</span>} />
        ))}
      {editing && <KeyDatesDialog grant={grant} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function KeyDatesDialog({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const { actions } = useStore();
  const toast = useToast();
  const [dates, setDates] = React.useState<GrantDates>({ ...grant.dates });
  const set = (key: keyof GrantDates) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDates(prev => ({ ...prev, [key]: e.target.value || undefined }));

  return (
    <Dialog open title="Key dates" description="The dates that drive the deadlines list." onClose={onClose} width={520}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => {
          actions.updateGrant(grant.id, { dates });
          toast({ tone: 'success', title: 'Key dates saved', message: grant.title });
          onClose();
        }}>Save dates</Button>
      </>}>
      <DialogFields>
        <FieldRow>
          <Field label="Start working by"><Input type="date" value={dates.startBy ?? ''} onChange={set('startBy')} /></Field>
          <Field label="LOI due"><Input type="date" value={dates.loiDue ?? ''} onChange={set('loiDue')} /></Field>
        </FieldRow>
        <FieldRow>
          <Field label="Application due"><Input type="date" value={dates.applicationDue ?? ''} onChange={set('applicationDue')} /></Field>
          <Field label="Submitted"><Input type="date" value={dates.submitted ?? ''} onChange={set('submitted')} /></Field>
        </FieldRow>
        <FieldRow>
          <Field label="Decision expected"><Input type="date" value={dates.decisionExpected ?? ''} onChange={set('decisionExpected')} /></Field>
          <Field label="Decided"><Input type="date" value={dates.decided ?? ''} onChange={set('decided')} /></Field>
        </FieldRow>
        <FieldRow>
          <Field label="Grant period starts"><Input type="date" value={dates.periodStart ?? ''} onChange={set('periodStart')} /></Field>
          <Field label="Grant period ends"><Input type="date" value={dates.periodEnd ?? ''} onChange={set('periodEnd')} /></Field>
        </FieldRow>
      </DialogFields>
    </Dialog>
  );
}

function FunderCard({ grant }: { grant: Grant }) {
  const { state } = useStore();
  const funder = funderById(state, grant.funderId);
  if (!funder) return null;
  const contact = [funder.contactName, funder.contactEmail].filter(Boolean).join(' · ');

  return (
    <Card title="Funder" padding={CARD_BODY}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
        <div style={{ font: 'var(--weight-semibold) var(--text-base)/1.35 var(--font-sans)', fontSize: 15, color: 'var(--text-strong)' }}>{funder.name}</div>
        <div><Badge tone="neutral">{FUNDER_TYPE[funder.type] ?? funder.type}</Badge></div>
        {contact && <div style={{ font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--text-body)' }}>{contact}</div>}
        {funder.cycleNotes && <div style={{ font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--text-muted)' }}>{funder.cycleNotes}</div>}
        <div>
          <FunderLink funderId={funder.id} />
        </div>
      </div>
    </Card>
  );
}

function FunderLink({ funderId }: { funderId: string }) {
  const nav = useNavigate();
  return (
    <a href={`/funders/${funderId}`} onClick={e => { e.preventDefault(); nav(`/funders/${funderId}`); }}
      style={{ font: 'var(--weight-medium) var(--text-xs)/1.5 var(--font-sans)' }}>View funder</a>
  );
}

function DetailsCard({ grant }: { grant: Grant }) {
  const { state } = useStore();
  const [editing, setEditing] = React.useState(false);
  const owner = staffById(state, grant.ownerId);

  return (
    <Card title="Details" padding={CARD_BODY} action={<EditAction onClick={() => setEditing(true)} />}>
      <KV k={<span style={{ fontSize: 'var(--text-xs)' }}>Requested</span>} v={<span style={MONO}>{grant.amountRequested ? money(grant.amountRequested) : '—'}</span>} />
      {grant.amountAwarded !== undefined && (
        <KV k={<span style={{ fontSize: 'var(--text-xs)' }}>Awarded</span>} v={<span style={MONO}>{money(grant.amountAwarded)}</span>} />
      )}
      <KV k={<span style={{ fontSize: 'var(--text-xs)' }}>Restriction</span>} v={<span style={{ fontSize: 'var(--text-xs)' }}>{grant.restriction === 'restricted' ? 'Restricted' : 'Unrestricted'}</span>} />
      <KV k={<span style={{ fontSize: 'var(--text-xs)' }}>Program</span>} v={<span style={{ fontSize: 'var(--text-xs)' }}>{programName(state, grant.program)}</span>} />
      <KV k={<span style={{ fontSize: 'var(--text-xs)' }}>Owner</span>} v={<span style={{ fontSize: 'var(--text-xs)' }}>{owner?.name ?? '—'}</span>} />
      {grant.notes && (
        <p style={{
          margin: 'var(--space-3) 0 0', paddingTop: 'var(--space-3)',
          borderTop: 'var(--border-width) solid var(--border-subtle)',
          font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--neutral-600)',
        }}>{grant.notes}</p>
      )}
      {editing && <DetailsDialog grant={grant} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function DetailsDialog({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [title, setTitle] = React.useState(grant.title);
  const [program, setProgram] = React.useState<ProgramId>(grant.program);
  const [restriction, setRestriction] = React.useState<Restriction>(grant.restriction);
  const [ownerId, setOwnerId] = React.useState(grant.ownerId);
  const [amount, setAmount] = React.useState(grant.amountRequested !== undefined ? String(grant.amountRequested) : '');
  const [notes, setNotes] = React.useState(grant.notes ?? '');

  return (
    <Dialog open title="Grant details" description="The terms of this grant as we have them." onClose={onClose} width={520}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!title.trim()} onClick={() => {
          actions.updateGrant(grant.id, {
            title: title.trim(),
            program,
            restriction,
            ownerId,
            amountRequested: amount.trim() === '' ? undefined : Math.round(Number(amount)),
            notes: notes.trim() || undefined,
          });
          toast({ tone: 'success', title: 'Details saved', message: title.trim() });
          onClose();
        }}>Save details</Button>
      </>}>
      <DialogFields>
        <Field label="Grant title" required>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </Field>
        <FieldRow>
          <Field label="Program">
            <Select value={program} onChange={e => setProgram(e.target.value as ProgramId)}
              options={state.programs.map(p => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Restriction">
            <Select value={restriction} onChange={e => setRestriction(e.target.value as Restriction)}
              options={[{ value: 'restricted', label: 'Restricted' }, { value: 'unrestricted', label: 'Unrestricted' }]} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Owner">
            <Select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              options={state.staff.map(s => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="Amount requested">
            <Input type="number" mono prefix={<span style={{ font: 'var(--type-numeric)' }}>$</span>}
              value={amount} onChange={e => setAmount(e.target.value)} />
          </Field>
        </FieldRow>
        <Field label="Notes">
          <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="What the funder cares about, what to say next time." />
        </Field>
      </DialogFields>
    </Dialog>
  );
}
