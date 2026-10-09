/**
 * PROTOTYPE — throwaway. A grant's money handed out in shares to programs (a
 * budget each fiscal year) and to projects (one-off work under a program).
 * Everything lives in memory in the little store at the bottom; a reload
 * starts over. Nothing is saved.
 */
import React from 'react';
import { activeOnly, dateLong, fiscalYear, programName } from '../../../../core';
import type { PortalState, ProgramId } from '../../../../core';
import { funderById, funderShortName } from '../../domain';
import type { Grant } from '../../domain';

/** One-off work under a program: the Spring Showcase, an instrument refresh. */
export interface Project {
  id: string;
  name: string;
  program: ProgramId;
  start: string;
  end: string;
  /** What it costs, whole dollars. */
  budget: number;
}

/** `program:<id>` or `project:<id>`: where a share of a grant goes. */
export type TargetKey = string;

/** This much of this grant goes to this program or project. */
export interface Share {
  id: string;
  grantId: string;
  target: TargetKey;
  amount: number;
}

export interface ProtoState {
  /** Each program's budget for the fiscal year shown. */
  programBudgets: Record<ProgramId, number>;
  projects: Project[];
  shares: Share[];
  /** A restricted grant's programs. Today a grant names one; the director says it can be several. */
  restrictedTo: Record<string, ProgramId[]>;
}

/** A grant that money can come from: awarded (firm) or still pending (hoped for). */
export interface Source {
  grant: Grant;
  funder: string;
  total: number;
  firm: boolean;
  color: string;
}

/** A program or a project, as the sheet and the grant card see it. */
export interface Target {
  key: TargetKey;
  kind: 'program' | 'project';
  name: string;
  program: ProgramId;
  start: string;
  end: string;
  budget: number;
  /** An archived program, listed only with Show archived. */
  archived?: boolean;
}

const FIRM_PHASES = ['awarded', 'active', 'reporting'];
const HOPED_PHASES = ['loi', 'applying', 'submitted'];
export const COLORS = [
  'var(--blue-500)',
  'var(--teal-500)',
  'var(--gold-500)',
  'var(--olive-500)',
  'var(--blue-300)',
  'var(--teal-300)',
  'var(--gold-300)',
  'var(--olive-300)',
];

export function sources(state: PortalState): Source[] {
  return activeOnly(state.grants.grants)
    .filter(g => FIRM_PHASES.includes(g.phase) || HOPED_PHASES.includes(g.phase))
    .map(g => {
      const firm = FIRM_PHASES.includes(g.phase);
      return {
        grant: g,
        funder: funderShortName(funderById(state, g.funderId)?.name, true),
        total: (firm ? g.amountAwarded : g.amountRequested) ?? 0,
        firm,
      };
    })
    .filter(s => s.total > 0)
    .sort((a, b) => Number(b.firm) - Number(a.firm) || b.total - a.total)
    .map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
}

export const programKey = (id: ProgramId) => `program:${id}`;
export const projectKey = (id: string) => `project:${id}`;

export function fyOf(state: PortalState, today: string) {
  return fiscalYear(today, state.core.settings.fiscalYearStartMonth);
}

/** Every program, then every project, as targets for the fiscal year. */
export function targets(
  state: PortalState,
  s: ProtoState,
  today: string,
  includeArchived = false,
): Target[] {
  const fy = fyOf(state, today);
  const programs = includeArchived ? state.core.programs : activeOnly(state.core.programs);
  return [
    ...programs.map(p => ({
      key: programKey(p.id),
      kind: 'program' as const,
      name: p.name,
      program: p.id,
      start: fy.start,
      end: fy.end,
      budget: s.programBudgets[p.id] ?? 0,
      archived: Boolean(p.archivedAt),
    })),
    ...s.projects.map(p => ({
      key: projectKey(p.id),
      kind: 'project' as const,
      name: p.name,
      program: p.program,
      start: p.start,
      end: p.end,
      budget: p.budget,
    })),
  ];
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function funded(s: ProtoState, target: TargetKey, firm: Set<string>) {
  const rows = s.shares.filter(x => x.target === target);
  const fromFirm = sum(rows.filter(x => firm.has(x.grantId)).map(x => x.amount));
  const fromHoped = sum(rows.filter(x => !firm.has(x.grantId)).map(x => x.amount));
  return { firm: fromFirm, hoped: fromHoped, total: fromFirm + fromHoped };
}

export function given(s: ProtoState, grantId: string) {
  return sum(s.shares.filter(x => x.grantId === grantId).map(x => x.amount));
}

export function firmIds(list: Source[]) {
  return new Set(list.filter(x => x.firm).map(x => x.grant.id));
}

/** The programs a restricted grant may pay for; undefined when it is unrestricted. */
export function restriction(s: ProtoState, grant: Grant): ProgramId[] | undefined {
  if (grant.restriction !== 'restricted') return undefined;
  return s.restrictedTo[grant.id] ?? [grant.program];
}

/** Why this grant's money may not be usable on this program or project. */
export function warnings(state: PortalState, s: ProtoState, grant: Grant, t: Target): string[] {
  const out: string[] = [];
  const allowed = restriction(s, grant);
  if (allowed && !allowed.includes(t.program)) {
    out.push(`Restricted to ${allowed.map(id => programName(state, id)).join(' and ')}`);
  }
  const { periodStart, periodEnd } = grant.dates;
  if (periodEnd && t.start > periodEnd) {
    out.push(`The grant period ends ${dateLong(periodEnd)}, before this starts`);
  } else if (periodEnd && t.end > periodEnd && t.kind === 'project') {
    out.push(`Runs past the grant period, which ends ${dateLong(periodEnd)}`);
  }
  if (periodStart && t.end < periodStart) {
    out.push(`Ends before the grant period starts, ${dateLong(periodStart)}`);
  }
  return out;
}

let n = 100;
export const protoId = (prefix: string) => `${prefix}${n++}`;

/** Set this grant's share of this target; 0 takes it away. */
export function setShare(
  s: ProtoState,
  grantId: string,
  target: TargetKey,
  amount: number,
): ProtoState {
  const existing = s.shares.find(x => x.grantId === grantId && x.target === target);
  if (!amount) return { ...s, shares: s.shares.filter(x => x !== existing) };
  if (existing) return { ...s, shares: s.shares.map(x => (x === existing ? { ...x, amount } : x)) };
  return { ...s, shares: [...s.shares, { id: protoId('sh'), grantId, target, amount }] };
}

const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const PORT = 'g-port-of-long-beach-2026';
const PARSONS = 'g-parsons-2026';
const ACLB = 'g-arts-council-lb-2026';

export const SEED: ProtoState = {
  programBudgets: {
    'general-operating': 20000,
    'studio-sessions': 18000,
    'in-school': 15000,
    homeschool: 6000,
    'jazz-legacy': 10000,
    'advanced-workshop': 8000,
  },
  projects: [
    {
      id: 'p-instruments',
      name: 'Instrument library refresh',
      program: 'studio-sessions',
      start: '2026-09-01',
      end: '2026-12-15',
      budget: 6500,
    },
    {
      id: 'p-showcase',
      name: 'Spring Showcase 2027',
      program: 'studio-sessions',
      start: '2027-03-01',
      end: '2027-05-15',
      budget: 9000,
    },
    {
      id: 'p-intensive',
      name: 'Summer Jazz Intensive',
      program: 'advanced-workshop',
      start: '2027-06-21',
      end: '2027-07-30',
      budget: 14000,
    },
  ],
  shares: [
    { id: 's1', grantId: HA, target: 'program:general-operating', amount: 15000 },
    { id: 's2', grantId: HA, target: 'program:studio-sessions', amount: 10000 },
    { id: 's3', grantId: HA, target: 'program:in-school', amount: 6000 },
    { id: 's4', grantId: HA, target: 'project:p-instruments', amount: 3000 },
    { id: 's5', grantId: HA, target: 'project:p-showcase', amount: 6000 },
    { id: 's6', grantId: HA, target: 'project:p-intensive', amount: 8000 },
    { id: 's7', grantId: LBCF, target: 'program:studio-sessions', amount: 5300 },
    { id: 's8', grantId: LBCF, target: 'project:p-instruments', amount: 2000 },
    { id: 's9', grantId: LBCF, target: 'project:p-showcase', amount: 1200 },
    { id: 's10', grantId: PORT, target: 'program:in-school', amount: 9000 },
    { id: 's11', grantId: PORT, target: 'program:homeschool', amount: 4000 },
    { id: 's12', grantId: PARSONS, target: 'program:jazz-legacy', amount: 10000 },
    { id: 's13', grantId: ACLB, target: 'project:p-intensive', amount: 4000 },
  ],
  // One grant restricted to two programs, as the director describes.
  restrictedTo: { [PORT]: ['in-school', 'homeschool'] },
};

// --- A tiny in-memory store, so the Programs page and a grant's page share one state.

let current: ProtoState = SEED;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const update = (fn: (s: ProtoState) => ProtoState) => {
  current = fn(current);
  listeners.forEach(l => l());
};

export function useProto(): [ProtoState, typeof update] {
  return [React.useSyncExternalStore(subscribe, () => current), update];
}
