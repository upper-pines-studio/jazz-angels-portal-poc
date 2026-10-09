/**
 * PROTOTYPE — throwaway, dev only, on /prototype/programs. Each program's
 * budget for the fiscal year and each project's, and the grants that pay for
 * them. `?sel=program:<id>` or `?sel=project:<id>` picks the sheet on the right.
 * The grant page shows the same shares from the grant's side (GrantShares).
 */
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Icon, Input, Select } from '../../../../design-system';
import { archivedOnly, dateShort, money, programName, useCan, useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import { usePageHeader } from '../../../../app/Shell';
import { useToast } from '../../../../app/ToastHost';
import { ArchiveDialog, ShowArchivedSwitch } from '../../../../app/components/archive';
import { ProgramDialog } from '../../../../app/screens/settings/ProgramsCard';
import type { ProgramDraft } from '../../../../app/screens/settings/ProgramsCard';
import {
  firmIds,
  funded,
  fyOf,
  given,
  programKey,
  projectKey,
  protoId,
  restriction,
  setShare,
  sources,
  sum,
  targets,
  useProto,
  warnings,
} from './model';
import type { Source, Target } from './model';
import './prototype.css';

export default function ProgramsPrototype() {
  const { state, today, actions } = useStore();
  const [proto, update] = useProto();
  const [params, setParams] = useSearchParams();
  const mayEditPrograms = useCan()('programs', 'edit');
  const toast = useToast();
  const [showArchived, setShowArchived] = React.useState(false);
  const [draft, setDraft] = React.useState<ProgramDraft | null>(null);
  const [archiving, setArchiving] = React.useState<Target | null>(null);
  const srcs = React.useMemo(() => sources(state), [state]);
  const firm = firmIds(srcs);
  const all = targets(state, proto, today, showArchived);
  const fy = fyOf(state, today);
  const selected = all.find(t => t.key === params.get('sel')) ?? all[0];
  const select = (key: string) => setParams({ sel: key }, { replace: true });

  const budgeted = sum(all.filter(t => t.kind === 'program' && !t.archived).map(t => t.budget));
  const totals = all.map(t => funded(proto, t.key, firm));
  const programTargets = all.filter(t => t.kind === 'program');

  usePageHeader({
    title: 'Programs',
    subtitle: `Prototype: what each program and project costs in ${fy.label}, and the grants paying for it`,
  });

  const addProject = (program: string) => {
    const id = protoId('p');
    update(s => ({
      ...s,
      projects: [
        ...s.projects,
        { id, name: 'New project', program, start: fy.start, end: fy.end, budget: 0 },
      ],
    }));
    select(projectKey(id));
  };

  return (
    <>
      <div className="pp-note">
        Prototype, nothing is saved; a reload starts over. Hatched bars and “If awarded” are grants
        still pending. Red marks money a grant may not be able to pay: restricted to other programs,
        or outside the grant period. Each grant’s page shows the same money from the grant’s side.
      </div>

      <div className="pp-a">
        <div className="pp-a__side">
          <div className="pp-a__side-head">
            <div className="pp-muted">
              {fy.label}: {money(budgeted + sum(proto.projects.map(p => p.budget)))} budgeted ·{' '}
              {money(sum(totals.map(t => t.total)))} funded
            </div>
            <div className="pp-a__side-actions">
              {mayEditPrograms && (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() => setDraft({ name: '', short: '' })}
                >
                  Add program
                </Button>
              )}
              <ShowArchivedSwitch
                count={archivedOnly(state.core.programs).length}
                checked={showArchived}
                onChange={setShowArchived}
              />
            </div>
          </div>
          <div className="pp-a__list">
            {programTargets.map(p => {
              const projects = all.filter(t => t.kind === 'project' && t.program === p.program);
              return (
                <React.Fragment key={p.key}>
                  <ListItem target={p} selected={selected} onSelect={select} srcs={srcs} />
                  {projects.map(t => (
                    <ListItem
                      key={t.key}
                      target={t}
                      selected={selected}
                      onSelect={select}
                      srcs={srcs}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {selected && (
          <Card padding="var(--space-6)">
            <Sheet
              state={state}
              target={selected}
              srcs={srcs}
              all={all}
              onSelect={select}
              onAddProject={addProject}
              onEditProgram={
                mayEditPrograms
                  ? () => {
                      const p = state.core.programs.find(x => x.id === selected.program);
                      if (p) setDraft({ id: p.id, name: p.name, short: p.short });
                    }
                  : undefined
              }
              onArchiveProgram={mayEditPrograms ? () => setArchiving(selected) : undefined}
              onRestoreProgram={
                mayEditPrograms
                  ? () => {
                      actions.core.restoreProgram(selected.program);
                      toast({
                        tone: 'success',
                        title: 'Program restored',
                        message: `${selected.name} is back in the pickers.`,
                      });
                    }
                  : undefined
              }
            />
          </Card>
        )}
      </div>

      {draft && (
        <ProgramDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onAdded={id => select(programKey(id))}
        />
      )}

      {archiving && (
        <ArchiveDialog
          title={`Archive ${archiving.name}?`}
          message="It leaves this page and the pickers for new grants, students, ensembles and hours. Everything that already names it keeps it, and you can restore it."
          onConfirm={() => {
            actions.core.archiveProgram(archiving.program);
            toast({
              tone: 'success',
              title: 'Program archived',
              message: `${archiving.name} is off the list. Restore it from Show archived.`,
            });
          }}
          onClose={() => setArchiving(null)}
        />
      )}

      <details className="pp-state">
        <summary>Prototype state</summary>
        <pre>{JSON.stringify(proto, null, 2)}</pre>
      </details>
    </>
  );
}

function ListItem({
  target: t,
  selected,
  onSelect,
  srcs,
}: {
  target: Target;
  selected?: Target;
  onSelect: (key: string) => void;
  srcs: Source[];
}) {
  const [proto] = useProto();
  const f = funded(proto, t.key, firmIds(srcs));
  return (
    <button
      className={`pp-a__item${t.kind === 'project' ? ' pp-a__item--project' : ''}`}
      aria-current={t.key === selected?.key}
      onClick={() => onSelect(t.key)}
    >
      <strong>
        {t.name} {t.archived && <Badge tone="neutral">Archived</Badge>}
      </strong>
      <span className="pp-muted">
        {t.budget === 0
          ? `${money(f.total)} · no budget yet`
          : `${money(f.total)} of ${money(t.budget)}${f.total < t.budget ? ` · ${money(t.budget - f.total)} to find` : ' · covered'}`}
      </span>
      <Stack
        max={Math.max(t.budget, f.total)}
        parts={srcs.map(s => ({
          color: s.color,
          hoped: !s.firm,
          amount:
            proto.shares.find(x => x.target === t.key && x.grantId === s.grant.id)?.amount ?? 0,
        }))}
      />
    </button>
  );
}

function Sheet({
  state,
  target: t,
  srcs,
  all,
  onSelect,
  onAddProject,
  onEditProgram,
  onArchiveProgram,
  onRestoreProgram,
}: {
  state: PortalState;
  target: Target;
  srcs: Source[];
  all: Target[];
  onSelect: (key: string) => void;
  onAddProject: (program: string) => void;
  /** Unset for a role that may not change programs (decision 0001: Admin and Director). */
  onEditProgram?: () => void;
  onArchiveProgram?: () => void;
  onRestoreProgram?: () => void;
}) {
  const [proto, update] = useProto();
  const firm = firmIds(srcs);
  const f = funded(proto, t.key, firm);
  const shareOf = (grantId: string) =>
    proto.shares.find(x => x.target === t.key && x.grantId === grantId);
  const rows = srcs.filter(s => shareOf(s.grant.id));
  const addable = srcs.filter(s => !shareOf(s.grant.id));
  const projectId = t.kind === 'project' ? t.key.slice('project:'.length) : undefined;
  const editProject = (patch: Record<string, string | number>) =>
    update(s => ({
      ...s,
      projects: s.projects.map(p => (p.id === projectId ? { ...p, ...patch } : p)),
    }));
  const projects =
    t.kind === 'program' ? all.filter(x => x.kind === 'project' && x.program === t.program) : [];

  return (
    <>
      {t.kind === 'program' ? (
        <div className="pp-head">
          <div style={{ flex: 1 }}>
            <div className="pp-label">Program</div>
            <div className="pp-title">
              {t.name} {t.archived && <Badge tone="neutral">Archived</Badge>}
            </div>
            <div className="pp-muted">
              Short name: {state.core.programs.find(p => p.id === t.program)?.short}
              {onEditProgram && !t.archived && (
                <>
                  {' · '}
                  <button className="pp-linkish" onClick={onEditProgram}>
                    Edit
                  </button>
                  {' · '}
                  <button className="pp-linkish" onClick={onArchiveProgram}>
                    Archive
                  </button>
                </>
              )}
              {onRestoreProgram && t.archived && (
                <>
                  {' · '}
                  <button className="pp-linkish" onClick={onRestoreProgram}>
                    Restore
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ width: 160 }}>
            <div className="pp-label">Budget this year</div>
            <Input
              type="number"
              prefix="$"
              value={t.budget}
              onChange={e =>
                update(s => ({
                  ...s,
                  programBudgets: { ...s.programBudgets, [t.program]: Number(e.target.value) || 0 },
                }))
              }
            />
          </div>
        </div>
      ) : (
        <>
          <div className="pp-head">
            <div style={{ flex: 1 }}>
              <div className="pp-label">Project</div>
              <Input value={t.name} onChange={e => editProject({ name: e.target.value })} />
            </div>
            <div>
              <div className="pp-label">Part of</div>
              <Select
                value={t.program}
                options={state.core.programs.map(p => ({ value: p.id, label: p.name }))}
                onChange={e => editProject({ program: e.target.value })}
              />
            </div>
          </div>
          <div className="pp-head">
            <div>
              <div className="pp-label">Starts</div>
              <Input
                type="date"
                value={t.start}
                onChange={e => editProject({ start: e.target.value })}
              />
            </div>
            <div>
              <div className="pp-label">Ends</div>
              <Input
                type="date"
                value={t.end}
                onChange={e => editProject({ end: e.target.value })}
              />
            </div>
            <div style={{ width: 160 }}>
              <div className="pp-label">Budget</div>
              <Input
                type="number"
                prefix="$"
                value={t.budget}
                onChange={e => editProject({ budget: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </>
      )}

      <div className="pp-a__figs">
        <Fig label="Budget" value={money(t.budget)} />
        <Fig label="From awarded grants" value={money(f.firm)} />
        <Fig label="If pending grants come in" value={money(f.hoped)} />
        <Fig
          label={f.total > t.budget ? 'More than the budget' : 'Still to find'}
          value={money(Math.abs(t.budget - f.total))}
        />
      </div>

      <Stack
        max={Math.max(t.budget, f.total)}
        parts={rows.map(s => ({
          color: s.color,
          hoped: !s.firm,
          amount: shareOf(s.grant.id)!.amount,
        }))}
      />
      <p className="pp-muted" style={{ margin: 'var(--space-2) 0 var(--space-5)' }}>
        {dateShort(t.start)} to {dateShort(t.end)}
        {t.kind === 'project' && ` · part of ${programName(state, t.program)}`}
      </p>

      <div className="pp-label" style={{ marginBottom: 'var(--space-2)' }}>
        Paid for by
      </div>
      {rows.length === 0 && <p className="pp-muted">No grant money yet. Add some below.</p>}
      {rows.map(s => {
        const share = shareOf(s.grant.id)!;
        const left = s.total - given(proto, s.grant.id);
        const warn = warnings(state, proto, s.grant, t);
        const allowed = restriction(proto, s.grant);
        return (
          <div key={s.grant.id} className="pp-a__row">
            <div>
              <span className="pp-swatch" style={{ background: s.color }} />
              <Link to={`/grants/${s.grant.id}?tab=award`}>
                <strong>{s.funder}</strong>
              </Link>{' '}
              · {s.grant.title} {!s.firm && <Badge tone="gold">If awarded</Badge>}
              {allowed && (
                <div className="pp-muted">
                  Restricted to {allowed.map(id => programName(state, id)).join(' and ')}
                </div>
              )}
              {warn.map(w => (
                <div key={w} className="pp-warn">
                  {w}
                </div>
              ))}
            </div>
            <Input
              type="number"
              prefix="$"
              value={share.amount}
              invalid={left < 0 || warn.length > 0}
              onChange={e =>
                update(st => setShare(st, s.grant.id, t.key, Number(e.target.value) || 0))
              }
            />
            <span className={left < 0 ? 'pp-warn' : 'pp-muted'}>
              {left < 0
                ? `${money(-left)} more than the grant has`
                : `${money(left)} of ${money(s.total)} not yet given`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update(st => setShare(st, s.grant.id, t.key, 0))}
            >
              ✕
            </Button>
          </div>
        );
      })}
      {addable.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 460 }}>
          <Select
            value=""
            options={[
              { value: '', label: 'Add money from a grant…' },
              ...addable.map(s => ({
                value: s.grant.id,
                label: `${s.funder} · ${money(s.total - given(proto, s.grant.id))} not yet given${s.firm ? '' : ' (pending)'}`,
              })),
            ]}
            onChange={e => {
              const s = addable.find(x => x.grant.id === e.target.value);
              if (!s) return;
              const left = Math.max(0, s.total - given(proto, s.grant.id));
              const need = Math.max(0, t.budget - f.total);
              update(st => setShare(st, s.grant.id, t.key, Math.min(left, need) || 1));
            }}
          />
        </div>
      )}

      {t.kind === 'program' && (
        <div style={{ marginTop: 'var(--space-7)' }}>
          <div className="pp-label" style={{ marginBottom: 'var(--space-2)' }}>
            Projects in {t.name}
          </div>
          {projects.length === 0 && <p className="pp-muted">No projects in this program yet.</p>}
          {projects.map(p => {
            const pf = funded(proto, p.key, firm);
            return (
              <div key={p.key} className="pp-a__row pp-a__row--project">
                <button className="pp-linkish" onClick={() => onSelect(p.key)}>
                  {p.name}
                </button>
                <span className="pp-muted">
                  {dateShort(p.start)} to {dateShort(p.end)}
                </span>
                <span className="pp-num">
                  {money(pf.total)} of {money(p.budget)}
                </span>
              </div>
            );
          })}
          <Button variant="ghost" size="sm" onClick={() => onAddProject(t.program)}>
            Add a project
          </Button>
        </div>
      )}
    </>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="pp-label">{label}</div>
      <div className="pp-big">{value}</div>
    </div>
  );
}

export function Stack({
  parts,
  max,
}: {
  parts: Array<{ color: string; amount: number; hoped?: boolean; title?: string }>;
  max: number;
}) {
  return (
    <div className="pp-stack">
      {parts
        .filter(p => p.amount > 0)
        .map((p, i) => (
          <span
            key={i}
            title={p.title}
            className={p.hoped ? 'pp-hoped' : undefined}
            style={{ width: `${(p.amount / Math.max(max, 1)) * 100}%`, backgroundColor: p.color }}
          />
        ))}
    </div>
  );
}
