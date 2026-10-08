import React from 'react';
import { Badge, Button, Card, Input, Select } from '../../../../design-system';
import { dateShort, money } from '../../../../core';
import type { VariantProps } from './ProjectsPrototype';
import type { Source } from './model';
import { firmIds, grantCommitted, projectFunded, setAmount, warnings } from './model';
import { Stack } from './VariantA';

export const NAME_C = 'Grant pots';

const PROJECT_COLORS = [
  'var(--blue-500)',
  'var(--teal-500)',
  'var(--gold-500)',
  'var(--olive-500)',
];

/** C: start from each grant and hand its money out; projects show what they still need. */
export function VariantC(props: VariantProps) {
  const { proto, srcs } = props;
  const firm = firmIds(srcs);
  const colorOf = (projectId: string) =>
    PROJECT_COLORS[proto.projects.findIndex(p => p.id === projectId) % PROJECT_COLORS.length];

  return (
    <>
      <div className="pp-c__strip">
        {proto.projects.map(p => {
          const f = projectFunded(proto, p.id, firm);
          const gap = p.budget - f.total;
          return (
            <div
              key={p.id}
              className="pp-c__need"
              style={{ borderTop: `4px solid ${colorOf(p.id)}` }}
            >
              <strong>{p.name}</strong>
              <div className="pp-muted">
                {dateShort(p.start)} to {dateShort(p.end)}
              </div>
              <div className="pp-big" style={{ marginTop: 'var(--space-2)' }}>
                {gap > 0 ? money(gap) : 'Covered'}
              </div>
              <div className="pp-muted">
                {gap > 0 ? `still needed of ${money(p.budget)}` : `${money(p.budget)} budget`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pp-c__pots">
        {srcs.map(s => (
          <Pot key={s.grant.id} {...props} source={s} colorOf={colorOf} />
        ))}
      </div>
    </>
  );
}

function Pot({
  state,
  proto,
  setProto,
  source: s,
  colorOf,
}: VariantProps & { source: Source; colorOf: (id: string) => string }) {
  const committed = grantCommitted(proto, s.grant.id);
  const free = s.total - committed;
  const given = proto.allocations.filter(a => a.grantId === s.grant.id);
  const [to, setTo] = React.useState('');
  const [amount, setAmountText] = React.useState('');
  const target = proto.projects.find(p => p.id === to);
  const warn = target ? warnings(state, s, target) : [];

  return (
    <Card padding="var(--space-5)">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <strong>{s.funder}</strong> · {s.grant.title}{' '}
          {!s.firm && <Badge tone="gold">If awarded</Badge>}{' '}
          {s.grant.restriction === 'restricted' && <Badge tone="neutral">Restricted</Badge>}
          <div className="pp-muted">
            Period {dateShort(s.grant.dates.periodStart)} to {dateShort(s.grant.dates.periodEnd)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={free < 0 ? 'pp-big pp-over' : 'pp-big'}>
            {free < 0 ? `${money(-free)} over` : money(free)}
          </div>
          <div className="pp-muted">not yet given, of {money(s.total)}</div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Stack
          max={Math.max(s.total, committed)}
          parts={given.map(a => ({
            color: colorOf(a.projectId),
            amount: a.amount,
            hoped: !s.firm,
            title: proto.projects.find(p => p.id === a.projectId)?.name,
          }))}
        />
      </div>

      <div className="pp-c__chips">
        {given.map(a => {
          const p = proto.projects.find(x => x.id === a.projectId)!;
          const w = warnings(state, s, p);
          return (
            <span key={a.id} className="pp-c__chip" title={w.join('\n') || undefined}>
              <span className="pp-swatch" style={{ background: colorOf(p.id), marginRight: 0 }} />
              {p.name} · {money(a.amount)}
              {w.length > 0 && <span className="pp-warn">· {w[0]}</span>}
              <button
                aria-label={`Take back from ${p.name}`}
                onClick={() => setProto(st => setAmount(st, p.id, s.grant.id, 0))}
              >
                ✕
              </button>
            </span>
          );
        })}
      </div>

      <div className="pp-c__give">
        <Select
          value={to}
          options={[
            { value: '', label: 'Give to a project…' },
            ...proto.projects.map(p => ({ value: p.id, label: p.name })),
          ]}
          onChange={e => setTo(e.target.value)}
        />
        <div style={{ width: 130 }}>
          <Input
            type="number"
            prefix="$"
            placeholder={String(Math.max(0, free))}
            value={amount}
            onChange={e => setAmountText(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!to}
          onClick={() => {
            const existing =
              proto.allocations.find(a => a.projectId === to && a.grantId === s.grant.id)?.amount ??
              0;
            const add = Number(amount) || Math.max(0, free);
            setProto(st => setAmount(st, to, s.grant.id, existing + add));
            setTo('');
            setAmountText('');
          }}
        >
          Give
        </Button>
        {warn.length > 0 && <span className="pp-warn">{warn.join(' · ')}</span>}
      </div>
    </Card>
  );
}
