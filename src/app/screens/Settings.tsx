import React from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { TableScroll } from '../components/TableScroll';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  Field,
  Icon,
  Input,
  Select,
  Switch,
  Tag,
} from '../../design-system';
import { usePageHeader } from '../Shell';
import { useToast } from '../ToastHost';
import { SEED_TODAY, dateLong, dateRange, fiscalYear, useStore } from '../../core';
import type { ModuleManifest, StaffMember } from '../../core';
import { MODULES } from '../../modules';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MUTED_SM: React.CSSProperties = {
  font: 'var(--weight-regular) 13px/1.6 var(--font-sans)',
  color: 'var(--text-muted)',
};

interface PersonDraft {
  id?: string;
  name: string;
  role: string;
  teaches: boolean;
}

export default function Settings() {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [person, setPerson] = React.useState<PersonDraft | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  usePageHeader({ title: 'Settings', subtitle: 'People, programs, modules and your data' });

  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
  const enabled = state.core.settings.enabledModules;
  const demoToday = state.core.settings.demoToday;

  function setDemoToday(iso: string | undefined) {
    actions.core.updateSettings({ demoToday: iso });
    toast({
      tone: 'success',
      title: iso ? 'Demo date in use' : 'Real date in use',
      message: iso
        ? `The portal reads today as ${dateLong(iso)}.`
        : 'The portal reads today from the clock.',
    });
  }

  function savePerson() {
    if (!person || !person.name.trim()) return;
    const name = person.name.trim();
    const role = person.role.trim() || 'Staff';
    if (person.id) {
      actions.core.updateStaff(person.id, { name, role, teaches: person.teaches });
      toast({ tone: 'success', title: 'Person updated', message: `${name} · ${role}` });
    } else {
      actions.core.addStaff({ name, role, teaches: person.teaches });
      toast({ tone: 'success', title: 'Person added', message: `${name} · ${role}` });
    }
    setPerson(null);
  }

  function toggleModule(module: ModuleManifest, on: boolean) {
    actions.core.setModuleEnabled(module.id, on);
    if (on) {
      toast({
        tone: 'success',
        title: `${module.label} is on`,
        message: 'It is back on the rail and the dashboard.',
      });
      return;
    }
    const inside = module.routes.some(r => matchPath(r.path, loc.pathname));
    if (inside) nav('/');
    toast({
      tone: 'info',
      title: `${module.label} is off.`,
      message: 'Turn it back on here in Settings.',
    });
  }

  function exportJson() {
    const url = URL.createObjectURL(
      new Blob([actions.core.exportJson()], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `jazz-angels-portal-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: 'success', title: 'Data exported', message: `jazz-angels-portal-${today}.json` });
  }

  async function importJson(file: File) {
    try {
      actions.core.importJson(await file.text());
      toast({ tone: 'success', title: 'Data imported', message: file.name });
    } catch (err) {
      toast({
        tone: 'danger',
        title: 'Import failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <Card title="Staff" subtitle="Who can own a grant, lead a class or log hours." padding="0">
        <TableScroll minWidth={520}>
          <DataTable
            rows={state.core.staff}
            columns={[
              { key: 'name', label: 'Name', strong: true },
              { key: 'role', label: 'Role' },
              {
                key: 'teaches',
                label: 'Teaches',
                width: '110px',
                render: (row: StaffMember) => (
                  <Switch
                    checked={row.teaches}
                    label={row.teaches ? 'Yes' : 'No'}
                    onChange={next => {
                      actions.core.updateStaff(row.id, { teaches: next });
                      toast({
                        tone: 'success',
                        title: next ? `${row.name} teaches` : `${row.name} does not teach`,
                        message: next
                          ? 'They can lead an ensemble and log hours.'
                          : 'They stay off the class and hours lists.',
                      });
                    }}
                  />
                ),
              },
              {
                key: 'edit',
                label: '',
                width: '80px',
                align: 'right',
                render: (row: StaffMember) => (
                  <a
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      setPerson({
                        id: row.id,
                        name: row.name,
                        role: row.role,
                        teaches: row.teaches,
                      });
                    }}
                  >
                    Edit
                  </a>
                ),
              },
            ]}
            emptyLabel="No one yet. Add the people who work here."
          />
        </TableScroll>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 var(--space-4)',
            background: 'var(--surface-sunken)',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Icon name="plus" size={15} />}
            onClick={() => setPerson({ name: '', role: '', teaches: false })}
          >
            Add person
          </Button>
        </div>
      </Card>

      <Card title="Modules" subtitle="What this portal does. Core stays on.">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {MODULES.map(m => (
            <div
              key={m.id}
              className="ja-kv"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) 0',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    font: 'var(--weight-semibold) var(--text-sm)/1.4 var(--font-sans)',
                    color: 'var(--text-strong)',
                  }}
                >
                  {m.label}
                </div>
                <div style={MUTED_SM}>{m.description}</div>
              </div>
              <Switch
                checked={enabled.includes(m.id)}
                label={enabled.includes(m.id) ? 'On' : 'Off'}
                onChange={next => toggleModule(m, next)}
              />
            </div>
          ))}
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
          Turning a module off hides it from the rail and the dashboard. Its data stays.
        </p>
      </Card>

      {MODULES.filter(m => enabled.includes(m.id))
        .flatMap(m => m.settings ?? [])
        .map((Panel, i) => (
          <Panel key={i} />
        ))}

      <Card title="Partners and venues" subtitle="Schools, districts and the places classes meet.">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <p style={{ ...MUTED_SM, margin: 0, flex: 1, minWidth: 240 }}>
            {state.core.organizations.length}{' '}
            {state.core.organizations.length === 1 ? 'organization' : 'organizations'} and{' '}
            {state.core.venues.length} venues. They live on their own screen, since the schedule
            points at them.
          </p>
          <Button variant="secondary" size="sm" onClick={() => nav('/partners')}>
            Open Partners
          </Button>
        </div>
      </Card>

      <Card title="Programs" subtitle="What the money and the classes are for.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          {state.core.programs.map(p => (
            <Tag key={p.id}>{p.name}</Tag>
          ))}
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
          Programs come from the Jazz Angels site. Editing them is out of scope for this proof of
          concept.
        </p>
      </Card>

      <Card title="Fiscal year" subtitle="Where the year starts for every total on the dashboard.">
        <div style={{ maxWidth: 280 }}>
          <Field label="First month of the fiscal year">
            <Select
              value={String(state.core.settings.fiscalYearStartMonth)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              onChange={e => {
                const month = Number(e.target.value);
                actions.core.updateSettings({ fiscalYearStartMonth: month });
                const next = fiscalYear(today, month);
                toast({
                  tone: 'success',
                  title: 'Fiscal year changed',
                  message: `${next.label} · ${dateRange(next.start, next.end)}`,
                });
              }}
            />
          </Field>
        </div>
        <p style={{ ...MUTED_SM, margin: 'var(--space-3) 0 0' }}>
          Today sits in <strong style={{ color: 'var(--text-strong)' }}>{fy.label}</strong>, which
          runs {dateRange(fy.start, fy.end)}.
        </p>
      </Card>

      <Card title="Your data" subtitle="Everything lives in this browser until you move it.">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}
        >
          <Button
            variant="secondary"
            iconLeft={<Icon name="download" size={15} />}
            onClick={exportJson}
          >
            Export JSON
          </Button>
          <Button
            variant="secondary"
            iconLeft={<Icon name="upload" size={15} />}
            onClick={() => fileInput.current?.click()}
          >
            Import JSON
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importJson(file);
            }}
          />
          {confirmReset ? (
            <>
              <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
                This replaces everything with the demo data. Reset?
              </span>
              <Button
                variant="secondary"
                style={{ color: 'var(--danger-500)' }}
                onClick={() => {
                  actions.core.resetDemo();
                  setConfirmReset(false);
                  toast({
                    tone: 'success',
                    title: 'Demo data restored',
                    message: 'Every module is back to the sample data.',
                  });
                }}
              >
                Yes, reset
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                No, keep my data
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              style={{ color: 'var(--danger-500)' }}
              onClick={() => setConfirmReset(true)}
            >
              Reset demo data
            </Button>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-5)',
            paddingTop: 'var(--space-4)',
            borderTop: 'var(--border-width) solid var(--border-subtle)',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                font: 'var(--weight-semibold) var(--text-sm)/1.4 var(--font-sans)',
                color: 'var(--text-strong)',
              }}
            >
              Today in the demo
            </div>
            <div style={MUTED_SM}>{dateLong(today)}</div>
          </div>
          {demoToday ? (
            <Button variant="secondary" onClick={() => setDemoToday(undefined)}>
              Use the real date
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setDemoToday(SEED_TODAY)}>
              Use the demo date
            </Button>
          )}
        </div>

        <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
          Data lives in this browser only. Export before switching computers. The demo date keeps
          the sample story on the day it was written for.
        </p>
      </Card>

      <Card title="About">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            font: 'var(--type-body-sm)',
            color: 'var(--text-body)',
          }}
        >
          <span>Jazz Angels Portal · proof of concept</span>
          <span style={MUTED_SM}>
            Data: local browser storage, one key per module (swap for Supabase later without
            touching screens)
          </span>
          <span style={MUTED_SM}>Design: Jazz Angels staff-portal design system</span>
        </div>
      </Card>

      {person && (
        <Dialog
          open
          title={person.id ? 'Edit person' : 'Add person'}
          description={
            person.id
              ? 'Change the name, the role or whether they teach.'
              : 'Someone who works here.'
          }
          onClose={() => setPerson(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPerson(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!person.name.trim()} onClick={savePerson}>
                {person.id ? 'Save person' : 'Add person'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Field label="Name" required>
              <Input
                value={person.name}
                placeholder="Dana Whitfield"
                onChange={e => setPerson({ ...person, name: e.target.value })}
              />
            </Field>
            <Field
              label="Role"
              hint="How they show up on a grant or a class: Program Director, Bookkeeper, Teaching Artist."
            >
              <Input
                value={person.role}
                placeholder="Program Director"
                onChange={e => setPerson({ ...person, role: e.target.value })}
              />
            </Field>
            <Field label="Teaches" hint="Teaching artists lead ensembles and log hours.">
              <Switch
                checked={person.teaches}
                label={person.teaches ? 'Yes' : 'No'}
                onChange={next => setPerson({ ...person, teaches: next })}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
