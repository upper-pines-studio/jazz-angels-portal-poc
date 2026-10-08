/**
 * PROTOTYPE — throwaway. Projects that draw money from several grants.
 * Everything here lives in memory (useState in ProjectsPrototype); nothing is saved.
 */
import { activeOnly, dateLong, programName } from '../../../../core';
import type { PortalState, ProgramId } from '../../../../core';
import { funderById, funderShortName } from '../../domain';
import type { Grant } from '../../domain';

export interface Project {
  id: string;
  name: string;
  program: ProgramId;
  start: string;
  end: string;
  /** What the project costs, whole dollars. */
  budget: number;
}

/** This much of this grant is set aside for this project. */
export interface ProjectAllocation {
  id: string;
  projectId: string;
  grantId: string;
  amount: number;
}

export interface ProtoState {
  projects: Project[];
  allocations: ProjectAllocation[];
}

/** A grant that money can come from: awarded (firm) or still pending (hoped for). */
export interface Source {
  grant: Grant;
  funder: string;
  total: number;
  firm: boolean;
  color: string;
}

const FIRM_PHASES = ['awarded', 'active', 'reporting'];
const HOPED_PHASES = ['loi', 'applying', 'submitted'];
const COLORS = [
  'var(--blue-500)',
  'var(--teal-500)',
  'var(--gold-500)',
  'var(--olive-500)',
  'var(--blue-300)',
  'var(--teal-300)',
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

export const SEED: ProtoState = {
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
  allocations: [
    {
      id: 'a1',
      projectId: 'p-instruments',
      grantId: 'g-lb-community-foundation-2026',
      amount: 2000,
    },
    { id: 'a2', projectId: 'p-instruments', grantId: 'g-herb-alpert-2026', amount: 3000 },
    { id: 'a3', projectId: 'p-instruments', grantId: 'g-la-county-2026', amount: 1000 },
    { id: 'a4', projectId: 'p-showcase', grantId: 'g-herb-alpert-2026', amount: 6000 },
    { id: 'a5', projectId: 'p-showcase', grantId: 'g-lb-community-foundation-2026', amount: 1200 },
    { id: 'a6', projectId: 'p-intensive', grantId: 'g-herb-alpert-2026', amount: 8000 },
    { id: 'a7', projectId: 'p-intensive', grantId: 'g-arts-council-lb-2026', amount: 4000 },
  ],
};

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function projectFunded(s: ProtoState, projectId: string, firmOnly: Set<string>) {
  const rows = s.allocations.filter(a => a.projectId === projectId);
  const firm = sum(rows.filter(a => firmOnly.has(a.grantId)).map(a => a.amount));
  const hoped = sum(rows.filter(a => !firmOnly.has(a.grantId)).map(a => a.amount));
  return { firm, hoped, total: firm + hoped };
}

export function grantCommitted(s: ProtoState, grantId: string) {
  return sum(s.allocations.filter(a => a.grantId === grantId).map(a => a.amount));
}

/** Why this grant's money may not be usable on this project. */
export function warnings(state: PortalState, source: Source, project: Project): string[] {
  const out: string[] = [];
  const g = source.grant;
  if (g.restriction === 'restricted' && g.program !== project.program) {
    out.push(`Restricted to ${programName(state, g.program)}`);
  }
  const { periodStart, periodEnd } = g.dates;
  if (periodEnd && project.start > periodEnd) {
    out.push(`Grant period ends before the project starts (${dateLong(periodEnd)})`);
  } else if (periodEnd && project.end > periodEnd) {
    out.push(`Project runs past the grant period (ends ${dateLong(periodEnd)})`);
  }
  if (periodStart && project.end < periodStart) {
    out.push(`Project ends before the grant period starts (${dateLong(periodStart)})`);
  }
  return out;
}

export function firmIds(list: Source[]) {
  return new Set(list.filter(s => s.firm).map(s => s.grant.id));
}

let n = 100;
export const protoId = (prefix: string) => `${prefix}${n++}`;

/** The one state change every variant uses: set this grant's share of this project. */
export function setAmount(
  s: ProtoState,
  projectId: string,
  grantId: string,
  amount: number,
): ProtoState {
  const rest = s.allocations.filter(a => !(a.projectId === projectId && a.grantId === grantId));
  if (!amount) return { ...s, allocations: rest };
  const existing = s.allocations.find(a => a.projectId === projectId && a.grantId === grantId);
  return {
    ...s,
    allocations: [...rest, { id: existing?.id ?? protoId('a'), projectId, grantId, amount }],
  };
}
