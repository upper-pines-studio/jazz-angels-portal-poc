import React from 'react';
import { Button, Dialog, Field, Input, Select } from '../../../../design-system';
import { fiscalYearChoices, money, programName, targetName, useStore } from '../../../../core';
import type { FundingTarget, PortalState } from '../../../../core';
import { useToast } from '../../../../app/ToastHost';
import { FundingWarnings } from '../../../../app/components/funding';
import {
  SHARE_AMOUNT_REFUSAL,
  changeProblem,
  funderById,
  funderShortName,
  giveWarnings,
  grantById,
} from '../../domain';
import type { GrantShare } from '../../domain';

/**
 * Change a share and Take back a share, from either side: a grant's "Where
 * this grant's money goes" and a sheet's "Paid for by" (decision 0006).
 */

/** A whole-dollar amount typed into a field, or NaN when it is not one. */
export function dollars(text: string): number {
  const clean = text.replace(/[$,\s]/g, '');
  return clean === '' ? NaN : Number(clean);
}

/** True for whole dollars above $0, what a share must be. */
export function isShareAmount(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** "Herb Alpert", the funder a grant is from, short. */
export function funderOf(state: PortalState, grantId: string): string {
  const grant = grantById(state, grantId);
  return funderShortName(funderById(state, grant?.funderId ?? '')?.name, true);
}

/** Change the share: its amount, and for a program the fiscal year it counts toward. */
export function ChangeShareDialog({ share, onClose }: { share: GrantShare; onClose: () => void }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [text, setText] = React.useState(String(share.amount));
  const [year, setYear] = React.useState(
    share.target.kind === 'program' ? share.target.fiscalYear : '',
  );
  const [showErrors, setShowErrors] = React.useState(false);
  const amount = dollars(text);
  const grant = grantById(state, share.grantId);
  const moved: FundingTarget =
    share.target.kind === 'program' ? { ...share.target, fiscalYear: year } : share.target;
  const problem = !isShareAmount(amount)
    ? SHARE_AMOUNT_REFUSAL
    : changeProblem(state, share.id, {
        amount,
        fiscalYear: share.target.kind === 'program' ? year : undefined,
      });
  const warnings = isShareAmount(amount)
    ? giveWarnings(state, { grantId: share.grantId, target: moved, amount }, share).map(
        w => w.message,
      )
    : [];
  const years = fiscalYearChoices(state, today).map(y => y.label);
  if (year && !years.includes(year)) years.unshift(year);

  const save = () => {
    if (problem) {
      setShowErrors(true);
      return;
    }
    actions.grants.changeShare(share.id, {
      amount,
      fiscalYear: share.target.kind === 'program' ? year : undefined,
    });
    toast({
      tone: warnings.length > 0 ? 'warning' : 'success',
      title: 'Share changed',
      message: `${money(amount)} from ${funderOf(state, share.grantId)} to ${targetName(state, moved)}.${
        warnings.length > 0 ? ` ${warnings.join('. ')}.` : ''
      }`,
    });
    onClose();
  };

  return (
    <Dialog
      open
      width={460}
      title="Change the share"
      description={`What ${grant?.title ?? 'this grant'} gives to ${
        share.target.kind === 'program'
          ? programName(state, share.target.programId)
          : targetName(state, share.target)
      }.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save share
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className={share.target.kind === 'program' ? 'ja-grid-2' : undefined}>
          <Field label="Amount" required error={showErrors ? problem : undefined}>
            <Input
              value={text}
              prefix="$"
              onChange={e => setText(e.target.value)}
              style={{ width: '100%' }}
            />
          </Field>
          {share.target.kind === 'program' && (
            <Field label="Fiscal year" hint="The year of the program's budget it counts toward.">
              <Select value={year} options={years} onChange={e => setYear(e.target.value)} />
            </Field>
          )}
        </div>
        <FundingWarnings messages={warnings} />
      </div>
    </Dialog>
  );
}

/** Take the share back: it goes back to the grant's money not yet given. */
export function TakeBackDialog({ share, onClose }: { share: GrantShare; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const grant = grantById(state, share.grantId);
  const name = targetName(state, share.target);
  return (
    <Dialog
      open
      width={460}
      title={`Take back ${money(share.amount)} from ${name}?`}
      description={`It goes back to what ${grant?.title ?? 'the grant'} has not yet given, and the grant's activity notes it. You can give it again.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              actions.grants.takeBackShare(share.id);
              toast({
                tone: 'success',
                title: 'Share taken back',
                message: `${money(share.amount)} is back with ${funderOf(state, share.grantId)}, not yet given.`,
              });
              onClose();
            }}
          >
            Take back
          </Button>
        </>
      }
    />
  );
}
