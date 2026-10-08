import React from 'react';
import { Badge, Card } from '../../../../design-system';
import { money } from '../../../../core';
import type { VariantProps } from './ProjectsPrototype';
import { firmIds, grantCommitted, projectFunded, setAmount, warnings } from './model';

export const NAME_B = 'Allocation grid';

/** B: grants down the side, projects across the top, every amount editable in place. */
export function VariantB({ state, proto, setProto, srcs }: VariantProps) {
  const firm = firmIds(srcs);
  const amountOf = (projectId: string, grantId: string) =>
    proto.allocations.find(a => a.projectId === projectId && a.grantId === grantId)?.amount;

  return (
    <Card padding="0">
      <div style={{ overflowX: 'auto' }}>
        <table className="pp-grid">
          <thead>
            <tr>
              <th>Grant</th>
              {proto.projects.map(p => (
                <th key={p.id}>
                  {p.name}
                  <div className="pp-muted">needs {money(p.budget)}</div>
                </th>
              ))}
              <th className="pp-col-total">Given to projects</th>
              <th className="pp-col-total">Not yet given</th>
            </tr>
          </thead>
          <tbody>
            {srcs.map(s => {
              const committed = grantCommitted(proto, s.grant.id);
              const free = s.total - committed;
              return (
                <tr key={s.grant.id}>
                  <td>
                    <span className="pp-swatch" style={{ background: s.color }} />
                    <strong>{s.funder}</strong> {!s.firm && <Badge tone="gold">If awarded</Badge>}
                    <div className="pp-muted">
                      {s.grant.title} · {money(s.total)}
                      {s.grant.restriction === 'restricted' ? ' · restricted' : ''}
                    </div>
                  </td>
                  {proto.projects.map(p => {
                    const amt = amountOf(p.id, s.grant.id);
                    const warn = warnings(state, s, p);
                    return (
                      <td key={p.id} className="pp-num">
                        <input
                          type="number"
                          placeholder="—"
                          value={amt ?? ''}
                          aria-invalid={Boolean(amt) && warn.length > 0}
                          title={warn.join('\n') || undefined}
                          onChange={e =>
                            setProto(st =>
                              setAmount(st, p.id, s.grant.id, Number(e.target.value) || 0),
                            )
                          }
                        />
                        {Boolean(amt) && warn.length > 0 && (
                          <div className="pp-warn" style={{ fontSize: 'var(--text-2xs)' }}>
                            {warn[0]}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="pp-num pp-col-total">{money(committed)}</td>
                  <td className={`pp-num pp-col-total${free < 0 ? ' pp-over' : ''}`}>
                    {free < 0 ? `${money(-free)} over` : money(free)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Funded</td>
              {proto.projects.map(p => {
                const f = projectFunded(proto, p.id, firm);
                return (
                  <td key={p.id} className="pp-num">
                    {money(f.total)}
                    {f.hoped > 0 && <div className="pp-muted">{money(f.hoped)} pending</div>}
                  </td>
                );
              })}
              <td className="pp-col-total" colSpan={2} />
            </tr>
            <tr>
              <td>Still to find</td>
              {proto.projects.map(p => {
                const gap = p.budget - projectFunded(proto, p.id, firm).total;
                return (
                  <td key={p.id} className={`pp-num${gap > 0 ? ' pp-over' : ''}`}>
                    {gap > 0 ? money(gap) : gap < 0 ? `${money(-gap)} extra` : 'Covered'}
                  </td>
                );
              })}
              <td className="pp-col-total" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
