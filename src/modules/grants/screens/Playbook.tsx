import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Dialog, Field, Icon, Input, RadioGroup, Select } from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { useToast } from '../../../app/ToastHost';
import { PhaseBadge } from './badges';
import { useStore } from '../../../core';
import { DEFAULT_TEMPLATE_ID, PHASES, PHASE_ORDER, timingLabel } from '../domain';
import type { ChecklistTemplate, ChecklistTemplateItem, DateAnchor, Phase } from '../domain';
import './playbook.css';

/** The grant dates a step can hang off, in the order they happen. */
const ANCHORS: Array<{ value: DateAnchor; label: string }> = [
  { value: 'startBy', label: 'Start date' },
  { value: 'loiDue', label: 'LOI due' },
  { value: 'applicationDue', label: 'Application due' },
  { value: 'submitted', label: 'Submission' },
  { value: 'decisionExpected', label: 'Expected decision' },
  { value: 'decided', label: 'Decision' },
  { value: 'periodStart', label: 'Period start' },
  { value: 'periodEnd', label: 'Period end' },
];

const steps = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`;
const MONO_SM: React.CSSProperties = { font: 'var(--weight-medium) 13px/1.3 var(--font-mono)', color: 'var(--text-muted)' };

export default function Playbook() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [timingItem, setTimingItem] = React.useState<ChecklistTemplateItem | null>(null);

  const templates = state.grants.templates;
  const selected: ChecklistTemplate | undefined =
    templates.find(t => t.id === params.get('template')) ?? templates[0];

  const select = (id: string) => setParams({ template: id }, { replace: true });

  usePageHeader({
    title: 'Playbook',
    subtitle: 'The checklists every grant follows',
    actions: (
      <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={() => { setNewName(''); setAdding(true); }}>
        New template
      </Button>
    ),
  });

  /** Every edit is a patch of the whole items array. */
  const patchItems = (items: ChecklistTemplateItem[]) => selected && actions.grants.updateTemplate(selected.id, { items });

  function saveTitle(item: ChecklistTemplateItem) {
    const title = draft.trim();
    if (selected && title && title !== item.title) {
      patchItems(selected.items.map(i => (i.id === item.id ? { ...i, title } : i)));
    }
    setEditingId(null);
  }

  function removeItem(item: ChecklistTemplateItem) {
    if (!selected) return;
    patchItems(selected.items.filter(i => i.id !== item.id));
    toast({ tone: 'success', title: 'Step removed', message: item.title });
  }

  function addStep(phase: Phase) {
    if (!selected) return;
    const item: ChecklistTemplateItem = {
      id: `${selected.id}-i${Date.now()}`,
      phase,
      title: 'New step',
      offsetDays: 0,
      anchor: 'applicationDue',
    };
    patchItems([...selected.items, item]);
    setDraft(item.title);
    setEditingId(item.id);
  }

  function saveTiming(item: ChecklistTemplateItem, offsetDays: number, anchor: DateAnchor) {
    if (!selected) return;
    const next = { ...item, offsetDays, anchor };
    patchItems(selected.items.map(i => (i.id === item.id ? next : i)));
    setTimingItem(null);
    toast({ tone: 'success', title: 'Timing changed', message: `${item.title} · ${timingLabel(next)}` });
  }

  const used = PHASE_ORDER.filter(p => selected?.items.some(i => i.phase === p));
  const unused = PHASE_ORDER.filter(p => !used.includes(p));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ font: 'var(--weight-regular) 14px/1.65 var(--font-sans)', color: 'var(--text-muted)', maxWidth: 900, margin: 0 }}>
        When a grant is added it copies one of these checklists, with due dates worked out from the application
        deadline and grant period. Change the playbook here and every new grant follows it.
      </p>

      <div className="ja-split ja-split--nav" style={{ gap: 'var(--space-5)' }}>
        <Card padding="0">
          {templates.map((t, i) => {
            const on = t.id === selected?.id;
            return (
              <div key={t.id} onClick={() => select(t.id)}
                style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer',
                  padding: 'var(--space-4) var(--space-5)', background: on ? 'var(--blue-50)' : 'var(--neutral-0)',
                  borderBottom: i === templates.length - 1 ? 'none' : 'var(--border-width) solid var(--border-subtle)' }}>
                <span style={{ font: 'var(--type-label)', fontWeight: on ? 'var(--weight-semibold)' as any : undefined,
                  color: on ? 'var(--text-strong)' : 'var(--text-body)' }}>{t.name}</span>
                <span style={{ ...MONO_SM, color: on ? 'var(--text-muted)' : 'var(--text-faint)' }}>{steps(t.items.length)}</span>
              </div>
            );
          })}
        </Card>

        {selected && (
          <Card padding="0" title={selected.name}
            subtitle={selected.id === DEFAULT_TEMPLATE_ID ? 'Default for new grants' : undefined}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '0 0 auto', flexWrap: 'wrap' }}>
                {confirmDelete ? (
                  <>
                    <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>Delete this template?</span>
                    <Button variant="secondary" size="sm" onClick={() => {
                      actions.grants.deleteTemplate(selected.id);
                      setConfirmDelete(false);
                      const next = templates.find(t => t.id !== selected.id);
                      if (next) select(next.id);
                      toast({ tone: 'success', title: 'Template deleted', message: selected.name });
                    }}>Yes, delete</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => {
                      const id = actions.grants.duplicateTemplate(selected.id);
                      select(id);
                      toast({ tone: 'success', title: 'Template duplicated', message: `Copy of ${selected.name}` });
                    }}>Duplicate</Button>
                    <Button variant="ghost" size="sm" disabled={selected.id === DEFAULT_TEMPLATE_ID}
                      style={{ color: selected.id === DEFAULT_TEMPLATE_ID ? undefined : 'var(--danger-500)' }}
                      onClick={() => setConfirmDelete(true)}>Delete</Button>
                  </>
                )}
              </div>
            }>
            {used.map(phase => {
              const items = selected.items.filter(i => i.phase === phase);
              return (
                <div key={phase}>
                  <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-5)',
                    background: 'var(--surface-sunken)', borderTop: 'var(--border-width) solid var(--border-subtle)',
                    borderBottom: 'var(--border-width) solid var(--border-subtle)' }}>
                    <PhaseBadge phase={phase} />
                    <span style={{ ...MONO_SM, fontSize: 12 }}>{steps(items.length)}</span>
                  </div>
                  {items.map(item => (
                    <div key={item.id} className="ja-playbook-row" style={{ background: 'var(--neutral-0)',
                      borderBottom: 'var(--border-width) solid var(--border-subtle)' }}>
                      <span className="ja-playbook-row__grip" style={{ color: 'var(--neutral-300)', display: 'flex' }}><Icon name="grip-vertical" size={14} /></span>
                      {editingId === item.id ? (
                        <TitleEditor className="ja-playbook-row__title" value={draft} onChange={setDraft}
                          onSave={() => saveTitle(item)} onCancel={() => setEditingId(null)} />
                      ) : (
                        <span className="ja-playbook-row__title" onClick={() => { setDraft(item.title); setEditingId(item.id); }} title="Rename this step"
                          style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)', cursor: 'text',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      )}
                      <span className="ja-playbook-row__timing" onClick={() => setTimingItem(item)} title="Change when this step is due"
                        style={{ ...MONO_SM, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {timingLabel(item)}
                      </span>
                      <button className="ja-playbook-row__remove" onClick={() => removeItem(item)} aria-label={`Remove ${item.title}`}
                        style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--neutral-300)',
                          font: '16px/1 var(--font-sans)', padding: 0 }}>&times;</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', minHeight: 34, padding: '0 var(--space-4)',
                    borderBottom: 'var(--border-width) solid var(--border-subtle)', background: 'var(--neutral-0)' }}>
                    <Button variant="ghost" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={() => addStep(phase)}>
                      Add step to {PHASES[phase].label}
                    </Button>
                  </div>
                </div>
              );
            })}

            {selected.items.length === 0 && (
              <div style={{ padding: 'var(--space-6) var(--space-5)', font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
                No steps yet. Pick a phase below and add the first one.
              </div>
            )}

            {unused.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
                padding: 'var(--space-3) var(--space-5)',
                background: 'var(--surface-sunken)', borderTop: 'var(--border-width) solid var(--border-subtle)' }}>
                <span style={{ font: 'var(--weight-regular) 13px/1.5 var(--font-sans)', color: 'var(--text-muted)' }}>
                  Add a step to another phase…
                </span>
                <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
                  <Select value=""
                    options={[{ value: '', label: 'Choose a phase' }, ...unused.map(p => ({ value: p, label: PHASES[p].label }))]}
                    onChange={e => { if (e.target.value) addStep(e.target.value as Phase); }} />
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {adding && (
        <Dialog open title="New template" description="A checklist new grants can copy. Add the steps once it exists."
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
              <Button variant="primary" disabled={!newName.trim()} onClick={() => {
                const id = actions.grants.addTemplate({ name: newName.trim(), items: [] });
                setAdding(false);
                select(id);
                toast({ tone: 'success', title: 'Template added', message: newName.trim() });
              }}>Add template</Button>
            </>
          }>
          <Field label="Name" required>
            <Input value={newName} placeholder="Family foundation — small ask" onChange={e => setNewName(e.target.value)} />
          </Field>
        </Dialog>
      )}

      {timingItem && (
        <TimingDialog item={timingItem} onClose={() => setTimingItem(null)}
          onSave={(days, anchor) => saveTiming(timingItem, days, anchor)} />
      )}
    </div>
  );
}

/** Inline rename: Enter or clicking away saves, Escape abandons. */
function TitleEditor({ className, value, onChange, onSave, onCancel }: {
  className?: string;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);
  return (
    <div ref={box} className={className} onBlur={onSave}
      onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}>
      <Input value={value} onChange={e => onChange(e.target.value)} style={{ height: 30 }} />
    </div>
  );
}

/** When a step is due: a number of days before or after one of the grant's dates. */
function TimingDialog({ item, onSave, onClose }: {
  item: ChecklistTemplateItem;
  onSave: (offsetDays: number, anchor: DateAnchor) => void;
  onClose: () => void;
}) {
  const [days, setDays] = React.useState(String(Math.abs(item.offsetDays)));
  const [anchor, setAnchor] = React.useState<DateAnchor>(item.anchor);
  const [dir, setDir] = React.useState(item.offsetDays < 0 ? 'before' : 'after');
  const n = Math.max(0, Math.round(Number(days) || 0));
  const preview = timingLabel({ offsetDays: dir === 'before' ? -n : n, anchor });

  return (
    <Dialog open title="When is this step due?" description={item.title} onClose={onClose} width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(dir === 'before' ? -n : n, anchor)}>Save timing</Button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-4)' }}>
          <Field label="Days"><Input type="number" value={days} onChange={e => setDays(e.target.value)} mono /></Field>
          <Field label="Counted from">
            <Select value={anchor} options={ANCHORS} onChange={e => setAnchor(e.target.value as DateAnchor)} />
          </Field>
        </div>
        <Field label="Before or after">
          <RadioGroup direction="row" value={dir} options={[{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }]}
            onChange={setDir} />
        </Field>
        <p style={{ ...MONO_SM, margin: 0 }}>{preview}</p>
      </div>
    </Dialog>
  );
}
