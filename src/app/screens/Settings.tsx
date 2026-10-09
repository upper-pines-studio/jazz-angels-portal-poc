import React from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { TableScroll } from '../components/TableScroll';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Switch,
} from '../../design-system';
import { usePageHeader } from '../Shell';
import { ArchiveDialog, ArchivedName, ShowArchivedSwitch } from '../components/archive';
import { useToast } from '../ToastHost';
import {
  ROLES,
  ROLE_LABELS,
  SEED_TODAY,
  dateLong,
  activeOnly,
  archivedOnly,
  dateRange,
  fiscalYear,
  isArchived,
  isRole,
  mayChangeStaff,
  meetsAny,
  programsList,
  useCan,
  useStore,
  withArchived,
} from '../../core';
import type { ModuleManifest, Role, StaffMember } from '../../core';
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
  title: string;
  role: Role;
  teaches: boolean;
}

export default function Settings() {
  const { state, today, actions, user, demo, demoToday } = useStore();
  const allowed = useCan();
  // Staff and roles; the system's own settings with import, export and reset (decision 0001).
  const mayStaff = allowed('staff', 'edit');
  const maySystem = allowed('modules', 'edit');
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [person, setPerson] = React.useState<PersonDraft | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  // Show archived on the staff list: this card's own, so local state.
  const [showArchived, setShowArchived] = React.useState(false);
  const [archiving, setArchiving] = React.useState<StaffMember | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  usePageHeader({ title: 'Settings', subtitle: 'People, programs, modules and your data' });

  const fy = fiscalYear(today, state.core.settings.fiscalYearStartMonth);
  const enabled = state.core.settings.enabledModules;
  // A new office: nobody on the staff list but the person signed in.
  const onlyYou = state.core.staff.every(s => s.id === user.id || isArchived(s));
  const archivedStaff = archivedOnly(state.core.staff).length;
  const staffRows = withArchived(state.core.staff, showArchived);
  const partnerCount = activeOnly(state.core.organizations).length;
  const venueCount = activeOnly(state.core.venues).length;
  // Operations is not a program (decision 0006), so it is not counted.
  const programCount = programsList(state).length;
  const archivedPrograms = programsList(state, true).length - programCount;
  const archivedPlaces =
    state.core.organizations.length + state.core.venues.length - partnerCount - venueCount;

  function archivePerson(row: StaffMember) {
    actions.core.archiveStaff(row.id);
    toast({
      tone: 'success',
      title: `${row.name} is archived`,
      message: 'They can no longer sign in. Restore them from Show archived.',
    });
  }

  function restorePerson(row: StaffMember) {
    actions.core.restoreStaff(row.id);
    toast({
      tone: 'success',
      title: `${row.name} is restored`,
      message: 'They are back on the staff list and can sign in again.',
    });
  }

  function setDemoToday(iso: string | undefined) {
    actions.core.setDemoToday(iso);
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
    const title = person.title.trim() || 'Staff';
    const { role, teaches } = person;
    const message = `${name} · ${ROLE_LABELS[role]}`;
    if (person.id === user.id) {
      // Your own role is not yours to change, so it stays out of the patch.
      actions.core.updateStaff(person.id, { name, title, teaches });
      toast({ tone: 'success', title: 'Person updated', message });
    } else if (person.id) {
      actions.core.updateStaff(person.id, { name, title, role, teaches });
      toast({ tone: 'success', title: 'Person updated', message });
    } else {
      actions.core.addStaff({ name, title, role, teaches });
      toast({ tone: 'success', title: 'Person added', message });
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
      {mayStaff && (
        <Card
          title="Staff"
          subtitle="Who can own a grant, lead a class or log hours."
          padding="0"
          action={
            <ShowArchivedSwitch
              count={archivedStaff}
              checked={showArchived}
              onChange={setShowArchived}
            />
          }
        >
          <TableScroll minWidth={640}>
            <DataTable
              rows={staffRows}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  strong: true,
                  render: (row: StaffMember) => <ArchivedName name={row.name} record={row} />,
                },
                { key: 'title', label: 'Title' },
                {
                  key: 'role',
                  label: 'Role',
                  render: (row: StaffMember) => ROLE_LABELS[row.role],
                },
                {
                  key: 'teaches',
                  label: 'Teaches',
                  width: '110px',
                  render: (row: StaffMember) =>
                    isArchived(row) || !mayChangeStaff(user.role, row.role, row.role) ? (
                      row.teaches ? (
                        'Yes'
                      ) : (
                        'No'
                      )
                    ) : (
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
                  width: '150px',
                  align: 'right',
                  render: (row: StaffMember) =>
                    !mayChangeStaff(user.role, row.role, row.role) ? null : isArchived(row) ? (
                      <a
                        href="#"
                        onClick={e => {
                          e.preventDefault();
                          restorePerson(row);
                        }}
                      >
                        Restore
                      </a>
                    ) : (
                      <span className="ja-actions" style={{ justifyContent: 'flex-end' }}>
                        <a
                          href="#"
                          onClick={e => {
                            e.preventDefault();
                            setPerson({
                              id: row.id,
                              name: row.name,
                              title: row.title,
                              role: row.role,
                              teaches: row.teaches,
                            });
                          }}
                        >
                          Edit
                        </a>
                        {/* Nobody archives themself. */}
                        {row.id !== user.id && (
                          <a
                            href="#"
                            onClick={e => {
                              e.preventDefault();
                              setArchiving(row);
                            }}
                          >
                            Archive
                          </a>
                        )}
                      </span>
                    ),
                },
              ]}
            />
          </TableScroll>
          {onlyYou && (
            <EmptyState
              icon={<Icon name="users" size={22} />}
              title="Only you so far"
              message="Everyone who owns a grant, leads a class or logs hours shows up here. Add each person before they sign in: a sign-in only works for someone with a staff record, and their role here is what they may see and do."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() =>
                    setPerson({ name: '', title: '', role: 'read-only', teaches: false })
                  }
                >
                  Add person
                </Button>
              }
            />
          )}
          {!onlyYou && (
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
                onClick={() =>
                  setPerson({ name: '', title: '', role: 'read-only', teaches: false })
                }
              >
                Add person
              </Button>
            </div>
          )}
        </Card>
      )}

      {maySystem && (
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
      )}

      {MODULES.filter(m => enabled.includes(m.id))
        .flatMap(m => m.settings ?? [])
        .filter(card => meetsAny(user.role, card.requires))
        .map(({ component: Panel }, i) => (
          <Panel key={i} />
        ))}

      <Card title="Partners and venues" subtitle="Schools, districts and the places classes meet.">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <p style={{ ...MUTED_SM, margin: 0, flex: 1, minWidth: 240 }}>
            {state.core.organizations.length + state.core.venues.length === 0 ? (
              <>
                No organizations or venues yet. Add them on the Partners screen, so the schedule
                knows where each class meets.
              </>
            ) : (
              <>
                {partnerCount} {partnerCount === 1 ? 'organization' : 'organizations'} and{' '}
                {venueCount} {venueCount === 1 ? 'venue' : 'venues'}
                {archivedPlaces > 0 && `, and ${archivedPlaces} archived`}. They live on their own
                screen, since the schedule points at them.
              </>
            )}
          </p>
          <Button variant="secondary" size="sm" onClick={() => nav('/partners')}>
            Open Partners
          </Button>
        </div>
      </Card>

      <Card title="Programs" subtitle="What the money and the classes are for.">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        >
          <p style={{ ...MUTED_SM, margin: 0, flex: 1, minWidth: 240 }}>
            {programCount === 0
              ? 'No programs yet. Add them on the Programs page.'
              : `${programCount} ${programCount === 1 ? 'program' : 'programs'}${archivedPrograms > 0 ? `, and ${archivedPrograms} archived` : ''}. They are added, renamed and archived on the Programs page.`}
          </p>
          <Button variant="secondary" size="sm" onClick={() => nav('/programs')}>
            Open Programs
          </Button>
        </div>
      </Card>

      <Card title="Fiscal year" subtitle="Where the year starts for every total on the dashboard.">
        {maySystem && (
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
        )}
        <p style={{ ...MUTED_SM, margin: maySystem ? 'var(--space-3) 0 0' : 0 }}>
          Today sits in <strong style={{ color: 'var(--text-strong)' }}>{fy.label}</strong>, which
          runs {dateRange(fy.start, fy.end)}.
        </p>
      </Card>

      {maySystem && (
        <Card title="Your data" subtitle="Everything lives in this browser until you move it.">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
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
            {demo && confirmReset && (
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
            )}
            {demo && !confirmReset && (
              <Button
                variant="secondary"
                style={{ color: 'var(--danger-500)' }}
                onClick={() => setConfirmReset(true)}
              >
                Reset demo data
              </Button>
            )}
          </div>
          {demo && (
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
          )}

          <p style={{ ...MUTED_SM, margin: 'var(--space-4) 0 0' }}>
            Data lives in this browser only. Export before switching computers.
            {demo && ' The demo date keeps the sample story on the day it was written for.'}
          </p>
        </Card>
      )}

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

      {archiving && mayStaff && (
        <ArchiveDialog
          title={`Archive ${archiving.name}?`}
          message="They can no longer sign in, and they leave the staff list and the pickers. Their classes, hours, approvals and activity still name them. You can restore them."
          onConfirm={() => archivePerson(archiving)}
          onClose={() => setArchiving(null)}
        />
      )}

      {person && mayStaff && (
        <Dialog
          open
          title={person.id ? 'Edit person' : 'Add person'}
          description={
            person.id === user.id
              ? 'Change your name, your title or whether you teach.'
              : person.id
                ? 'Change the name, the title, the role or whether they teach.'
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
              label="Title"
              hint="How they show up on a grant or a class: Program Director, Bookkeeper, Teaching Artist."
            >
              <Input
                value={person.title}
                placeholder="Program Director"
                onChange={e => setPerson({ ...person, title: e.target.value })}
              />
            </Field>
            {/* Nobody changes their own role, Admin included (decision 0001). */}
            {person.id === user.id ? (
              <Field
                label="Role"
                hint="You can't change your own role. Ask someone else who manages staff."
              >
                <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-strong)' }}>
                  {ROLE_LABELS[person.role]}
                </span>
              </Field>
            ) : (
              <Field label="Role" hint="What they can do in the portal when they sign in.">
                <Select
                  value={person.role}
                  options={ROLES.filter(r => mayChangeStaff(user.role, person.role, r)).map(r => ({
                    value: r,
                    label: ROLE_LABELS[r],
                  }))}
                  onChange={e => {
                    if (isRole(e.target.value)) setPerson({ ...person, role: e.target.value });
                  }}
                />
              </Field>
            )}
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
