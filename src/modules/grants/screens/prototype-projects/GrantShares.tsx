/**
 * PROTOTYPE — throwaway, dev only. On a grant's Award tab: where the grant's
 * money goes, by program and project, and what is not yet given. Shares the
 * in-memory store with /prototype/programs.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input, Select } from '../../../../design-system';
import { money, programName, useStore } from '../../../../core';
import type { Grant } from '../../domain';
import {
  COLORS,
  given,
  restriction,
  setShare,
  sources,
  targets,
  useProto,
  warnings,
} from './model';
import { Stack } from './ProgramsPrototype';
import './prototype.css';

export function GrantShares({ grant }: { grant: Grant }) {
  const { state, today } = useStore();
  const [proto, update] = useProto();
  const [to, setTo] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const source = sources(state).find(s => s.grant.id === grant.id);
  if (!source) return null;

  const all = targets(state, proto, today);
  const shares = proto.shares.filter(x => x.grantId === grant.id);
  const out = given(proto, grant.id);
  const left = source.total - out;
  const allowed = restriction(proto, grant);
  const colorOf = (key: string) => COLORS[all.findIndex(t => t.key === key) % COLORS.length];
  const target = all.find(t => t.key === to);
  const warn = target ? warnings(state, proto, grant, target) : [];

  return (
    <Card
      title="Where this grant’s money goes"
      subtitle={
        <>
          Prototype ·{' '}
          {allowed
            ? `Restricted to ${allowed.map(id => programName(state, id)).join(' and ')}`
            : 'Unrestricted: any program or project'}
          {!source.firm && ' · counted as if awarded'}
        </>
      }
      action={
        <div style={{ textAlign: 'right' }}>
          <div className={left < 0 ? 'pp-big pp-over' : 'pp-big'}>
            {left < 0 ? `${money(-left)} over` : money(left)}
          </div>
          <div className="pp-muted">not yet given, of {money(source.total)}</div>
        </div>
      }
    >
      <Stack
        max={Math.max(source.total, out)}
        parts={shares.map(x => ({
          color: colorOf(x.target),
          amount: x.amount,
          hoped: !source.firm,
          title: all.find(t => t.key === x.target)?.name,
        }))}
      />

      <div className="pp-c__chips">
        {shares.map(x => {
          const t = all.find(y => y.key === x.target);
          if (!t) return null;
          const w = warnings(state, proto, grant, t);
          return (
            <span key={x.id} className="pp-c__chip" title={w.join('\n') || undefined}>
              <span className="pp-swatch" style={{ background: colorOf(t.key), marginRight: 0 }} />
              <Link to={`/prototype/programs?sel=${t.key}`}>{t.name}</Link>
              {t.kind === 'project' && <span className="pp-muted">project</span>}· {money(x.amount)}
              {w.length > 0 && <span className="pp-warn">· {w[0]}</span>}
              <button
                aria-label={`Take back from ${t.name}`}
                onClick={() => update(s => setShare(s, grant.id, t.key, 0))}
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
            { value: '', label: 'Give to a program or project…' },
            ...all.map(t => ({
              value: t.key,
              label: t.kind === 'project' ? `   ${t.name} (project)` : t.name,
            })),
          ]}
          onChange={e => setTo(e.target.value)}
        />
        <div style={{ width: 140 }}>
          <Input
            type="number"
            prefix="$"
            placeholder={String(Math.max(0, left))}
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!to}
          onClick={() => {
            const existing = shares.find(x => x.target === to)?.amount ?? 0;
            const add = Number(amount) || Math.max(0, left);
            update(s => setShare(s, grant.id, to, existing + add));
            setTo('');
            setAmount('');
          }}
        >
          Give
        </Button>
      </div>
      {warn.length > 0 && (
        <div className="pp-warn" style={{ marginTop: 'var(--space-2)' }}>
          {warn.join(' · ')}
        </div>
      )}
    </Card>
  );
}
