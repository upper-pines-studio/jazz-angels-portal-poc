import React from 'react';
import { TableScroll } from '../components/TableScroll';
import { Button, Card, DataTable, Dialog, Field, Icon, Input, Select, Tag } from '../../design-system';
import { usePageHeader } from '../Shell';
import { useToast } from '../ToastHost';
import { dateRange, fiscalYear, useStore } from '../../domain';
import type { StaffMember } from '../../domain';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const MUTED_SM: React.CSSProperties = { font: 'var(--weight-regular) 13px/1.6 var(--font-sans)', color: 'var(--text-muted)' };

export default function Settings() {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [person, setPerson] = React.useState<{ id?: string; name: string; role: string } | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  usePageHeader({ title: 'Settings', subtitle: 'People, programs and your data' });

  const fy = fiscalYear(today, state.settings.fiscalYearStartMonth);

  function savePerson() {
    if (!person || !person.name.trim()) return;
    const name = person.name.trim();
    const role = person.role.trim() || 'Staff';
    if (person.id) {
      actions.updateStaff(person.id, { name, role });
      toast({ tone: 'success', title: 'Person updated', message: `${name} · ${role}` });
    } else {
      actions.addStaff({ name, role });
      toast({ tone: 'success', title: 'Person added', message: `${name} · ${role}` });
    }
    setPerson(null);
  }

  function exportJson() {
    const url = URL.createObjectURL(new Blob([actions.exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `jazz-angels-grants-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: 'success', title: 'Data exported', message: `jazz-angels-grants-${today}.json` });
  }

  async function importJson(file: File) {
    try {
      actions.importJson(await file.text());
      toast({ tone: 'success', title: 'Data imported', message: file.name });
    } catch (err) {
      toast({ tone: 'danger', title: 'Import failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <>
      <Card title="Staff" subtitle="Who can own a grant or a checklist step." padding="0">
        <TableScroll minWidth={420}>
          <DataTable
            rows={state.staff}
            columns={[
              { key: 'name', label: 'Name', strong: true },
              { key: 'role', label: 'Role' },
              {
                key: 'edit', label: '', width: '80px', align: 'right',
                render: (row: StaffMember) => (
                  <a href="#" onClick={e => { e.preventDefault(); setPerson({ id: row.id, name: row.name, role: row.role }); }}>Edit</a>
                ),
              },
            ]}
            emptyLabel="No one yet. Add the people who work on grants."
          />
        </TableScroll>
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 var(--space-4)', background: 'var(--surface-sunken)' }}>
          <Button variant="ghost" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={() => setPerson({ name: '', role: '' })}>
            Add person
          </Button>
        </div>
      </Card>

      <Card title="Programs" subtitle="What the money pays for.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          {state.programs.map(p => <Tag key={p.id}>{p.name}</Tag>)}
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
          Programs come from the Jazz Angels site. Editing them is out of scope for this proof of concept.
        </p>
      </Card>

      <Card title="Fiscal year" subtitle="Where the year starts for every total on the dashboard.">
        <div style={{ maxWidth: 280 }}>
          <Field label="First month of the fiscal year">
            <Select value={String(state.settings.fiscalYearStartMonth)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              onChange={e => {
                const month = Number(e.target.value);
                actions.updateSettings({ fiscalYearStartMonth: month });
                const next = fiscalYear(today, month);
                toast({ tone: 'success', title: 'Fiscal year changed', message: `${next.label} · ${dateRange(next.start, next.end)}` });
              }} />
          </Field>
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-3) 0 0' }}>
          Today sits in <strong style={{ color: 'var(--text-strong)' }}>{fy.label}</strong>, which runs {dateRange(fy.start, fy.end)}.
        </p>
      </Card>

      <Card title="Your data" subtitle="Everything lives in this browser until you move it.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button variant="secondary" iconLeft={<Icon name="download" size={15} />} onClick={exportJson}>Export JSON</Button>
          <Button variant="secondary" iconLeft={<Icon name="upload" size={15} />} onClick={() => fileInput.current?.click()}>Import JSON</Button>
          <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importJson(file);
            }} />
          {confirmReset ? (
            <>
              <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>This replaces everything with the demo data. Reset?</span>
              <Button variant="secondary" style={{ color: 'var(--danger-500)' }} onClick={() => {
                actions.resetDemo();
                setConfirmReset(false);
                toast({ tone: 'success', title: 'Demo data restored', message: 'Everything is back to the sample grants.' });
              }}>Yes, reset</Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>No, keep my data</Button>
            </>
          ) : (
            <Button variant="secondary" style={{ color: 'var(--danger-500)' }} onClick={() => setConfirmReset(true)}>Reset demo data</Button>
          )}
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
          Data lives in this browser only. Export before switching computers.
        </p>
      </Card>

      <Card title="About">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
          <span>Jazz Angels Grants · proof of concept</span>
          <span style={MUTED_SM}>Data: local browser storage (swap for Supabase later without touching screens)</span>
          <span style={MUTED_SM}>Design: Jazz Angels staff-portal design system</span>
        </div>
      </Card>

      {person && (
        <Dialog open title={person.id ? 'Edit person' : 'Add person'}
          description={person.id ? 'Change the name or role.' : 'Someone who can own a grant or a checklist step.'}
          onClose={() => setPerson(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPerson(null)}>Cancel</Button>
              <Button variant="primary" disabled={!person.name.trim()} onClick={savePerson}>
                {person.id ? 'Save person' : 'Add person'}
              </Button>
            </>
          }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Field label="Name" required>
              <Input value={person.name} placeholder="Dana Whitfield" onChange={e => setPerson({ ...person, name: e.target.value })} />
            </Field>
            <Field label="Role" hint="How they show up on a grant — Program Director, Bookkeeper, Teaching Artist.">
              <Input value={person.role} placeholder="Program Director" onChange={e => setPerson({ ...person, role: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
