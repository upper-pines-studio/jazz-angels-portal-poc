import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fiscalYear,
  fiscalYearChoices,
  fiscalYearNamed,
  fundingSummary,
  meetsAny,
  targetBudget,
  useStore,
} from '../../../core';
import type {
  FiscalYear,
  FundingContribution,
  FundingSource,
  FundingSummary,
  FundingTarget,
  PortalState,
  Role,
} from '../../../core';
import { MODULES } from '../../../modules';
import { fundingColour } from '../../components/funding';
import type { BarPart } from '../../components/funding';

/**
 * What pays toward a program's year or a project, asked of the registry
 * (decision 0006): each module that is on and whose `funding` the signed-in
 * role may see. App reads the manifests and never a module's insides.
 */
export function fundingContributions(
  state: PortalState,
  role: Role,
): Array<FundingContribution & { moduleId: string }> {
  const enabled = state.core.settings.enabledModules;
  return MODULES.flatMap(m =>
    m.funding && enabled.includes(m.id) && meetsAny(role, m.funding.requires)
      ? [{ ...m.funding, moduleId: m.id }]
      : [],
  );
}

/** Every source paying toward the target, module by module, and the sums. */
export function fundingOf(
  state: PortalState,
  role: Role,
  target: FundingTarget,
): { sources: FundingSource[]; summary: FundingSummary } {
  const sources = fundingContributions(state, role).flatMap(c => c.sources(state, target));
  return { sources, summary: fundingSummary(targetBudget(state, target), sources) };
}

/**
 * The bar's segments, one per source, coloured in the order the sources come.
 * A module's panel colours its rows by the same order, so a row's swatch
 * matches its segment.
 */
export function barParts(sources: FundingSource[]): BarPart[] {
  return sources.map((s, i) => ({
    key: s.id,
    amount: s.amount,
    colour: fundingColour(i),
    ifAwarded: s.ifAwarded,
    label: `${s.label}, ${s.ifAwarded ? 'if awarded' : 'awarded'}`,
  }));
}

/**
 * The fiscal year the page shows, held in the URL as `?fy=FY28` so a link
 * keeps it. Unset, or a name that is not a year, is this fiscal year. The
 * choices are this year, the next, and every year with a budget or a project.
 */
export function useFiscalYearParam(): {
  fy: FiscalYear;
  choices: FiscalYear[];
  setFy: (label: string) => void;
} {
  const { state, today } = useStore();
  const [params, setParams] = useSearchParams();
  const startMonth = state.core.settings.fiscalYearStartMonth;
  const current = fiscalYear(today, startMonth);
  const asked = params.get('fy');
  const fy = (asked && fiscalYearNamed(asked, startMonth)) || current;
  const choices = fiscalYearChoices(state, today);
  if (!choices.some(c => c.label === fy.label)) {
    choices.push(fy);
    choices.sort((a, b) => a.start.localeCompare(b.start));
  }
  const setFy = React.useCallback(
    (label: string) =>
      setParams(
        q => {
          const next = new URLSearchParams(q);
          if (label === current.label) next.delete('fy');
          else next.set('fy', label);
          return next;
        },
        { replace: true },
      ),
    [setParams, current.label],
  );
  return { fy, choices, setFy };
}
