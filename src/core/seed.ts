import { USERS } from './auth';
import type {
  AppSettings,
  CoreState,
  Organization,
  Program,
  ProgramBudget,
  Project,
  StaffMember,
  Venue,
} from './types';

/** The day the demo story is written around. Tests pin to this. */
export const SEED_TODAY = '2026-09-13';

/**
 * The staff. The first five run the demo story; the last five exist so every
 * role in decision 0001 has a person to sign in as (see `USERS` in auth.ts).
 */
const STAFF: StaffMember[] = [
  {
    id: 's-barry',
    name: 'Barry Cogert',
    title: 'Program Director',
    role: 'director',
    teaches: true,
  },
  {
    id: 's-denise',
    name: 'Denise Moreno',
    title: 'Office Administrator',
    role: 'director',
    teaches: false,
  },
  {
    id: 's-albert',
    name: 'Albert Alva',
    title: 'Co-founder / Artistic Director',
    role: 'teacher',
    teaches: true,
  },
  { id: 's-devon', name: 'Devon Price', title: 'Teaching Artist', role: 'teacher', teaches: true },
  { id: 's-renee', name: 'Renee Cole', title: 'Teaching Artist', role: 'teacher', teaches: true },
  {
    id: 's-tess',
    name: 'Tess Holloway',
    title: 'Office Intern',
    role: 'assistant',
    teaches: false,
  },
  {
    id: 's-gwen',
    name: 'Gwen Kimura',
    title: 'Systems Administrator',
    role: 'admin',
    teaches: false,
  },
  {
    id: 's-keisha',
    name: 'Keisha Monroe',
    title: 'Office Manager',
    role: 'office-manager',
    teaches: false,
  },
  {
    id: 's-walt',
    name: 'Walt Brennan',
    title: 'Bookkeeper (contract)',
    role: 'bookkeeper',
    teaches: false,
  },
  {
    id: 's-margaret',
    name: 'Margaret Lowe',
    title: 'Board Treasurer',
    role: 'read-only',
    teaches: false,
  },
];

const PROGRAMS: Program[] = [
  { id: 'studio-sessions', name: 'Studio Semester Sessions', short: 'Studio' },
  { id: 'in-school', name: 'In-School Program', short: 'In-school' },
  { id: 'homeschool', name: 'Homeschool Program', short: 'Homeschool' },
  { id: 'jazz-legacy', name: 'Jazz Legacy Program', short: 'Jazz Legacy' },
  { id: 'advanced-workshop', name: 'Advanced Jazz Workshop', short: 'Workshop' },
  { id: 'general-operating', name: 'General operating', short: 'Operating' },
];

/** Jazz Angels' own studio: where every ensemble meets unless it says otherwise. */
export const STUDIO_VENUE_ID = 'v-studio';
/** The school the in-school ensemble meets at. */
export const PARAMOUNT_MS_VENUE_ID = 'v-paramount-ms';

/**
 * Partners. Contact names and phone numbers are invented for the demo; the
 * numbers are all in the 555 reserved range.
 */
const ORGANIZATIONS: Organization[] = [
  {
    id: 'org-paramount-usd',
    name: 'Paramount Unified School District',
    kind: 'school-district',
    contactName: 'Lorena Castillo, VAPA coordinator',
    contactEmail: 'lcastillo@example.org',
    contactPhone: '(562) 555-0180',
    website: 'https://www.paramount.k12.ca.us',
    notes: 'MOU renews each August. Invoice the district office, not the school.',
  },
];

/** The places classes meet. The studio address is a demo placeholder. */
const VENUES: Venue[] = [
  {
    id: STUDIO_VENUE_ID,
    name: 'Jazz Angels Studio',
    kind: 'studio',
    address: { street: '2100 E Anaheim St', city: 'Long Beach', state: 'CA', zip: '90804' },
  },
  {
    id: PARAMOUNT_MS_VENUE_ID,
    name: 'Paramount Middle School',
    kind: 'school',
    organizationId: 'org-paramount-usd',
    address: { street: '8500 Contreras St', city: 'Paramount', state: 'CA', zip: '90723' },
    contactName: 'Marcus Reyes, band director',
    contactPhone: '(562) 555-0142',
    notes: 'Sign in at the front office. The band room is B-12, behind the gym.',
  },
  {
    id: 'v-alondra-ms',
    name: 'Alondra Middle School',
    kind: 'school',
    organizationId: 'org-paramount-usd',
    address: { street: '16200 Downey Ave', city: 'Paramount', state: 'CA', zip: '90723' },
    contactName: 'Priya Natarajan, music teacher',
    contactPhone: '(562) 555-0167',
    notes: 'The in-school expansion site if the Port of Long Beach sponsorship comes through.',
  },
];

/**
 * What each program costs this fiscal year (decision 0006), from the prototype
 * the director saw (#49). The demo's today is in FY27.
 */
const PROGRAM_BUDGETS: ProgramBudget[] = [
  { programId: 'general-operating', fiscalYear: 'FY27', amount: 20000 },
  { programId: 'studio-sessions', fiscalYear: 'FY27', amount: 18000 },
  { programId: 'in-school', fiscalYear: 'FY27', amount: 15000 },
  { programId: 'homeschool', fiscalYear: 'FY27', amount: 6000 },
  { programId: 'jazz-legacy', fiscalYear: 'FY27', amount: 10000 },
  { programId: 'advanced-workshop', fiscalYear: 'FY27', amount: 8000 },
];

/** The ids of the demo's projects, for the grants seed's shares. */
export const SEED_PROJECT_IDS = {
  instruments: 'prj-instruments',
  showcase: 'prj-showcase',
  intensive: 'prj-intensive',
} as const;

/**
 * One-off work under a program. The Summer Jazz Intensive runs into July 2027,
 * so it shows in FY27 and FY28, and past the Herb Alpert grant's period.
 */
const PROJECTS: Project[] = [
  {
    id: SEED_PROJECT_IDS.instruments,
    name: 'Instrument library refresh',
    programId: 'studio-sessions',
    start: '2026-09-01',
    end: '2026-12-15',
    budget: 6500,
  },
  {
    id: SEED_PROJECT_IDS.showcase,
    name: 'Spring Showcase 2027',
    programId: 'studio-sessions',
    start: '2027-03-01',
    end: '2027-05-15',
    budget: 9000,
  },
  {
    id: SEED_PROJECT_IDS.intensive,
    name: 'Summer Jazz Intensive',
    programId: 'advanced-workshop',
    start: '2027-06-21',
    end: '2027-07-30',
    budget: 14000,
  },
];

/** Every module the office starts with switched on. */
export const DEFAULT_ENABLED_MODULES = ['grants', 'teaching', 'timesheets'];

/** A fresh copy of the shared nouns. Never mutate the result in place. */
export function makeCoreSeed(): CoreState {
  return {
    staff: JSON.parse(JSON.stringify(STAFF)),
    programs: JSON.parse(JSON.stringify(PROGRAMS)),
    organizations: JSON.parse(JSON.stringify(ORGANIZATIONS)),
    venues: JSON.parse(JSON.stringify(VENUES)),
    programBudgets: JSON.parse(JSON.stringify(PROGRAM_BUDGETS)),
    projects: JSON.parse(JSON.stringify(PROJECTS)),
    settings: defaultSettings(),
  };
}

/** The settings a new office starts with: a July fiscal year, every module on. */
export function defaultSettings(): AppSettings {
  return { fiscalYearStartMonth: 7, enabledModules: [...DEFAULT_ENABLED_MODULES] };
}

/**
 * The staff records the sign-in logins in auth.ts belong to. Until the backend
 * brings real accounts (#22) these seven logins are the only way in, so even an
 * empty portal keeps their people.
 */
export function loginStaff(): StaffMember[] {
  const ids = new Set(USERS.map(u => u.staffId));
  return JSON.parse(JSON.stringify(STAFF.filter(s => ids.has(s.id))));
}

/**
 * What a new office starts with when the demo is off (decision 0004): the
 * programs as editable configuration, the people the logins need, the default
 * settings, and no partners, venues, budgets or projects.
 */
export function makeCoreEmpty(): CoreState {
  return {
    staff: loginStaff(),
    programs: JSON.parse(JSON.stringify(PROGRAMS)),
    organizations: [],
    venues: [],
    programBudgets: [],
    projects: [],
    settings: defaultSettings(),
  };
}
