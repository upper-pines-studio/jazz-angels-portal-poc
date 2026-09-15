/**
 * The shared nouns. Core owns people, programs, the fiscal year and the
 * module switches, and nothing workflow-specific.
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
