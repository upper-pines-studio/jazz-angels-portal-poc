import React from 'react';
import { Badge, Button, Card, Input, Select } from '../../../../design-system';
import { dateShort, money, programName } from '../../../../core';
import type { VariantProps } from './ProjectsPrototype';
import { firmIds, grantCommitted, projectFunded, protoId, setAmount, warnings } from './model';

export const NAME_A = 'Project sheet';

/** A: pick a project, see where its money comes from, add or change grants. */
export function VariantA({ state, proto, setProto, srcs }: VariantProps) {
  const [selected, setSelected] = React.useState(proto.projects[0]?.id);
  const firm = firmIds(srcs);
  const project = proto.projects.find(p => p.id === selected) ?? proto.projects[0];

  const addProject = () => {
    const id = protoId('p');
    setProto(s => ({
      ...s,
      projects: [
        ...s.projects,
        {
          id,
          name: 'New project',
          program: 'studio-sessions',
          start: '2027-01-01',
          end: '2027-03-31',
          budget: 5000,
        },
      ],
    }));
    setSelected(id);
  };

  return (
    <div className="pp-a">
      <div className="pp-a__list">
        {proto.projects.map(p => {
          const f = projectFunded(proto, p.id, firm);
          return (
            <button
              key={p.id}
              className="pp-a__item"
              aria-current={p.id === project?.id}
              onClick={() => setSelected(p.id)}
            >
              <strong>{p.name}</strong>
              <span className="pp-muted">
                {money(f.total)} of {money(p.budget)}
                {f.total < p.budget ? ` · ${money(p.budget - f.total)} to find` : ' · covered'}
              </span>
              <Stack
                parts={srcs.map(s => ({
                  color: s.color,
                  hoped: !s.firm,
                  amount:
                    proto.allocations.find(a => a.projectId === p.id && a.grantId === s.grant.id)
                      ?.amount ?? 0,
                }))}
                max={Math.max(p.budget, f.total)}
              />
            </button>
          );
        })}
        <Button variant="ghost" onClick={addProject}>
          Add a project
        </Button>
      </div>

      {project && (
        <Card padding="var(--space-6)">
          <ProjectSheet {...{ state, proto, setProto, srcs }} projectId={project.id} />
        </Card>
      )}
    </div>
  );
}

function ProjectSheet({
  state,
  proto,
  setProto,
  srcs,
  projectId,
}: VariantProps & { projectId: string }) {
  const project = proto.projects.find(p => p.id === projectId)!;
  const firm = firmIds(srcs);
  const f = projectFunded(proto, project.id, firm);
  const rows = srcs.filter(s =>
    proto.allocations.some(a => a.projectId === project.id && a.grantId === s.grant.id),
  );
  const addable = srcs.filter(s => !rows.includes(s));
  const edit = (patch: Partial<typeof project>) =>
    setProto(s => ({
      ...s,
      projects: s.projects.map(p => (p.id === project.id ? { ...p, ...patch } : p)),
    }));

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          alignItems: 'end',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="pp-label">Project</div>
          <Input value={project.name} onChange={e => edit({ name: e.target.value })} />
        </div>
        <div>
          <div className="pp-label">Program</div>
          <Select
            value={project.program}
            options={state.core.programs.map(p => ({ value: p.id, label: p.name }))}
            onChange={e => edit({ program: e.target.value as typeof project.program })}
          />
        </div>
        <div style={{ width: 140 }}>
          <div className="pp-label">Budget</div>
          <Input
            type="number"
            prefix="$"
            value={project.budget}
            onChange={e => edit({ budget: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="pp-a__figs">
        <Fig label="Budget" value={money(project.budget)} />
        <Fig label="From awarded grants" value={money(f.firm)} />
        <Fig label="If pending grants come in" value={money(f.hoped)} />
        <Fig
          label={f.total >= project.budget ? 'Covered' : 'Still to find'}
          value={money(Math.abs(project.budget - f.total))}
        />
      </div>

      <Stack
        parts={rows.map(s => ({
          color: s.color,
          hoped: !s.firm,
          amount: proto.allocations.find(
            a => a.projectId === project.id && a.grantId === s.grant.id,
          )!.amount,
        }))}
        max={Math.max(project.budget, f.total)}
      />
      <p className="pp-muted" style={{ margin: 'var(--space-2) 0 var(--space-5)' }}>
        {dateShort(project.start)} to {dateShort(project.end)} ·{' '}
        {programName(state, project.program)}
      </p>

      <div className="pp-label" style={{ marginBottom: 'var(--space-2)' }}>
        Funded by
      </div>
      {rows.map(s => {
        const a = proto.allocations.find(
          x => x.projectId === project.id && x.grantId === s.grant.id,
        )!;
        const free = s.total - grantCommitted(proto, s.grant.id);
        const warn = warnings(state, s, project);
        return (
          <div key={s.grant.id} className="pp-a__row">
            <div>
              <span className="pp-swatch" style={{ background: s.color }} />
              <strong>{s.funder}</strong> · {s.grant.title}{' '}
              {!s.firm && <Badge tone="gold">If awarded</Badge>}{' '}
              {s.grant.restriction === 'restricted' && <Badge tone="neutral">Restricted</Badge>}
              {warn.map(w => (
                <div key={w} className="pp-warn">
                  {w}
                </div>
              ))}
            </div>
            <Input
              type="number"
              prefix="$"
              value={a.amount}
              invalid={free < 0 || warn.length > 0}
              onChange={e =>
                setProto(st => setAmount(st, project.id, s.grant.id, Number(e.target.value) || 0))
              }
            />
            <span className={free < 0 ? 'pp-warn' : 'pp-muted'}>
              {free < 0
                ? `${money(-free)} more than the grant has`
                : `${money(free)} of ${money(s.total)} left`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProto(st => setAmount(st, project.id, s.grant.id, 0))}
            >
              ✕
            </Button>
          </div>
        );
      })}
      {addable.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 420 }}>
          <Select
            value=""
            options={[
              { value: '', label: 'Add money from a grant…' },
              ...addable.map(s => ({
                value: s.grant.id,
                label: `${s.funder} · ${money(s.total - grantCommitted(proto, s.grant.id))} left${s.firm ? '' : ' (pending)'}`,
              })),
            ]}
            onChange={e => {
              const s = addable.find(x => x.grant.id === e.target.value);
              if (!s) return;
              const free = Math.max(0, s.total - grantCommitted(proto, s.grant.id));
              const need = Math.max(0, project.budget - f.total);
              setProto(st => setAmount(st, project.id, s.grant.id, Math.min(free, need) || 1));
            }}
          />
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
