import type { CoreState, Organization, Program, StaffMember, Venue } from './types';

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

/** Every module the office starts with switched on. */
export const DEFAULT_ENABLED_MODULES = ['grants', 'teaching', 'timesheets'];

/** A fresh copy of the shared nouns. Never mutate the result in place. */
export function makeCoreSeed(): CoreState {
  return {
    staff: JSON.parse(JSON.stringify(STAFF)),
    programs: JSON.parse(JSON.stringify(PROGRAMS)),
    organizations: JSON.parse(JSON.stringify(ORGANIZATIONS)),
    venues: JSON.parse(JSON.stringify(VENUES)),
    settings: {
      fiscalYearStartMonth: 7,
      enabledModules: [...DEFAULT_ENABLED_MODULES],
      demoToday: SEED_TODAY,
    },
  };
}
