import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../../app/ToastHost';
import { Eyebrow } from '../../../../app/components/badges';
import {
  Dialog, Button, Field, Input, Select, RadioGroup, Switch, Checkbox,
} from '../../../../design-system';
import { useStore, staffById, dateShort, plainNumber, toDate, toISO } from '../../../../core';
import { instantiateTemplate, DEFAULT_TEMPLATE_ID, PHASE_ORDER, PHASES, funderById } from '../../domain';
import type { ProgramId } from '../../../../core';
import type { ChecklistTemplate, ChecklistTemplateItem, FunderType, GrantDates, NewGrantInput, Phase, Restriction, Task } from '../../domain';
import './add-grant.css';

const NEW_FUNDER = '__new__';
const NO_CHECKLIST = '__none__';
const STEPS = ['Funder & program', 'Amount & dates', 'Checklist'];
const STEP_DESC = ['Funder and program', 'Amount and dates', 'Checklist'];
const SUGGESTED_LEAD_DAYS = 45;

const FUNDER_TYPES: Array<{ value: FunderType; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'government', label: 'Government' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'individual', label: 'Individual' },
  { value: 'other', label: 'Other' },
];

type DateKey = 'loiDue' | 'applicationDue' | 'decisionExpected' | 'periodStart' | 'periodEnd' | 'startBy';

export default function AddGrantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();

  const [step, setStep] = React.useState(0);
  const [showErrors, setShowErrors] = React.useState(false);

  const [funderId, setFunderId] = React.useState('');
  const [newFunderName, setNewFunderName] = React.useState('');
  const [newFunderType, setNewFunderType] = React.useState<FunderType>('foundation');
  const [newContactName, setNewContactName] = React.useState('');
  const [newContactEmail, setNewContactEmail] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [program, setProgram] = React.useState<ProgramId>(state.core.programs[0]?.id ?? 'general-operating');
  const [restriction, setRestriction] = React.useState<Restriction>('restricted');
  const [ownerId, setOwnerId] = React.useState(state.core.staff[0]?.id ?? '');
  const [started, setStarted] = React.useState(false);

  const [amount, setAmount] = React.useState('');
  const [loiRequired, setLoiRequired] = React.useState(false);
  const [dates, setDates] = React.useState<Record<DateKey, string>>({
    loiDue: '', applicationDue: '', decisionExpected: '', periodStart: '', periodEnd: '', startBy: '',
  });
  const [startByTouched, setStartByTouched] = React.useState(false);

  const [templateId, setTemplateId] = React.useState(
    state.grants.templates.some(t => t.id === DEFAULT_TEMPLATE_ID) ? DEFAULT_TEMPLATE_ID : (state.grants.templates[0]?.id ?? NO_CHECKLIST),
  );
  const [excluded, setExcluded] = React.useState<string[]>([]);

  const isNewFunder = funderId === NEW_FUNDER;
  const setDate = (k: DateKey, v: string) => setDates(d => ({ ...d, [k]: v }));

  // "Start working by" trails the application due date until the user sets it themselves.
  const suggestedStartBy = dates.applicationDue
    ? toISO(new Date(toDate(dates.applicationDue).getTime() - SUGGESTED_LEAD_DAYS * 86400000))
    : '';
  const startBy = startByTouched ? dates.startBy : suggestedStartBy;

  const funderName = isNewFunder ? newFunderName.trim() : funderById(state, funderId)?.name ?? '';
  const funderError = !funderId ? 'Pick a funder, or add a new one.' : undefined;
  const nameError = isNewFunder && !newFunderName.trim() ? 'Give the funder a name.' : undefined;
  const titleError = !title.trim() ? 'Give the grant a title.' : undefined;
  const step1Valid = !funderError && !nameError && !titleError;

  const grantDates: GrantDates = {
    startBy: startBy || undefined,
    loiDue: loiRequired && dates.loiDue ? dates.loiDue : undefined,
    applicationDue: dates.applicationDue || undefined,
    decisionExpected: dates.decisionExpected || undefined,
    periodStart: dates.periodStart || undefined,
    periodEnd: dates.periodEnd || undefined,
  };

  const template: ChecklistTemplate | undefined = state.grants.templates.find(t => t.id === templateId);
  const preview = React.useMemo(() => {
    if (!template) return [];
    // instantiateTemplate drops the source item id, so zip its output back onto the
    // items it keeps (same filter, same order) to know what each row belongs to.
    const items = template.items.filter(i => i.phase !== 'loi' || loiRequired);
    const tasks = instantiateTemplate(template, { id: 'draft', loiRequired, dates: grantDates, ownerId });
    return items.map((item, i) => ({ item, task: tasks[i] })).filter(r => r.task);
  }, [template, loiRequired, ownerId, JSON.stringify(grantDates)]);

  const grouped = PHASE_ORDER
    .map(phase => ({ phase, rows: preview.filter(r => r.item.phase === phase) }))
    .filter(g => g.rows.length > 0);

  function next() {
    if (step === 0 && !step1Valid) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep(s => s + 1);
  }

  function create() {
    const input: NewGrantInput = {
      funderId: isNewFunder ? undefined : funderId,
      newFunder: isNewFunder
        ? {
          name: newFunderName.trim(),
          type: newFunderType,
          contactName: newContactName.trim() || undefined,
          contactEmail: newContactEmail.trim() || undefined,
        }
        : undefined,
      title: title.trim(),
      program,
      restriction,
      ownerId,
      phase: started ? 'applying' : 'prospect',
      loiRequired,
      amountRequested: amount ? Number(amount) : undefined,
      dates: grantDates,
      templateId: templateId === NO_CHECKLIST ? null : templateId,
      excludeTemplateItemIds: excluded,
    };
    const id = actions.grants.addGrant(input);
    toast({ tone: 'success', title: 'Grant added', message: `${funderName} · ${title.trim()}` });
    onClose();
    nav(`/grants/${id}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={640}
      title="Add grant"
      description={`Step ${step + 1} of 3 · ${STEP_DESC[step]}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 2
            ? <Button variant="primary" onClick={next}>Next: {STEPS[step + 1]}</Button>
            : <Button variant="primary" onClick={create}>Create grant</Button>}
        </>
      }
    >
      <StepBars step={step} />
      {step === 0 && (
        <Grid>
          <Field label="Funder" required error={showErrors ? funderError : undefined} style={{ gridColumn: '1/-1' }}>
            <Select
              value={funderId}
              invalid={showErrors && !!funderError}
              onChange={e => setFunderId(e.target.value)}
              options={[
                { value: '', label: 'Pick a funder…' },
                ...state.grants.funders.map(f => ({ value: f.id, label: f.name })),
                { value: NEW_FUNDER, label: 'New funder…' },
              ]}
            />
          </Field>
          {isNewFunder && (
            <>
              <Field label="Funder name" required error={showErrors ? nameError : undefined}>
                <Input value={newFunderName} invalid={showErrors && !!nameError} placeholder="Ralph M. Parsons Foundation"
                  onChange={e => setNewFunderName(e.target.value)} />
              </Field>
              <Field label="Type">
                <Select value={newFunderType} options={FUNDER_TYPES} onChange={e => setNewFunderType(e.target.value as FunderType)} />
              </Field>
              <Field label="Contact name">
                <Input value={newContactName} placeholder="Who we talk to" onChange={e => setNewContactName(e.target.value)} />
              </Field>
              <Field label="Contact email">
                <Input type="email" value={newContactEmail} placeholder="name@funder.org" onChange={e => setNewContactEmail(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Grant title" required error={showErrors ? titleError : undefined} style={{ gridColumn: '1/-1' }}>
            <Input value={title} invalid={showErrors && !!titleError} placeholder="Jazz Legacy Program"
              onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Program">
            <Select value={program} onChange={e => setProgram(e.target.value as ProgramId)}
              options={state.core.programs.map(p => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Owner">
            <Select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              options={state.core.staff.map(s => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="Restriction" style={{ gridColumn: '1/-1' }}>
            <RadioGroup
              value={restriction}
              direction="row"
              onChange={v => setRestriction(v as Restriction)}
              options={[{ value: 'restricted', label: 'Restricted' }, { value: 'unrestricted', label: 'Unrestricted' }]}
            />
          </Field>
          <SwitchRow label="We've already started working on this" checked={started} onChange={setStarted} />
        </Grid>
      )}

      {step === 1 && (
        <Grid>
          <div style={{
            gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: '0 0 var(--space-4)', borderBottom: 'var(--border-width) solid var(--border-subtle)',
            marginBottom: 'var(--space-1)',
          }}>
            <span style={{
              flex: 1, minWidth: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {[funderName || 'New funder', title.trim(), `Owner ${staffById(state, ownerId)?.name ?? '—'}`]
                .filter(Boolean).join(' · ')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setStep(0)}>Edit</Button>
          </div>
          <Field label="Amount requested" hint="Whole dollars.">
            <Input value={amount ? plainNumber(Number(amount)) : ''} mono prefix="$" placeholder="30,000"
              onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <span className="ja-hide-sm" />
          <SwitchRow label="Funder requires a letter of intent" checked={loiRequired} onChange={setLoiRequired} />
          {loiRequired && (
            <Field label="LOI due">
              <Input type="date" value={dates.loiDue} onChange={e => setDate('loiDue', e.target.value)} />
            </Field>
          )}
          <Field label="Application due">
            <Input type="date" value={dates.applicationDue} onChange={e => setDate('applicationDue', e.target.value)} />
          </Field>
          <Field label="Expected decision">
            <Input type="date" value={dates.decisionExpected} onChange={e => setDate('decisionExpected', e.target.value)} />
          </Field>
          <Field label="Grant period start">
            <Input type="date" value={dates.periodStart} onChange={e => setDate('periodStart', e.target.value)} />
          </Field>
          <Field label="Grant period end">
            <Input type="date" value={dates.periodEnd} onChange={e => setDate('periodEnd', e.target.value)} />
          </Field>
          <Field label="Start working by" hint="We suggest 45 days before the application is due." style={{ gridColumn: '1/-1' }}>
            <Input type="date" value={startBy}
              onChange={e => { setStartByTouched(true); setDate('startBy', e.target.value); }} />
          </Field>
        </Grid>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Field label="Checklist template" hint="Every task is created with a due date worked back from the dates you entered.">
            <Select
              value={templateId}
              onChange={e => { setTemplateId(e.target.value); setExcluded([]); }}
              options={[
                ...state.grants.templates.map(t => ({ value: t.id, label: t.name })),
                { value: NO_CHECKLIST, label: 'No checklist' },
              ]}
            />
          </Field>
          {grouped.length === 0
            ? (
              <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: 0 }}>
                No tasks will be created. You can add them by hand on the grant.
              </p>
            )
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: 320, overflow: 'auto', paddingRight: 'var(--space-3)' }}>
                {grouped.map(g => (
                  <div key={g.phase} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <Eyebrow>{PHASES[g.phase as Phase].label}</Eyebrow>
                    {g.rows.map(r => (
                      <TaskRow
                        key={r.item.id}
                        item={r.item}
                        task={r.task}
                        checked={!excluded.includes(r.item.id)}
                        onChange={on => setExcluded(xs => (on ? xs.filter(x => x !== r.item.id) : [...xs, r.item.id]))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </Dialog>
  );
}

function StepBars({ step }: { step: number }) {
  return (
    <div className="ja-grant-steps">
      {STEPS.map((name, i) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{
            height: 4, borderRadius: 'var(--radius-pill)',
            background: i < step ? 'var(--teal-500)' : i === step ? 'var(--blue-500)' : 'var(--neutral-100)',
          }} />
          <span style={{
            font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)',
            fontWeight: i === step ? ('var(--weight-semibold)' as any) : undefined,
            color: i === step ? 'var(--text-strong)' : i < step ? 'var(--text-body)' : 'var(--text-faint)',
          }}>{name}</span>
        </div>
      ))}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="ja-grid-2" style={{ alignItems: 'start' }}>
      {children}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-1) 0' }}>
      <Switch checked={checked} onChange={onChange} />
      <span style={{ font: 'var(--type-label)', color: 'var(--text-strong)' }}>{label}</span>
    </div>
  );
}

function TaskRow({ item, task, checked, onChange }: {
  item: ChecklistTemplateItem; task: Omit<Task, 'id'>; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '7px 0',
      borderBottom: 'var(--border-width) solid var(--border-subtle)',
    }}>
      <Checkbox checked={checked} onChange={onChange} />
      <span style={{
        flex: 1, minWidth: 0, font: 'var(--type-body-sm)',
        color: checked ? 'var(--text-body)' : 'var(--text-faint)',
      }}>{item.title}</span>
      <span style={{ font: 'var(--type-numeric)', color: 'var(--text-muted)' }}>
        {task.dueDate ? dateShort(task.dueDate) : '—'}
      </span>
    </div>
  );
}
