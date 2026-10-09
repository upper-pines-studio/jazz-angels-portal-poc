import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, Select } from '../../../../design-system';
import {
  activeOnly,
  fiscalYearChoices,
  isArchived,
  money,
  targetName,
  useCan,
  useStore,
} from '../../../../core';
import type { FundingTarget } from '../../../../core';
import { useToast } from '../../../../app/ToastHost';
import { ArchivedBadge } from '../../../../app/components/archive';
import {
  FundingBar,
  FundingWarnings,
  Swatch,
  fundingColour,
} from '../../../../app/components/funding';
import {
  SHARE_AMOUNT_REFUSAL,
  defaultShareYear,
  giveWarnings,
  grantGiving,
  programNames,
} from '../../domain';
import type { Grant, GrantGiving, GrantShare, ShareView } from '../../domain';
import { DeleteX } from '../grant/parts';
import { ChangeShareDialog, TakeBackDialog, dollars, isShareAmount } from './ShareDialogs';
import './shares.css';

/** Where a share's program year or project is on the Programs page. */
function sheetHref(share: GrantShare): string {
  return share.target.kind === 'program'
    ? `/programs/${share.target.programId}?fy=${share.target.fiscalYear}`
    : `/programs/projects/${share.target.projectId}`;
}

/** Why a grant that has shares gives nothing now, in a few words. */
function noneReason(grant: Grant): string {
  if (isArchived(grant)) return 'Archived, so its shares count toward nothing';
  if (grant.phase === 'declined') return 'Declined, so its shares count toward nothing';
  if (grant.phase === 'withdrawn') return 'Withdrawn, so its shares count toward nothing';
  return 'A prospect, so it has no money to give yet';
}

/**
 * "Where this grant's money goes" (decision 0006), under a grant's Award tab,
 * or its first tab before an award: each program year and project it gives
 * to, what it has not yet given, and Give to a program or project. A pending
 * grant gives against the amount requested, hatched as "If awarded". Warnings
 * show beside the share they are about, and never stop anything.
 *
 * Hidden for a grant that has no money to give and no shares (a prospect), and
 * from a role without "Grant shares".
 */
export function WhereMoneyGoes({ grant }: { grant: Grant }) {
  const { state } = useStore();
  const can = useCan();
  const mayGive = can('grant-shares', 'edit');
  const [changing, setChanging] = React.useState<GrantShare | null>(null);
  const [takingBack, setTakingBack] = React.useState<GrantShare | null>(null);
  const giving = grantGiving(state, grant.id);
  if (!can('grant-shares') || !giving) return null;
  if (giving.standing === 'none' && giving.shares.length === 0) return null;

  const over = giving.notYetGiven < 0;
  const restriction =
    grant.restriction === 'restricted'
      ? `Restricted to ${programNames(state, grant)}`
      : 'Unrestricted: any program or project';
  const standing =
    giving.standing === 'if-awarded'
      ? `Pending, so its shares count as “If awarded”, against the ${money(giving.total)} requested`
      : giving.standing === 'none'
        ? noneReason(grant)
        : undefined;
  // The bar and the rows share their colours, counted over the shares that count.
  const counting = giving.shares.filter(s => s.counts);
  const colourOf = (v: ShareView) => fundingColour(counting.indexOf(v));

  return (
    <Card
      title="Where this grant’s money goes"
      subtitle={standing ? `${restriction} · ${standing}` : restriction}
      action={
        <div className="ja-gives__left">
          <div className={over ? 'ja-gives__big ja-gives__big--over' : 'ja-gives__big'}>
            {money(Math.abs(giving.notYetGiven))}
          </div>
          <div className="ja-gives__of">
            {over ? 'more than the grant has, of ' : 'not yet given, of '}
            {money(giving.total)}
          </div>
        </div>
      }
    >
      <div className="ja-gives">
        {giving.shares.length > 0 && (
          <FundingBar
            parts={counting.map(v => ({
              key: v.share.id,
              amount: v.share.amount,
              colour: colourOf(v),
              ifAwarded: giving.standing !== 'awarded',
              label: `${v.name}, ${money(v.share.amount)}`,
            }))}
            max={giving.total}
            label={`${money(giving.given)} given of ${money(giving.total)}`}
          />
        )}
        <FundingWarnings messages={giving.warnings.map(w => w.message)} />

        {giving.shares.length === 0 ? (
          <p className="ja-shares__empty">
            {mayGive
              ? 'None of this grant’s money is given out yet. Give it to a program’s year or a project, and it shows on the Programs page.'
              : 'None of this grant’s money is given out yet.'}
          </p>
        ) : (
          <ul className="ja-shares__rows" aria-label="Shares">
            {giving.shares.map(v => (
              <li
                key={v.share.id}
                className={v.counts ? 'ja-gives__row' : 'ja-gives__row ja-gives__row--off'}
              >
                <div className="ja-shares__who">
                  <div className="ja-shares__line">
                    {v.counts && (
                      <Swatch colour={colourOf(v)} ifAwarded={giving.standing !== 'awarded'} />
                    )}
                    <Link to={sheetHref(v.share)} className="ja-shares__funder">
                      {v.name}
                    </Link>
                    {v.share.target.kind === 'project' && (
                      <span className="ja-shares__detail">project</span>
                    )}
                    {v.archived && <ArchivedBadge />}
                  </div>
                  {v.archived && (
                    <p className="ja-shares__note">
                      The project is archived, so this counts toward nothing given.
                    </p>
                  )}
                  <FundingWarnings messages={v.warnings.map(w => w.message)} />
                </div>
                <span className="ja-shares__amount">{money(v.share.amount)}</span>
                {mayGive ? (
                  <span className="ja-shares__actions">
                    <Button variant="link" size="sm" onClick={() => setChanging(v.share)}>
                      Change
                    </Button>
                    <DeleteX
                      label={`Take back from ${v.name}`}
                      onClick={() => setTakingBack(v.share)}
                    />
                  </span>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}

        {mayGive && giving.standing !== 'none' && <Give giving={giving} />}
      </div>

      {changing && <ChangeShareDialog share={changing} onClose={() => setChanging(null)} />}
      {takingBack && <TakeBackDialog share={takingBack} onClose={() => setTakingBack(null)} />}
    </Card>
  );
}

/** Give to a program or project: where, the year for a program, the amount, and Give. */
function Give({ giving }: { giving: GrantGiving }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const { grant } = giving;
  const [to, setTo] = React.useState('');
  const [year, setYear] = React.useState(() => defaultShareYear(state, grant, today));
  const [text, setText] = React.useState('');
  const [showErrors, setShowErrors] = React.useState(false);

  const programs = activeOnly(state.core.programs);
  const projects = activeOnly(state.core.projects);
  const [kind, id] = to.split(':');
  const target: FundingTarget | undefined =
    kind === 'program'
      ? { kind: 'program', programId: id, fiscalYear: year }
      : kind === 'project'
        ? { kind: 'project', projectId: id }
        : undefined;
  const amount = dollars(text);
  const valid = isShareAmount(amount);
  const warnings =
    target && valid
      ? giveWarnings(state, { grantId: grant.id, target, amount }).map(w => w.message)
      : [];
  const years = fiscalYearChoices(state, today).map(y => y.label);
  if (!years.includes(year)) years.unshift(year);

  const pick = (next: string) => {
    setTo(next);
    setShowErrors(false);
    if (!text && giving.notYetGiven > 0) setText(String(giving.notYetGiven));
  };

  const give = () => {
    if (!target || !valid) {
      setShowErrors(true);
      return;
    }
    actions.grants.giveShare({ grantId: grant.id, target, amount });
    toast({
      tone: warnings.length > 0 ? 'warning' : 'success',
      title: 'Money given',
      message: `${money(amount)} to ${targetName(state, target)}.${
        warnings.length > 0 ? ` ${warnings.join('. ')}.` : ''
      }`,
    });
    setTo('');
    setText('');
    setShowErrors(false);
  };

  if (programs.length === 0 && projects.length === 0) {
    return (
      <p className="ja-shares__empty">
        There are no programs to give to yet. Add one on the Programs page.
      </p>
    );
  }

  return (
    <div className="ja-shares__give">
      <div className="ja-shares__giverow">
        <Field
          label="Give to a program or project"
          error={showErrors && !target ? 'Pick where the money goes.' : undefined}
          style={{ flex: '1 1 240px', minWidth: 0 }}
        >
          <Select
            value={to}
            options={[
              { value: '', label: 'Choose a program or project…' },
              ...programs.map(p => ({ value: `program:${p.id}`, label: p.name })),
              ...projects.map(p => ({ value: `project:${p.id}`, label: `${p.name} (project)` })),
            ]}
            onChange={e => pick(e.target.value)}
          />
        </Field>
        {kind === 'program' && (
          <Field label="Fiscal year" style={{ flex: '0 1 110px', minWidth: 0 }}>
            <Select value={year} options={years} onChange={e => setYear(e.target.value)} />
          </Field>
        )}
        <Field
          label="Amount"
          error={showErrors && target && !valid ? SHARE_AMOUNT_REFUSAL : undefined}
          style={{ flex: '0 1 150px', minWidth: 0 }}
        >
          <Input
            value={text}
            prefix="$"
            placeholder={giving.notYetGiven > 0 ? String(giving.notYetGiven) : undefined}
            onChange={e => setText(e.target.value)}
          />
        </Field>
        <span className="ja-shares__go">
          <Button variant="secondary" onClick={give}>
            Give
          </Button>
        </span>
      </div>
      <FundingWarnings messages={warnings} />
    </div>
  );
}
