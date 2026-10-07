import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../../app/Shell';
import { useToast } from '../../../app/ToastHost';
import { TableScroll } from '../../../app/components/TableScroll';
import {
  Card,
  DataTable,
  EmptyState,
  Badge,
  Button,
  Icon,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
} from '../../../design-system';
import { useStore, useCan, money, dateShort } from '../../../core';
import { funderTotals, grantsByFunder } from '../domain';
import type { Funder, FunderType } from '../domain';

export const FUNDER_TYPES: Array<{ value: FunderType; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'government', label: 'Government' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'individual', label: 'Individual' },
  { value: 'other', label: 'Other' },
];

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type FunderDraft = Omit<Funder, 'id'>;

export const EMPTY_FUNDER: FunderDraft = {
  name: '',
  type: 'foundation',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  cycleNotes: '',
};

/** The shared body of the Add / Edit funder dialogs. */
export function FunderFields({
  draft,
  onChange,
  showErrors,
}: {
  draft: FunderDraft;
  onChange: (patch: Partial<FunderDraft>) => void;
  showErrors?: boolean;
}) {
  const nameError = !draft.name.trim() ? 'Give the funder a name.' : undefined;
  return (
    <div className="ja-grid-2" style={{ alignItems: 'start' }}>
      <Field label="Name" required error={showErrors ? nameError : undefined}>
        <Input
          value={draft.name}
          invalid={!!showErrors && !!nameError}
          placeholder="Herb Alpert Foundation"
          onChange={e => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label="Type">
        <Select
          value={draft.type}
          options={FUNDER_TYPES}
          onChange={e => onChange({ type: e.target.value as FunderType })}
        />
      </Field>
      <Field label="Contact name">
        <Input
          value={draft.contactName ?? ''}
          placeholder="Who we talk to"
          onChange={e => onChange({ contactName: e.target.value })}
        />
      </Field>
      <Field label="Contact email">
        <Input
          type="email"
          value={draft.contactEmail ?? ''}
          placeholder="name@funder.org"
          onChange={e => onChange({ contactEmail: e.target.value })}
        />
      </Field>
      <Field label="Phone">
        <Input
          value={draft.contactPhone ?? ''}
          placeholder="(562) 555-0100"
          onChange={e => onChange({ contactPhone: e.target.value })}
        />
      </Field>
      <Field label="Website">
        <Input
          value={draft.website ?? ''}
          placeholder="herbalpertfoundation.org"
          onChange={e => onChange({ website: e.target.value })}
        />
      </Field>
      <Field
        label="Cycle notes"
        hint="When they open, what they want first."
        style={{ gridColumn: '1/-1' }}
      >
        <Textarea
          rows={2}
          value={draft.cycleNotes ?? ''}
          placeholder="LOI in January, full proposal by March 15."
          onChange={e => onChange({ cycleNotes: e.target.value })}
        />
      </Field>
    </div>
  );
}

export default function Funders() {
  const { state } = useStore();
  const mayEdit = useCan()('grants', 'edit');
  const nav = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<FunderDraft>(EMPTY_FUNDER);
  const [showErrors, setShowErrors] = React.useState(false);
  const { actions } = useStore();

  const allAwarded = state.grants.grants.reduce((sum, g) => sum + (g.amountAwarded ?? 0), 0);

  usePageHeader({
    title: 'Funders',
    subtitle:
      state.grants.funders.length === 0
        ? 'No funders yet'
        : `${state.grants.funders.length} ${state.grants.funders.length === 1 ? 'funder' : 'funders'} · ${money(allAwarded)} awarded all time`,
    actions: mayEdit ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={startAdding}
      >
        Add funder
      </Button>
    ) : undefined,
  });

  function startAdding() {
    setDraft(EMPTY_FUNDER);
    setShowErrors(false);
    setAdding(true);
  }

  function lastActivity(funderId: string): string | undefined {
    const ids = new Set(grantsByFunder(state, funderId).map(g => g.id));
    const dates = state.grants.activity.filter(a => ids.has(a.grantId)).map(a => a.at);
    return dates.length ? dates.slice().sort().reverse()[0].slice(0, 10) : undefined;
  }

  const rows = state.grants.funders.map(f => {
    const totals = funderTotals(state, f.id);
    return { id: f.id, funder: f, totals, last: lastActivity(f.id) };
  });
  type Row = (typeof rows)[number];

  function save() {
    if (!draft.name.trim()) {
      setShowErrors(true);
      return;
    }
    actions.grants.addFunder({ ...draft, name: draft.name.trim() });
    toast({ tone: 'success', title: 'Funder added', message: draft.name.trim() });
    setAdding(false);
  }

  return (
    <>
      <Card padding="0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="building-2" size={22} />}
            title="No funders yet"
            message={
              mayEdit
                ? 'Every foundation, agency and company we apply to shows up here, with its contact and what it has awarded. Add a funder, or add a grant and its funder comes with it.'
                : 'Every foundation, agency and company we apply to shows up here once someone adds it.'
            }
            action={
              mayEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={startAdding}
                >
                  Add funder
                </Button>
              )
            }
          />
        ) : (
          <TableScroll minWidth={780}>
            <DataTable
              onRowClick={(r: Row) => nav(`/funders/${r.id}`)}
              rows={rows}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  width: '1.8fr',
                  strong: true,
                  wrap: true,
                  render: (r: Row) => r.funder.name,
                },
                {
                  key: 'type',
                  label: 'Type',
                  width: '130px',
                  render: (r: Row) => <Badge tone="neutral">{capitalise(r.funder.type)}</Badge>,
                },
                {
                  key: 'contact',
                  label: 'Contact',
                  width: '1.4fr',
                  render: (r: Row) =>
                    r.funder.contactName ?? <span style={{ color: 'var(--text-faint)' }}>—</span>,
                },
                {
                  key: 'grants',
                  label: 'Grants',
                  width: '80px',
                  align: 'right',
                  mono: true,
                  render: (r: Row) => r.totals.grants,
                },
                {
                  key: 'awarded',
                  label: 'Total awarded',
                  width: '130px',
                  align: 'right',
                  mono: true,
                  render: (r: Row) => money(r.totals.awarded),
                },
                {
                  key: 'last',
                  label: 'Last activity',
                  width: '120px',
                  render: (r: Row) => (
                    <span
                      style={{
                        font: 'var(--type-numeric)',
                        color: r.last ? 'var(--text-body)' : 'var(--text-faint)',
                      }}
                    >
                      {r.last ? dateShort(r.last) : '—'}
                    </span>
                  ),
                },
              ]}
            />
          </TableScroll>
        )}
      </Card>
      {adding && mayEdit && (
        <Dialog
          open
          width={560}
          title="Add funder"
          description="The organisation behind the money. You can fill in the rest later."
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save}>
                Add funder
              </Button>
            </>
          }
        >
          <FunderFields
            draft={draft}
            showErrors={showErrors}
            onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          />
        </Dialog>
      )}
    </>
  );
}
