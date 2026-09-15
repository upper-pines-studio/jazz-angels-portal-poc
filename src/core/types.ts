/**
 * The shared nouns. Core owns people, programs, the places classes happen
 * (organizations and their venues), the fiscal year and the module switches,
 * and nothing workflow-specific.
 *
 * Conventions: money is whole US dollars as integers, dates are ISO
 * `YYYY-MM-DD` strings. Format only at render time (`core/format.ts`).
 */

export type ProgramId =
  | 'studio-sessions'
  | 'in-school'
  | 'homeschool'
  | 'jazz-legacy'
  | 'advanced-workshop'
  | 'general-operating';

export interface StaffMember {
  id: string;
  name: string;
  /** "Program Director", "Teaching Artist" — how they read on a grant or a class. */
  role: string;
  /** Leads ensembles and logs teaching hours. */
  teaches: boolean;
}

export interface Program {
  id: ProgramId;
  name: string;
  /** Column-width name: "Studio", "In-school". */
  short: string;
}

export type OrganizationKind = 'school-district' | 'school' | 'community' | 'government' | 'other';

/**
 * A partner Jazz Angels works with: a school district, a community centre, a
 * city department. The relationship lives here (who to call, what was agreed);
 * the physical places belong to it as `Venue`s. A district has many schools.
 */
export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  /** "Ms. Alvarez, VAPA coordinator" — the person the office actually calls. */
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  /** "MOU renews each August. Invoice the district office, not the school." */
  notes?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export type VenueKind = 'studio' | 'school' | 'community' | 'performance' | 'other';

/**
 * A physical place a class or a performance happens. Jazz Angels' own studio
 * is one; each school in a district is another. A venue may belong to an
 * `Organization`; the studio and a rented hall do not.
 */
export interface Venue {
  id: string;
  /** "Paramount Middle School", "Jazz Angels Studio". */
  name: string;
  /** `studio` is Jazz Angels' own space, so a schedule names only the room. */
  kind: VenueKind;
  organizationId?: string;
  address?: Address;
  /** The on-site contact, when it differs from the organization's. */
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** "Sign in at the front office. The band room is B-12, behind the gym." */
  notes?: string;
}

export interface AppSettings {
  /** 1-12. Jazz Angels runs Jul 1 – Jun 30, so 7. */
  fiscalYearStartMonth: number;
  /** Module ids the office has switched on. */
  enabledModules: string[];
  /**
   * The day the portal treats as today, so the demo story reads the way it was
   * written. Unset means the real clock.
   */
  demoToday?: string;
}

export interface CoreState {
  staff: StaffMember[];
  programs: Program[];
  organizations: Organization[];
  venues: Venue[];
  settings: AppSettings;
}

export interface FiscalYear {
  /** "FY27" — named by the year it ends. */
  label: string;
  start: string;
  end: string;
}

export interface CoreActions {
  /** Add a person. Returns the new id. */
  addStaff(input: Omit<StaffMember, 'id'>): string;
  updateStaff(id: string, patch: Partial<StaffMember>): void;
  /** Add a partner organization. Returns the new id. */
  addOrganization(input: Omit<Organization, 'id'>): string;
  updateOrganization(id: string, patch: Partial<Organization>): void;
  /** Add a place classes can meet. Returns the new id. */
  addVenue(input: Omit<Venue, 'id'>): string;
  updateVenue(id: string, patch: Partial<Venue>): void;
  updateSettings(patch: Partial<AppSettings>): void;
  /** Turn a module on or off. Its data stays either way. */
  setModuleEnabled(id: string, on: boolean): void;
  /** Throw the working data away and reload the demo data for every slice. */
  resetDemo(): void;
  /** Replace every slice from an exported file. Throws on an unreadable file. */
  importJson(text: string): void;
  /** The whole portal as pretty JSON, for the download button. */
  exportJson(): string;
}

/**
 * The whole portal's state, one key per slice. Each module augments this from
 * its own folder, so core never names a module:
 *
 * ```ts
 * declare module '../../../core/types' {
 *   interface PortalState { grants: GrantsState }
 * }
 * ```
 */
export interface PortalState {
  core: CoreState;
}

/** The action namespaces, augmented the same way. */
export interface PortalActions {
  core: CoreActions;
}
