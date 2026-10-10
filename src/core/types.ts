/**
 * The shared nouns. Core owns people, programs, the places classes happen
 * (organizations and their venues), the fiscal year and the module switches,
 * and nothing workflow-specific.
 *
 * Conventions: money is whole US dollars as integers, dates are ISO
 * `YYYY-MM-DD` strings. Format only at render time (`core/format.ts`).
 */

import type { Archivable } from './archive';

/**
 * A program's id. An ordinary string: the Jazz Angels programs keep the ids
 * they were seeded with ('studio-sessions', 'in-school', …), and a program
 * added on the Programs page gets a generated one (`p-…`), so renaming it
 * breaks nothing. Operations, which is not a program, keeps General
 * operating's id (`OPERATIONS_ID`, decision 0006).
 */
export type ProgramId = string;

/**
 * What a person may do in the portal, one per person (decision 0001). Whether
 * they teach is the separate `teaches` switch.
 */
export type Role =
  'admin' | 'director' | 'office-manager' | 'bookkeeper' | 'teacher' | 'assistant' | 'read-only';

/**
 * A person on the staff. Archived (decision 0002) when they leave: they cannot
 * sign in, drop off the pickers, and keep the credit for everything they did.
 */
export interface StaffMember extends Archivable {
  id: string;
  name: string;
  /** "Program Director", "Teaching Artist" — how they read on a grant or a class. */
  title: string;
  /** What they may do in the portal. A sign-in takes its role from here. */
  role: Role;
  /** Leads ensembles and logs teaching hours. */
  teaches: boolean;
}

/** The person signed in, as every slice action sees them. */
export interface SignedInUser {
  /** Their staff record's id. */
  id: string;
  name: string;
  role: Role;
}

/**
 * What the money and the classes are for: "Studio Semester Sessions", "In-School
 * Program". Added and renamed in Settings. Archived (decision 0002) when it
 * stops running: it leaves the pickers for new grants, students, ensembles and
 * hours, and every record that names it keeps its name.
 */
export interface Program extends Archivable {
  id: ProgramId;
  name: string;
  /** Column-width name: "Studio", "In-school". */
  short: string;
}

/**
 * A fiscal year by name: "FY27", the year it ends (`FiscalYear.label`). How a
 * program's budget and a grant's share to a program name their year, so a
 * saved row reads the way the screens say it. `fiscalYearNamed` turns it back
 * into dates.
 */
export type FiscalYearLabel = string;

/**
 * What a program costs in one fiscal year, in whole dollars (decision 0006).
 * One row per program and year; a year with no row has no budget set.
 */
export interface ProgramBudget {
  programId: ProgramId;
  fiscalYear: FiscalYearLabel;
  amount: number;
}

/**
 * One-off work under one program, with its own dates and budget: the Spring
 * Showcase, an instrument refresh (decision 0006). It takes its money straight
 * from grants, not out of its program's share, and counts in every fiscal year
 * its dates overlap. Archived (decision 0002) when it is called off or done
 * with: its shares stay in history and stop counting toward a grant's "not
 * yet given".
 */
export interface Project extends Archivable {
  id: string;
  /** "Spring Showcase 2027" */
  name: string;
  /** The program it sits under. */
  programId: ProgramId;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  /** What it costs, whole dollars, across all its dates. */
  budget: number;
}

/** What Add a project and Edit project collect. */
export type ProjectInput = Pick<Project, 'name' | 'programId' | 'start' | 'end' | 'budget'>;

/**
 * Where money can go (decision 0006): one fiscal year of a program's budget,
 * or a project, which has no fiscal year. A grant's share names one, and a
 * program's or project's sheet asks the modules what pays for one.
 */
export type FundingTarget =
  | { kind: 'program'; programId: ProgramId; fiscalYear: FiscalYearLabel }
  | { kind: 'project'; projectId: string };

export type OrganizationKind = 'school-district' | 'school' | 'community' | 'government' | 'other';

/**
 * A partner Jazz Angels works with: a school district, a community centre, a
 * city department. The relationship lives here (who to call, what was agreed);
 * the physical places belong to it as `Venue`s. A district has many schools.
 */
export interface Organization extends Archivable {
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
export interface Venue extends Archivable {
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

/** The kinds of file the portal can store: what a picked file is turned into. */
export type FileFormat = 'pdf' | 'jpg' | 'png' | 'heic';

/**
 * What the portal knows about a stored file: its name, format, size and pages.
 * Not its contents, which the backend's storage will hold (decision 0005). A
 * grant's file (`GrantFile`) and an office document's version build on it,
 * each adding who stored it and when in their own words.
 */
export interface FileFacts {
  /** "Certificate of liability insurance 2026.pdf" */
  name: string;
  format: FileFormat;
  sizeKb: number;
  /** Unknown until counted; a photo is one page. */
  pages?: number;
}

/**
 * The papers every funder asks for, kept once for the office (decision 0005).
 * In code "office documents", never "organization", which means a partner.
 */
export type OfficeDocumentKind =
  | 'irs-letter'
  | 'financials'
  | 'board-list'
  | 'insurance-certificate'
  | 'w9'
  | 'organization-budget'
  | 'other';

/**
 * One version of an office document: its file, when it was added and by whom,
 * and when it stops being good, if it ever does. Versions are only ever
 * added; an older one stays, read-only.
 */
export interface OfficeDocumentVersion extends FileFacts {
  /** Stable, so a grant can point at the version it sent (#68). */
  id: string;
  /** ISO `YYYY-MM-DD`: the day it was added. The newest added is current. */
  addedAt: string;
  /** The staff id of whoever added it. */
  addedById: string;
  /** ISO `YYYY-MM-DD`: the day it expires. Unset means it never does. */
  expires?: string;
}

/**
 * One of the office's documents: the IRS determination letter, the board
 * list, the insurance certificate. Archived (decision 0002), never deleted.
 */
export interface OfficeDocument extends Archivable {
  id: string;
  kind: OfficeDocumentKind;
  /** "Certificate of liability insurance" */
  name: string;
  /** In the order they were added, oldest first. */
  versions: OfficeDocumentVersion[];
}

/** What Add document collects: the document and its first version. */
export interface OfficeDocumentInput {
  kind: OfficeDocumentKind;
  name: string;
  file: FileFacts;
  expires?: string;
}

/** What Add version collects. */
export interface OfficeDocumentVersionInput {
  file: FileFacts;
  expires?: string;
}

export interface AppSettings {
  /** 1-12. Jazz Angels runs Jul 1 – Jun 30, so 7. */
  fiscalYearStartMonth: number;
  /** Module ids the office has switched on. */
  enabledModules: string[];
}

export interface CoreState {
  staff: StaffMember[];
  programs: Program[];
  organizations: Organization[];
  venues: Venue[];
  /** Each program's budget, per fiscal year (decision 0006). */
  programBudgets: ProgramBudget[];
  /** One-off work under a program (decision 0006). */
  projects: Project[];
  /** The papers every funder asks for, kept once, with their versions (decision 0005). */
  officeDocuments: OfficeDocument[];
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
  /**
   * Archive a person (decision 0002): they leave the staff list and the
   * pickers and cannot sign in; their past work still names them. Nobody
   * archives themself.
   */
  archiveStaff(id: string): void;
  /** Put an archived person back on the staff list; they can sign in again. */
  restoreStaff(id: string): void;
  /** Add a program: its name and short name. Returns the new id. */
  addProgram(input: Pick<Program, 'name' | 'short'>): string;
  /** Rename a program. Its id stays, so every grant, student and ensemble still names it. */
  updateProgram(id: string, patch: Partial<Pick<Program, 'name' | 'short'>>): void;
  /**
   * Archive a program: it leaves the pickers for new records. The grants,
   * students, ensembles and hours that name it keep it: nothing cascades.
   */
  archiveProgram(id: string): void;
  restoreProgram(id: string): void;
  /**
   * Set what a program costs in one fiscal year ("FY27"), in whole dollars.
   * Replaces the year's budget if it has one.
   */
  setProgramBudget(programId: ProgramId, fiscalYear: FiscalYearLabel, amount: number): void;
  /** Add a project under a program. Returns the new id. */
  addProject(input: ProjectInput): string;
  /** Change a project's name, program, dates or budget. Its shares follow it. */
  updateProject(id: string, patch: Partial<ProjectInput>): void;
  /**
   * Archive a project (decision 0002): it leaves the Programs list. Its shares
   * stay in history and stop counting toward a grant's "not yet given".
   */
  archiveProject(id: string): void;
  restoreProject(id: string): void;
  /** Archive a partner. Its venues stay as they are: nothing cascades. */
  archiveOrganization(id: string): void;
  restoreOrganization(id: string): void;
  /** Archive a venue. Classes that met there keep it in their history. */
  archiveVenue(id: string): void;
  restoreVenue(id: string): void;
  /** Add an office document with its first version. Returns the new id. */
  addOfficeDocument(input: OfficeDocumentInput): string;
  /** Change an office document's name or kind. Its versions stay as they are. */
  updateOfficeDocument(id: string, patch: Partial<Pick<OfficeDocument, 'name' | 'kind'>>): void;
  /** Add a new version to an office document; it becomes the current one. Returns its id. */
  addOfficeDocumentVersion(id: string, input: OfficeDocumentVersionInput): string;
  /** Archive an office document (decision 0002): it leaves the list and the dashboard. */
  archiveOfficeDocument(id: string): void;
  restoreOfficeDocument(id: string): void;
  updateSettings(patch: Partial<AppSettings>): void;
  /** Turn a module on or off. Its data stays either way. */
  setModuleEnabled(id: string, on: boolean): void;
  /**
   * Throw the working data away and reload the demo data for every slice.
   * Only in a demo build; otherwise it changes nothing and says so.
   */
  resetDemo(): void;
  /**
   * Move the demo date, or pass undefined for the real clock. A preference of
   * this browser, never part of the data; only in a demo build.
   */
  setDemoToday(iso: string | undefined): void;
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
