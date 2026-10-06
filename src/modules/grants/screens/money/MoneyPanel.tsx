import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Icon } from '../../../../design-system';
import { useStore } from '../../../../core';
import { expensesMissingBackup, funderById, percent, transactionCounts } from '../../domain';
import { PACE_COLOR, PaceBar, PaceMark } from './shared';
import { pacedGrants, shortFunder } from './spend';
import './spenddown.css';

/** The dashboard's money card: where each grant stands against its pace. */
export function MoneyPanel() {
  const nav = useNavigate();
  const { state, today } = useStore();
  const rows = pacedGrants(state, today);
  if (rows.length === 0) return null;

  const toAssign = transactionCounts(state)['to-assign'];
  const missing = expensesMissingBackup(state);
  const firstMissingGrant = missing[0]?.grantId;

  return (
    <Card
      title="Money"
      subtitle="Spending against the grant period"
      padding="var(--space-3) var(--space-5) var(--space-4)"
    >
      <div className="mp-rows">
        {rows.map(({ grant, pace }) => {
          const funder = funderById(state, grant.funderId)?.name ?? '';
          const gone =
            pace.status === 'period-ended' ? 'period over' : `${percent(pace.elapsed)} gone`;
          return (
            <button
              key={grant.id}
              type="button"
              className="mp-row"
              onClick={() => nav(`/spend-down#${grant.id}`)}
              aria-label={`${funder}, ${grant.title}: ${percent(pace.used)} used, ${gone}. Open in Spend-down.`}
            >
              <span className="mp-row__head">
                {funder && <span className="mp-row__funder">{shortFunder(funder)}</span>}
                <span className="mp-row__title">{grant.title}</span>
              </span>
              <PaceBar used={pace.used} elapsed={pace.elapsed} color={PACE_COLOR[pace.status]} />
              <span className="mp-row__foot">
                <span className="mp-row__nums">
                  {percent(pace.used)} used · {gone}
                </span>
                <PaceMark status={pace.status} />
              </span>
            </button>
          );
        })}
      </div>
      {(toAssign > 0 || (missing.length > 0 && firstMissingGrant)) && (
        <div className="mp-links">
          {toAssign > 0 && (
            <Link to="/transactions?tab=to-assign">
              <Icon name="arrow-left-right" size={14} />
              {toAssign} {toAssign === 1 ? 'transaction' : 'transactions'} to assign
            </Link>
          )}
          {missing.length > 0 && firstMissingGrant && (
            <Link to={`/grants/${firstMissingGrant}?tab=expenses&backup=missing`}>
              <Icon name="receipt" size={14} />
              {missing.length} {missing.length === 1 ? 'expense' : 'expenses'} missing a receipt
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
