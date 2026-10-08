import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../../app/ToastHost';
import { Eyebrow } from '../../../../app/components/badges';
import {
  Dialog,
  Button,
  Field,
  Input,
  Select,
  RadioGroup,
  Switch,
  Checkbox,
} from '../../../../design-system';
import {
  activeOnly,
  can,
  useStore,
  staffById,
  dateShort,
  plainNumber,
  toDate,
  toISO,
} from '../../../../core';
import {
  templatePlan,
  DEFAULT_TEMPLATE_ID,
  IN_FLIGHT_PHASES,
  PHASE_ORDER,
  PHASES,
  funderById,
  phaseLabel,
} from '../../domain';
import type { ProgramId } from '../../../../core';
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
  FunderType,
  GrantDates,
  InFlightPhase,
  NewGrantInput,
  Phase,
  Restriction,
  Task,
} from '../../domain';
import {
  AwardStep,
  BudgetStep,
  EMPTY_AWARD,
  PaymentsReportsStep,
  awardErrors,
  budgetValid,
  inFlightFrom,
  paymentsReportsValid,
} from './InFlightSteps';
import type { AwardDraft, LineDraft, PaymentDraft, ReportDraft } from './InFlightSteps';
import './add-grant.css';

const NEW_FUNDER = '__new__';
const NO_CHECKLIST = '__none__';
const STEPS = ['Funder & program', 'Amount & dates', 'Checklist'];
const STEP_DESC = ['Funder and program', 'Amount and dates', 'Checklist'];
/** A grant already under way (decision 0004) takes five steps. */
const IN_FLIGHT_STEPS = [
  'Funder & program',
  'Award & dates',
  'Budget',
  'Payments & reports',
  'Checklist',
];
const IN_FLIGHT_DESC = [
  'Funder and program',
  'Award and dates',
  'Budget',
  'Payments and reports',
  'Checklist',
];
const SUGGESTED_LEAD_DAYS = 45;

/** What each starting phase means, under the choice in step 1. */
const IN_FLIGHT_HINT: Record<InFlightPhase, string> = {
  awarded: 'The award letter is in; the agreement is not signed yet.',
  active: 'The agreement is signed and the money is being spent.',
  reporting: 'A report to the funder is due or being written.',
};

const FUNDER_TYPES: Array<{ value: FunderType; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'government', label: 'Government' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'individual', label: 'Individual' },
  { value: 'other', label: 'Other' },
];

type DateKey =
  'loiDue' | 'applicationDue' | 'decisionExpected' | 'periodStart' | 'periodEnd' | 'startBy';

export default function AddGrantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions, user, today } = useStore();
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
  const [program, setProgram] = React.useState<ProgramId>(
    state.core.programs[0]?.id ?? 'general-operating',
  );
  const [restriction, setRestriction] = React.useState<Restriction>('restricted');
  const [ownerId, setOwnerId] = React.useState(activeOnly(state.core.staff)[0]?.id ?? '');
  const [started, setStarted] = React.useState(false);

  // "This grant is already under way": only a role that may record an award is offered it.
  const mayBringIn = can(user.role, 'award', 'edit');
  const [underWay, setUnderWay] = React.useState(false);
  const inFlight = mayBringIn && underWay;
  const [startPhase, setStartPhase] = React.useState<InFlightPhase>('active');
  const [award, setAward] = React.useState<AwardDraft>(EMPTY_AWARD);
  const keys = React.useRef(0);
  const newKey = () => (keys.current += 1);
  const [lines, setLines] = React.useState<LineDraft[]>(() => [
    { key: newKey(), category: '', planned: '' },
  ]);
  const [payments, setPayments] = React.useState<PaymentDraft[]>([]);
  const [reports, setReports] = React.useState<ReportDraft[]>([]);
  const steps = inFlight ? IN_FLIGHT_STEPS : STEPS;
  const stepDesc = inFlight ? IN_FLIGHT_DESC : STEP_DESC;
  const lastStep = steps.length - 1;

  const [amount, setAmount] = React.useState('');
  const [loiRequired, setLoiRequired] = React.useState(false);
  const [dates, setDates] = React.useState<Record<DateKey, string>>({
    loiDue: '',
    applicationDue: '',
    decisionExpected: '',
    periodStart: '',
    periodEnd: '',
    startBy: '',
  });
  const [startByTouched, setStartByTouched] = React.useState(false);

  const [templateId, setTemplateId] = React.useState(
    state.grants.templates.some(t => t.id === DEFAULT_TEMPLATE_ID)
      ? DEFAULT_TEMPLATE_ID
      : (state.grants.templates[0]?.id ?? NO_CHECKLIST),
  );
  const [excluded, setExcluded] = React.useState<string[]>([]);

  const isNewFunder = funderId === NEW_FUNDER;
  const setDate = (k: DateKey, v: string) => setDates(d => ({ ...d, [k]: v }));

  // "Start working by" trails the application due date until the user sets it themselves.
  const suggestedStartBy = dates.applicationDue
    ? toISO(new Date(toDate(dates.applicationDue).getTime() - SUGGESTED_LEAD_DAYS * 86400000))
    : '';
  const startBy = startByTouched ? dates.startBy : suggestedStartBy;

  const funderName = isNewFunder ? newFunderName.trim() : (funderById(state, funderId)?.name ?? '');
  const funderError = !funderId ? 'Pick a funder, or add a new one.' : undefined;
  const nameError = isNewFunder && !newFunderName.trim() ? 'Give the funder a name.' : undefined;
  const titleError = !title.trim() ? 'Give the grant a title.' : undefined;
  const step1Valid = !funderError && !nameError && !titleError;

  const grantDates: GrantDates = inFlight
    ? {
        loiDue: loiRequired && award.loiDue ? award.loiDue : undefined,
        applicationDue: award.applicationDue || undefined,
        submitted: award.submitted || undefined,
        decided: award.decided || undefined,
        periodStart: award.periodStart || undefined,
        periodEnd: award.periodEnd || undefined,
      }
    : {
        startBy: startBy || undefined,
        loiDue: loiRequired && dates.loiDue ? dates.loiDue : undefined,
        applicationDue: dates.applicationDue || undefined,
        decisionExpected: dates.decisionExpected || undefined,
        periodStart: dates.periodStart || undefined,
        periodEnd: dates.periodEnd || undefined,
      };
  // A grant brought in has passed the earlier phases: their tasks are not offered.
  const fromPhase: Phase | undefined = inFlight ? startPhase : undefined;

  const template: ChecklistTemplate | undefined = state.grants.templates.find(
    t => t.id === templateId,
  );
  const preview = React.useMemo(
    () =>
      template
        ? templatePlan(
            template,
            { id: 'draft', loiRequired, dates: grantDates, ownerId },
            [],
            fromPhase,
          )
        : [],
    [template, loiRequired, ownerId, fromPhase, JSON.stringify(grantDates)],
  );

  const grouped = PHASE_ORDER.map(phase => ({
    phase,
    rows: preview.filter(r => r.item.phase === phase),
  })).filter(g => g.rows.length > 0);

  /** Whether the step in hand may be left forward. */
  function stepValid(): boolean {
    if (step === 0) return step1Valid;
    if (!inFlight) return true;
    if (step === 1) {
      const e = awardErrors(award);
      return !e.amount && !e.period;
    }
    if (step === 2) return budgetValid(lines);
    if (step === 3) return paymentsReportsValid(payments, reports);
    return true;
  }

  function next() {
    if (!stepValid()) {
      setShowErrors(true);
      return;
    }
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
      phase: inFlight ? startPhase : started ? 'applying' : 'prospect',
      loiRequired,
      amountRequested: inFlight
        ? award.requested
          ? Number(award.requested)
          : undefined
        : amount
          ? Number(amount)
          : undefined,
      dates: grantDates,
      templateId: templateId === NO_CHECKLIST ? null : templateId,
      excludeTemplateItemIds: excluded,
      inFlight: inFlight ? inFlightFrom(award, lines, payments, reports) : undefined,
    };
    const id = actions.grants.addGrant(input);
    // The store refuses with a toast of its own.
    if (!id) return;
    toast(
      inFlight
        ? {
            tone: 'success',
            title: 'Grant brought in',
            message: `${funderName} · ${title.trim()} · at ${phaseLabel(startPhase)}`,
          }
        : { tone: 'success', title: 'Grant added', message: `${funderName} · ${title.trim()}` },
    );
    onClose();
    nav(`/grants/${id}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={640}
      title="Add grant"
      description={`Step ${step + 1} of ${steps.length} · ${stepDesc[step]}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < lastStep ? (
            <Button variant="primary" onClick={next}>
              Next: {steps[step + 1]}
            </Button>
          ) : (
            <Button variant="primary" onClick={create}>
              {inFlight ? 'Bring in grant' : 'Create grant'}
            </Button>
          )}
        </>
      }
    >
      <StepBars steps={steps} step={step} />
      {step === 0 && (
        <Grid>
          <Field
            label="Funder"
            required
            error={showErrors ? funderError : undefined}
            style={{ gridColumn: '1/-1' }}
          >
            <Select
              value={funderId}
              invalid={showErrors && !!funderError}
              onChange={e => setFunderId(e.target.value)}
              options={[
                { value: '', label: 'Pick a funder…' },
                // An archived funder is not offered for a new grant.
                ...activeOnly(state.grants.funders).map(f => ({ value: f.id, label: f.name })),
                { value: NEW_FUNDER, label: 'New funder…' },
              ]}
            />
          </Field>
          {isNewFunder && (
            <>
              <Field label="Funder name" required error={showErrors ? nameError : undefined}>
                <Input
                  value={newFunderName}
                  invalid={showErrors && !!nameError}
                  placeholder="Ralph M. Parsons Foundation"
                  onChange={e => setNewFunderName(e.target.value)}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={newFunderType}
                  options={FUNDER_TYPES}
                  onChange={e => setNewFunderType(e.target.value as FunderType)}
                />
              </Field>
              <Field label="Contact name">
                <Input
                  value={newContactName}
                  placeholder="Who we talk to"
                  onChange={e => setNewContactName(e.target.value)}
                />
              </Field>
              <Field label="Contact email">
                <Input
                  type="email"
                  value={newContactEmail}
                  placeholder="name@funder.org"
                  onChange={e => setNewContactEmail(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field
            label="Grant title"
            required
            error={showErrors ? titleError : undefined}
            style={{ gridColumn: '1/-1' }}
          >
            <Input
              value={title}
              invalid={showErrors && !!titleError}
              placeholder="Jazz Legacy Program"
              onChange={e => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Program">
            <Select
              value={program}
              onChange={e => setProgram(e.target.value as ProgramId)}
              options={state.core.programs.map(p => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Owner">
            <Select
              value={ownerId}
              onChange={e => setOwnerId(e.target.value)}
              options={activeOnly(state.core.staff).map(s => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label="Restriction" style={{ gridColumn: '1/-1' }}>
            <RadioGroup
              value={restriction}
              direction="row"
              onChange={v => setRestriction(v as Restriction)}
              options={[
                { value: 'restricted', label: 'Restricted' },
                { value: 'unrestricted', label: 'Unrestricted' },
              ]}
            />
          </Field>
          {!inFlight && (
            <SwitchRow
              label="We've already started working on this"
              checked={started}
              onChange={setStarted}
            />
          )}
          {mayBringIn && (
            <SwitchRow
              label="This grant is already under way"
              hint="Awarded, active or reporting: bring it in with its award, budget, payments and reports."
              checked={underWay}
              onChange={setUnderWay}
            />
          )}
          {inFlight && (
            <Field
              label="Where it is now"
              hint={IN_FLIGHT_HINT[startPhase]}
              style={{ gridColumn: '1/-1' }}
            >
              <RadioGroup
                value={startPhase}
                direction="row"
                onChange={v => setStartPhase(v as InFlightPhase)}
                options={IN_FLIGHT_PHASES.map(p => ({ value: p, label: phaseLabel(p) }))}
              />
            </Field>
          )}
        </Grid>
      )}

      {step > 0 && step < lastStep && (
        <Summary
          text={[
            inFlight ? phaseLabel(startPhase) : '',
            funderName || 'New funder',
            title.trim(),
            `Owner ${staffById(state, ownerId)?.name ?? '—'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          onEdit={() => setStep(0)}
        />
      )}

      {inFlight && step > 0 && step < lastStep && (
        <StepScroll>
          {step === 1 && (
            <AwardStep
              award={award}
              onChange={patch => setAward(a => ({ ...a, ...patch }))}
              loiRequired={loiRequired}
              onLoiRequired={setLoiRequired}
              showErrors={showErrors}
            />
          )}
          {step === 2 && (
            <BudgetStep
              lines={lines}
              onChange={setLines}
              awarded={Number(award.amount) || 0}
              newKey={newKey}
              showErrors={showErrors}
            />
          )}
          {step === 3 && (
            <PaymentsReportsStep
              payments={payments}
              onPayments={setPayments}
              reports={reports}
              onReports={setReports}
              awarded={Number(award.amount) || 0}
              newKey={newKey}
              showErrors={showErrors}
            />
          )}
        </StepScroll>
      )}

      {!inFlight && step === 1 && (
        <Grid>
          <Field label="Amount requested" hint="Whole dollars.">
            <Input
              value={amount ? plainNumber(Number(amount)) : ''}
              mono
              prefix="$"
              placeholder="30,000"
              onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <span className="ja-hide-sm" />
          <SwitchRow
            label="Funder requires a letter of intent"
            checked={loiRequired}
            onChange={setLoiRequired}
          />
          {loiRequired && (
            <Field label="LOI due">
              <Input
                type="date"
                value={dates.loiDue}
                onChange={e => setDate('loiDue', e.target.value)}
              />
            </Field>
          )}
          <Field label="Application due">
            <Input
              type="date"
              value={dates.applicationDue}
              onChange={e => setDate('applicationDue', e.target.value)}
            />
          </Field>
          <Field label="Expected decision">
            <Input
              type="date"
              value={dates.decisionExpected}
              onChange={e => setDate('decisionExpected', e.target.value)}
            />
          </Field>
          <Field label="Grant period start">
            <Input
              type="date"
              value={dates.periodStart}
              onChange={e => setDate('periodStart', e.target.value)}
            />
          </Field>
          <Field label="Grant period end">
            <Input
              type="date"
              value={dates.periodEnd}
              onChange={e => setDate('periodEnd', e.target.value)}
            />
          </Field>
          <Field
            label="Start working by"
            hint="We suggest 45 days before the application is due."
            style={{ gridColumn: '1/-1' }}
          >
            <Input
              type="date"
              value={startBy}
              onChange={e => {
                setStartByTouched(true);
                setDate('startBy', e.target.value);
              }}
            />
          </Field>
        </Grid>
      )}

      {step === lastStep && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Field
            label="Checklist template"
            hint={
              inFlight
                ? `Only the tasks for ${phaseLabel(startPhase)} and later are made; the earlier phases were done before the grant came in. Untick any already done.`
                : 'Every task is created with a due date worked back from the dates you entered.'
            }
          >
            <Select
              value={templateId}
              onChange={e => {
                setTemplateId(e.target.value);
                setExcluded([]);
              }}
              options={[
                ...state.grants.templates.map(t => ({ value: t.id, label: t.name })),
                { value: NO_CHECKLIST, label: 'No checklist' },
              ]}
            />
          </Field>
          {grouped.length === 0 ? (
            <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: 0 }}>
              No tasks will be created. You can add them by hand on the grant.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-5)',
                maxHeight: 320,
                overflow: 'auto',
                paddingRight: 'var(--space-3)',
              }}
            >
              {grouped.map(g => (
                <div
                  key={g.phase}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                >
                  <Eyebrow>{PHASES[g.phase as Phase].label}</Eyebrow>
                  {g.rows.map(r => (
                    <TaskRow
                      key={r.item.id}
                      item={r.item}
                      task={r.task}
                      overdue={inFlight && !!r.task.dueDate && r.task.dueDate < today}
                      checked={!excluded.includes(r.item.id)}
                      onChange={on =>
                        setExcluded(xs =>
                          on ? xs.filter(x => x !== r.item.id) : [...xs, r.item.id],
                        )
                      }
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

function StepBars({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="ja-grant-steps" style={{ '--steps': steps.length } as React.CSSProperties}>
      {steps.map((name, i) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span
            style={{
              height: 4,
              borderRadius: 'var(--radius-pill)',
              background:
                i < step
                  ? 'var(--teal-500)'
                  : i === step
                    ? 'var(--blue-500)'
                    : 'var(--neutral-100)',
            }}
          />
          <span
            style={{
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              fontWeight: i === step ? ('var(--weight-semibold)' as any) : undefined,
              color:
                i === step
                  ? 'var(--text-strong)'
                  : i < step
                    ? 'var(--text-body)'
                    : 'var(--text-faint)',
            }}
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The in-flight steps can run long (every payment, every report). The dialog
 * does not scroll itself, so the step does, as the checklist preview does.
 */
function StepScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxHeight: 'min(56vh, 540px)',
        overflow: 'auto',
        // Room for the focus ring, and for the scrollbar on the right.
        margin: -3,
        padding: '3px var(--space-3) 3px 3px',
      }}
    >
      {children}
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

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        gridColumn: '1/-1',
        display: 'flex',
        alignItems: hint ? 'flex-start' : 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-1) 0',
      }}
    >
      <Switch checked={checked} onChange={onChange} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--text-strong)' }}>{label}</span>
        {hint && (
          <span
            style={{
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}

/** What step 1 said, with a way back to it. */
function Summary({ text, onEdit }: { text: string; onEdit: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0 0 var(--space-4)',
        borderBottom: 'var(--border-width) solid var(--border-subtle)',
        marginBottom: 'var(--space-5)',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: 'var(--type-body-sm)',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

function TaskRow({
  item,
  task,
  overdue,
  checked,
  onChange,
}: {
  item: ChecklistTemplateItem;
  task: Omit<Task, 'id'>;
  /** Due before today: a grant brought in may already have done it. */
  overdue: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '7px 0',
        borderBottom: 'var(--border-width) solid var(--border-subtle)',
      }}
    >
      <Checkbox checked={checked} onChange={onChange} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: 'var(--type-body-sm)',
          color: checked ? 'var(--text-body)' : 'var(--text-faint)',
        }}
      >
        {item.title}
      </span>
      <span
        style={{
          font: 'var(--type-numeric)',
          color: overdue && checked ? 'var(--danger-600)' : 'var(--text-muted)',
        }}
      >
        {task.dueDate ? `${overdue ? 'Was due ' : ''}${dateShort(task.dueDate)}` : '—'}
      </span>
    </div>
  );
}
