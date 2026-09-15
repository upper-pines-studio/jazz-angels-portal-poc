import type { CoreState, Program, StaffMember } from './types';

/** The day the demo story is written around. Tests pin to this. */
export const SEED_TODAY = '2026-09-13';

const STAFF: StaffMember[] = [
  { id: 's-barry', name: 'Barry Cogert', role: 'Program Director', teaches: true },
  { id: 's-denise', name: 'Denise Moreno', role: 'Office Administrator', teaches: false },
  { id: 's-albert', name: 'Albert Alva', role: 'Co-founder / Artistic Director', teaches: true },
  { id: 's-devon', name: 'Devon Price', role: 'Teaching Artist', teaches: true },
  { id: 's-renee', name: 'Renee Cole', role: 'Teaching Artist', teaches: true },
];

/** The person the POC treats as signed in. */
export const CURRENT_USER = STAFF[0];

const PROGRAMS: Program[] = [
  { id: 'studio-sessions', name: 'Studio Semester Sessions', short: 'Studio' },
  { id: 'in-school', name: 'In-School Program', short: 'In-school' },
  { id: 'homeschool', name: 'Homeschool Program', short: 'Homeschool' },
  { id: 'jazz-legacy', name: 'Jazz Legacy Program', short: 'Jazz Legacy' },
  { id: 'advanced-workshop', name: 'Advanced Jazz Workshop', short: 'Workshop' },
  { id: 'general-operating', name: 'General operating', short: 'Operating' },
];

/** Every module the office starts with switched on. */
export const DEFAULT_ENABLED_MODULES = ['grants', 'teaching', 'timesheets'];

/** A fresh copy of the shared nouns. Never mutate the result in place. */
export function makeCoreSeed(): CoreState {
  return {
    staff: JSON.parse(JSON.stringify(STAFF)),
    programs: JSON.parse(JSON.stringify(PROGRAMS)),
    settings: { fiscalYearStartMonth: 7, enabledModules: [...DEFAULT_ENABLED_MODULES] },
  };
}
