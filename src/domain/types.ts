/**
 * Domain types for the Jazz Angels grants POC.
 *
 * Conventions (SPEC §2):
 *  - All money is whole US dollars, stored as integers.
 *  - All dates are ISO `YYYY-MM-DD` strings (never Date objects, never timestamps).
 *  - `Activity.at` is the one exception: an ISO date-time string.
 */

export type Phase =
  | 'prospect'
  | 'loi'
  | 'applying'
  | 'submitted'
  | 'awarded'
  | 'active'
  | 'reporting'
  | 'closed'
  | 'declined'
  | 'withdrawn';

export type PhaseTone = 'neutral' | 'blue' | 'teal' | 'olive' | 'gold' | 'danger';

export type ProgramId =
  | 'studio-sessions'
  | 'in-school'
  | 'homeschool'
  | 'jazz-legacy'
  | 'advanced-workshop'
  | 'general-operating';

export type FunderType = 'foundation' | 'government' | 'corporate' | 'individual' | 'other';

export type Restriction = 'restricted' | 'unrestricted';

export interface Funder {
  id: string;
  name: string;
  type: FunderType;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  /** "Rolling", "LOI in Jan, full proposal by Mar 15", etc. */
  cycleNotes?: string;
  notes?: string;
}

/** Key dates on a grant. Any may be undefined until known. */
export interface GrantDates {
  /** When we should start working on it (internal). */
  startBy?: string;
  loiDue?: string;
  applicationDue?: string;
  submitted?: string;
  decisionExpected?: string;
  /** Awarded or declined on. */
  decided?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** The date fields a checklist item can be anchored to. */
export type DateAnchor = keyof GrantDates;

export interface Grant {
  id: string;
  funderId: string;
  /** "Arts Education Grant 2026" */
  title: string;
  /** Which Jazz Angels program the money is for. */
  program: ProgramId;
  restriction: Restriction;
  /** Staff member responsible. */
  ownerId: string;
  phase: Phase;
  loiRequired: boolean;
  amountRequested?: number;
  amountAwarded?: number;
  dates: GrantDates;
  notes?: string;
  createdAt: string;
}

/** Checklist item on a grant, usually created from a template. */
export interface Task {
  id: string;
  grantId: string;
  phase: Phase;
  title: string;
  dueDate?: string;
  assigneeId?: string;
  done: boolean;
  doneAt?: string;
  order: number;
}

export type DocumentKind =
  | 'narrative'
  | 'budget'
  | 'irs-letter'
  | 'board-list'
  | 'financials'
  | 'award-letter'
  | 'agreement'
  | 'report'
  | 'other';

export type DocumentStatus = 'needed' | 'drafting' | 'final' | 'submitted';

/**
 * Register of the files that live in the grant folder.
 * Named `GrantDocument` (not `Document`) so it never collides with the DOM type.
 */
export interface GrantDocument {
  id: string;
  grantId: string;
  name: string;
  kind: DocumentKind;
  status: DocumentStatus;
  /** Link to Drive/Dropbox; the POC does not upload files. */
  url?: string;
  updatedAt: string;
}

/** Money the funder sends us (installments). */
export interface Payment {
  id: string;
  grantId: string;
  /** "First installment" */
  label: string;
  expectedDate: string;
  amount: number;
  receivedDate?: string;
}

/** How the award is allocated. */
export interface BudgetLine {
  id: string;
  grantId: string;
  /** "Teaching artist stipends" */
  category: string;
  planned: number;
}

/** Money spent against a budget line. */
export interface Expense {
  id: string;
  grantId: string;
  budgetLineId: string;
  date: string;
  payee: string;
  amount: number;
  note?: string;
}

export type ReportStatus = 'upcoming' | 'drafting' | 'submitted' | 'accepted';

/** Reports owed to the funder. */
export interface Report {
  id: string;
  grantId: string;
  kind: 'interim' | 'final';
  dueDate: string;
  submittedDate?: string;
  status: ReportStatus;
}

/** Audit trail, mostly automatic. */
export interface Activity {
  id: string;
  grantId: string;
  /** ISO date-time. */
  at: string;
  who: string;
  text: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export interface Program {
  id: ProgramId;
  name: string;
}

export interface ChecklistTemplateItem {
  /** Stable id so the Playbook screen can edit/remove single items. */
  id: string;
  phase: Phase;
  title: string;
  /** Relative to the anchor date; negative = before. */
  offsetDays: number;
  anchor: DateAnchor;
}

/** The "playbook" — what to do in each phase. */
export interface ChecklistTemplate {
  id: string;
  /** "Foundation grant — standard", "Government grant" */
  name: string;
  description?: string;
  items: ChecklistTemplateItem[];
}

export interface AppSettings {
  /** 1-12. Jazz Angels runs Jul 1 – Jun 30, so 7. */
  fiscalYearStartMonth: number;
}

export interface AppState {
  funders: Funder[];
  grants: Grant[];
  tasks: Task[];
  documents: GrantDocument[];
  payments: Payment[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  reports: Report[];
  activity: Activity[];
  staff: StaffMember[];
  programs: Program[];
  templates: ChecklistTemplate[];
  settings: AppSettings;
}

/** What the "Add grant" dialog (SPEC §4.3) collects. */
export interface NewGrantInput {
  /** Existing funder. Ignored when `newFunder` is given. */
  funderId?: string;
  /** "New funder…" branch of step 1. */
  newFunder?: Omit<Funder, 'id'>;
  title: string;
  program: ProgramId;
  restriction: Restriction;
  ownerId: string;
  /** Defaults to 'prospect'; the dialog may start a grant in 'loi' or 'applying'. */
  phase?: Phase;
  loiRequired: boolean;
  amountRequested?: number;
  dates?: GrantDates;
  notes?: string;
  /** Template to instantiate the checklist from. `null`/undefined = no tasks. */
  templateId?: string | null;
  /** Template item ids the user unchecked in step 3. */
  excludeTemplateItemIds?: string[];
  /** Create the standard document register (narrative, budget, …). Default true. */
  includeDocumentRegister?: boolean;
}

// ---------------------------------------------------------------------------
// Derived shapes (never stored)
// ---------------------------------------------------------------------------

export type DeadlineKind =
  | 'task'
  | 'loi'
  | 'application'
  | 'decision'
  | 'report'
  | 'payment'
  | 'period-end'
  | 'start';

export type DeadlineStatus = 'overdue' | 'due-soon' | 'upcoming';

export interface Deadline {
  /** Stable, derived: `task:<taskId>`, `loi:<grantId>`, … */
  id: string;
  date: string;
  kind: DeadlineKind;
  label: string;
  grantId: string;
  /** Task assignee, falling back to the grant owner. */
  ownerId?: string;
  status: DeadlineStatus;
}

export interface GrantMoney {
  awarded: number;
  received: number;
  /** Sum of payments not yet received. */
  expectedRemaining: number;
  spent: number;
  /** awarded − spent */
  remaining: number;
  plannedTotal: number;
  byLine: Array<{ line: BudgetLine; spent: number }>;
}

export interface FiscalYear {
  /** "FY27" — named by the year it ends. */
  label: string;
  start: string;
  end: string;
}

export interface FyTotals extends FiscalYear {
  requested: number;
  awarded: number;
  received: number;
  spent: number;
}

export interface PipelineBucket {
  phase: Phase;
  count: number;
  requested: number;
  awarded: number;
}

export type GrantView = 'active' | 'pre-award' | 'post-award' | 'closed' | 'all';

export interface Transition {
  to: Phase;
  label: string;
  kind: 'primary' | 'secondary' | 'danger';
  fields: Array<'date' | 'amountAwarded' | 'periodStart' | 'periodEnd' | 'reason'>;
}

export interface TransitionPayload {
  date?: string;
  amountAwarded?: number;
  periodStart?: string;
  periodEnd?: string;
  reason?: string;
}
