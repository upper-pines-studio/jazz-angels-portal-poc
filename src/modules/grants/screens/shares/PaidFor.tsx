import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Field, Input, Select } from '../../../../design-system';
import {
  fundingSummary,
  isArchived,
  money,
  programName,
  projectById,
  targetBudget,
  targetName,
  useCan,
  useStore,
} from '../../../../core';
import type { FundingTarget } from '../../../../core';
import { useToast } from '../../../../app/ToastHost';
import {
  FundingLabel,
  FundingWarnings,
  Swatch,
  fundingColour,
} from '../../../../app/components/funding';
import {
  SHARE_AMOUNT_REFUSAL,
  fundingFor,
  giveWarnings,
  givingGrants,
  shareTo,
} from '../../domain';
import type { GrantShare } from '../../domain';
import { DeleteX } from '../grant/parts';
import {
  ChangeShareDialog,
  TakeBackDialog,
  dollars,
  funderOf,
  isShareAmount,
} from './ShareDialogs';
import './shares.css';

/**
 * "Paid for by" on a program's or a project's sheet (decision 0006): one row
 * per grant giving to it, with what that grant has not yet given, and Add
 * money from a grant. The grants module's part of the Programs page, handed to
 * it through the manifest's `funding.panel`. Its rows come in `fundingFor`'s
 * order, the order the sheet's bar draws them, so a swatch matches its segment.
 */
export function PaidFor({ target }: { target: FundingTarget }) {
  const { state } = useStore();
  const mayGive = useCan()('grant-shares', 'edit');
  const [changing, setChanging] = React.useState<GrantShare | null>(null);
  const [takingBack, setTakingBack] = React.useState<GrantShare | null>(null);
  const sources = fundingFor(state, target);
  const project = target.kind === 'project' ? projectById(state, target.projectId) : undefined;
  const where =
    target.kind === 'program'
      ? `${programName(state, target.programId)} in ${target.fiscalYear}`
      : 'this project';

  return (
    <div className="ja-shares">
      <FundingLabel>Paid for by</FundingLabel>
      {sources.length === 0 ? (
        <p className="ja-shares__empty">No grant money toward {where} yet.</p>
      ) : (
        <ul className="ja-shares__rows">
          {sources.map((s, i) => {
            const share = shareTo(state, s.id, target);
            return (
              <li key={s.id} className="ja-shares__row">
                <div className="ja-shares__who">
                  <div className="ja-shares__line">
                    <Swatch colour={fundingColour(i)} ifAwarded={s.ifAwarded} />
                    <Link to={s.href} className="ja-shares__funder">
                      {s.label}
                    </Link>
                    <span className="ja-shares__detail">· {s.detail}</span>
                    {s.ifAwarded && <Badge tone="gold">If awarded</Badge>}
                  </div>
                  <FundingWarnings messages={s.warnings} />
                </div>
                <span className="ja-shares__amount">{money(s.amount)}</span>
                <span className="ja-shares__left">
                  {money(Math.max(0, s.notYetGiven))} of {money(s.total)} not yet given
                </span>
                {mayGive && share ? (
                  <span className="ja-shares__actions">
                    <Button variant="link" size="sm" onClick={() => setChanging(share)}>
                      Change
                    </Button>
                    <DeleteX
                      label={`Take back ${s.label}'s money`}
                      onClick={() => setTakingBack(share)}
                    />
                  </span>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mayGive &&
        (isArchived(project) ? (
          <p className="ja-shares__empty">
            This project is archived. Restore it to add grant money to it.
          </p>
        ) : (
          <AddMoney target={target} paying={sources.map(s => s.id)} />
        ))}

      {changing && <ChangeShareDialog share={changing} onClose={() => setChanging(null)} />}
      {takingBack && <TakeBackDialog share={takingBack} onClose={() => setTakingBack(null)} />}
    </div>
  );
}

/** Add money from a grant: a grant not yet paying for this, an amount, and Add. */
function AddMoney({ target, paying }: { target: FundingTarget; paying: string[] }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [grantId, setGrantId] = React.useState('');
  const [text, setText] = React.useState('');
  const [showErrors, setShowErrors] = React.useState(false);

  const all = givingGrants(state);
  const choices = all.filter(g => !paying.includes(g.grant.id));
  if (all.length === 0) {
    return (
      <p className="ja-shares__empty">
        A grant's money can be given here once the grant reaches LOI. None has yet.
      </p>
    );
  }
  if (choices.length === 0) {
    return <p className="ja-shares__empty">Every grant with money to give is already here.</p>;
  }

  const amount = dollars(text);
  const valid = isShareAmount(amount);
  const warnings =
    grantId && valid ? giveWarnings(state, { grantId, target, amount }).map(w => w.message) : [];

  const pick = (id: string) => {
    setGrantId(id);
    setShowErrors(false);
    const giving = all.find(g => g.grant.id === id);
    if (!giving) return;
    // Start from what the grant has left, up to what this still needs.
    const summary = fundingSummary(targetBudget(state, target), fundingFor(state, target));
    const left = Math.max(0, giving.notYetGiven);
    const suggest = summary.budget > 0 ? Math.min(left, summary.stillToFind) : left;
    setText(suggest > 0 ? String(suggest) : '');
  };

  const add = () => {
    if (!grantId || !valid) {
      setShowErrors(true);
      return;
    }
    actions.grants.giveShare({ grantId, target, amount });
    toast({
      tone: warnings.length > 0 ? 'warning' : 'success',
      title: 'Money added',
      message: `${money(amount)} from ${funderOf(state, grantId)} to ${targetName(state, target)}.${
        warnings.length > 0 ? ` ${warnings.join('. ')}.` : ''
      }`,
    });
    setGrantId('');
    setText('');
    setShowErrors(false);
  };

  return (
    <div className="ja-shares__give">
      <div className="ja-shares__giverow">
        <Field
          label="Add money from a grant"
          error={showErrors && !grantId ? 'Pick the grant the money comes from.' : undefined}
          style={{ flex: '1 1 260px', minWidth: 0 }}
        >
          <Select
            value={grantId}
            options={[
              { value: '', label: 'Choose a grant…' },
              ...choices.map(g => ({
                value: g.grant.id,
                label: `${funderOf(state, g.grant.id)} · ${g.grant.title} · ${money(Math.max(0, g.notYetGiven))} not yet given${
                  g.standing === 'if-awarded' ? ' (if awarded)' : ''
                }`,
              })),
            ]}
            onChange={e => pick(e.target.value)}
          />
        </Field>
        <Field
          label="Amount"
          error={showErrors && grantId && !valid ? SHARE_AMOUNT_REFUSAL : undefined}
          style={{ flex: '0 1 150px', minWidth: 0 }}
        >
          <Input value={text} prefix="$" onChange={e => setText(e.target.value)} />
        </Field>
        <span className="ja-shares__go">
          <Button variant="secondary" onClick={add}>
            Add
          </Button>
        </span>
      </div>
      <FundingWarnings messages={warnings} />
    </div>
  );
}
