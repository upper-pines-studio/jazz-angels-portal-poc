import type { Archivable } from '../../../core/archive';
import type {
  FileFacts,
  FileFormat,
  FiscalYear,
  FiscalYearLabel,
  FundingTarget,
  ProgramId,
} from '../../../core/types';

export type { ProgramId };

/**
 * Domain types for the grants module.
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

export type FunderType = 'foundation' | 'government' | 'corporate' | 'individual' | 'other';

export type Restriction = 'restricted' | 'unrestricted';

/**
 * Archived (decision 0002) when the office no longer applies to them: off the
 * Funders list and the Add grant picker. Their grants are not touched.
 */
export interface Funder extends Archivable {
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

/**
 * Archived (decision 0002) when it is no longer current: off the pipeline, the
 * deadlines, the reminders, the dashboard and the spending screens, and still
 * in its funder's history, Budget vs. actual's All view and the activity log.
 */
export interface Grant extends Archivable {
  id: string;
  funderId: string;
  /** "Arts Education Grant 2026" */
  title: string;
  /**
   * The Jazz Angels programs the money is for, at least one. For a restricted
   * grant these are the programs its money may go to; for an unrestricted one,
   * what it was applied for (decision 0006).
   */
  programs: ProgramId[];
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
  /**
   * Set on a grant that was already under way when it came into the portal
   * (decision 0004): the phase it arrived at and the day it was brought in.
   * The phases before `phase` were passed elsewhere, so the stepper shows them
   * done, dated only from `dates.submitted`, `decided` and `periodStart`, and the checklist has no tasks
   * for them. Unset on a grant added at Prospect, LOI or Applying.
   */
  broughtIn?: { phase: Phase; on: string };
  /**
   * The grant this one renews: last year's grant from the same funder, which
   * "Start next year's" started it from (decision 0005, #67). A grant is
   * renewed at most once, so at most one grant names any other. Unset on a
   * grant that is not a renewal.
   */
  renewsGrantId?: string;
}

/**
 * A slice of a grant's money that one program's year or one project gets
 * (decision 0006). Not a share of a transaction: that is the part of a
 * QuickBooks transaction one grant pays (`usualShares`), and the two never meet.
 *
 * A share to a program names the fiscal year it counts toward
 * (`target.fiscalYear`); a share to a project has none, and counts in every
 * year the project runs. A pending grant's shares are against the amount
 * requested and count as "If awarded".
 */
export interface GrantShare {
  id: string;
  grantId: string;
  target: FundingTarget;
  /** Whole dollars, more than 0. */
  amount: number;
}

/**
 * Where Give sends money. A program's fiscal year may be left out: it then
 * defaults to the year the grant period starts in (`defaultShareYear`).
 */
export type ShareTargetInput =
  | { kind: 'program'; programId: ProgramId; fiscalYear?: FiscalYearLabel }
  | { kind: 'project'; projectId: string };

/** What Give to a program or project collects. */
export interface GiveShareInput {
  grantId: string;
  target: ShareTargetInput;
  amount: number;
}

/** What changing a share may change: its amount, and a program share's fiscal year. */
export interface ShareChange {
  amount?: number;
  fiscalYear?: FiscalYearLabel;
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
  /** The page of the award letter that promises this installment. */
  sourcePage?: number;
}

/** How the award is allocated. */
export interface BudgetLine {
  id: string;
  grantId: string;
  /** "Teaching artist stipends" */
  category: string;
  planned: number;
  /** QuickBooks expense accounts whose spending counts here: ['6700', '6710']. */
  accountCodes?: string[];
  /** The QuickBooks class the bookkeeper tags this grant's spending with. */
  classId?: string;
}

/** Money spent against a budget line. */
export interface Expense {
  id: string;
  grantId: string;
  budgetLineId: string;
  date: string;
  payee: string;
  amount: number;
  /** What it was for: "Tenor sax overhaul". */
  note?: string;
  /** The QuickBooks transaction this came from. Unset for an expense typed in by hand. */
  transactionId?: string;
  /** A remark kept with the backup: "Quote approved by Barry on Jul 12." */
  backupNote?: string;
}

// ---------------------------------------------------------------------------
// QuickBooks and the money side of a grant
// ---------------------------------------------------------------------------

/** The read-only link to QuickBooks Online. Nothing is ever written back. */
export interface QuickBooksConnection {
  connected: boolean;
  /** The company file: "Jazz Angels Inc." */
  company: string;
  /** ISO date-time of the last sync. */
  lastSyncedAt: string;
}

/** An expense account in the QuickBooks chart of accounts. */
export interface QbAccount {
  /** "6200" */
  code: string;
  /** "Contract instructors" */
  name: string;
}

/** A QuickBooks class: how the bookkeeper tags spending to a grant. */
export interface QbClass {
  id: string;
  /** "Herb Alpert GOS" */
  name: string;
}

export type TransactionStatus = 'to-assign' | 'assigned' | 'not-grant-funded';

/**
 * A transaction as it arrived from QuickBooks. People assign it to a budget
 * line; they never retype it. Once assigned, its parts are the `Expense` rows
 * that carry its id, so a split is two expenses with one `transactionId`.
 */
export interface Transaction {
  id: string;
  date: string;
  payee: string;
  memo: string;
  accountCode: string;
  classId?: string;
  amount: number;
  /** How QuickBooks knows it: "Bill 1047", "Check 2210", "Expense". */
  ref: string;
  status: TransactionStatus;
  /** Staff id of whoever assigned it, and the day they did. */
  assignedById?: string;
  assignedAt?: string;
}

/** One part of an assignment: this much of the transaction, to this line. */
export interface Allocation {
  grantId: string;
  budgetLineId: string;
  amount: number;
}

/**
 * Where a transaction stood, exactly: its status, its parts with their notes,
 * and the backup files on them. An Undo puts it back (`restoreTransactions`).
 */
export interface TransactionSnapshot {
  id: string;
  status: TransactionStatus;
  assignedById?: string;
  assignedAt?: string;
  expenses: Expense[];
  files: GrantFile[];
}

/**
 * What happens to a transaction's backup when it is assigned again. A new part
 * on the same grant and line as an old one keeps that expense, with its files
 * and note. An old part left with no match goes, and its files and note move to
 * the new part at `to`.
 */
export interface BackupCarry {
  /** For each new part, the old expense it keeps, if any. */
  kept: Array<Expense | undefined>;
  moved: Array<{ from: Expense; to: number }>;
}

/** "Always split Signal Hill Properties this way." */
export interface SplitRule {
  id: string;
  payee: string;
  parts: Array<{ grantId: string; budgetLineId: string; percent: number }>;
}

/**
 * Where a transaction's parts start, and what that came from: the payee's
 * saved rule, its last assigned transaction, or an even share (`usualShares`).
 */
export interface UsualShares {
  source: 'rule' | 'history' | 'even';
  parts: SplitRule['parts'];
}

export type GrantFileKind =
  'award-letter' | 'agreement' | 'receipt' | 'invoice' | 'timesheet' | 'other';

/** Core's `FileFormat`, by the name the grants module has always used. */
export type GrantFileFormat = FileFormat;

/**
 * A file stored with a grant: the award letter, or the backup for one expense.
 * Its name, format, size and pages are core's `FileFacts`, shared with office
 * documents. The POC keeps what describes the file; the bytes of a file added
 * in this session are held in memory only (`app/components/files.tsx`).
 */
export interface GrantFile extends FileFacts {
  id: string;
  grantId: string;
  /** Set when the file backs up one expense. */
  expenseId?: string;
  kind: GrantFileKind;
  uploadedById: string;
  uploadedAt: string;
}

/** One term of the award, as written in the award letter. */
export interface AwardTerm {
  id: string;
  grantId: string;
  /** "Capital purchases" */
  label: string;
  /** "No single equipment purchase over $5,000 without written approval." */
  text: string;
  /** The page of the award letter it came from. */
  page?: number;
  order: number;
}

/**
 * When the reminder emails for one report go out, and to whom. A report with
 * no plan of its own follows `ReminderDefaults`.
 */
export interface ReminderPlan {
  reportId: string;
  /** Days before the due date; 0 is the due date itself. */
  offsets: number[];
  recipientIds: string[];
  /** Keep emailing after the due date until someone marks it submitted. */
  keepReminding: boolean;
}

export interface ReminderDefaults {
  offsets: number[];
  /** Emailed as well as the grant owner. */
  alsoNotifyIds: string[];
  keepReminding: boolean;
  /** Days between emails once the due date has passed. */
  repeatEveryDays: number;
  /** 24-hour clock: 8 is 8:00 am. */
  sendHour: number;
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
  /** The staff member who did it. The name is looked up when shown, so a rename follows. */
  whoId?: string;
  /**
   * A name saved before rows carried a staff id, kept only when it matched
   * nobody on the staff list. Shown as written.
   */
  who?: string;
  text: string;
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

/** Everything the grants module owns. The shared nouns live in `core`. */
export interface GrantsState {
  funders: Funder[];
  grants: Grant[];
  tasks: Task[];
  documents: GrantDocument[];
  payments: Payment[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  reports: Report[];
  activity: Activity[];
  templates: ChecklistTemplate[];

  quickbooks: QuickBooksConnection;
  accounts: QbAccount[];
  classes: QbClass[];
  /** Everything QuickBooks has sent so far. */
  transactions: Transaction[];
  /** Waiting in QuickBooks: these arrive on the next sync. */
  incoming: Transaction[];
  splitRules: SplitRule[];
  files: GrantFile[];
  terms: AwardTerm[];
  reminderPlans: ReminderPlan[];
  reminderDefaults: ReminderDefaults;
  /** How each grant's money is shared out to programs and projects (decision 0006). */
  grantShares: GrantShare[];
}

/** What the "Add grant" dialog (SPEC §4.3) collects. */
export interface NewGrantInput {
  /** Existing funder. Ignored when `newFunder` is given. */
  funderId?: string;
  /** "New funder…" branch of step 1. */
  newFunder?: Omit<Funder, 'id'>;
  title: string;
  /** At least one. */
  programs: ProgramId[];
  restriction: Restriction;
  ownerId: string;
  /**
   * Defaults to 'prospect'; the dialog may start a new grant in 'loi' or
   * 'applying', and a grant already under way (`inFlight`) in 'awarded',
   * 'active' or 'reporting'.
   */
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
  /**
   * "This grant is already under way": set to bring in a grant at Awarded,
   * Active or Reporting (`phase` must be one of them) with what has already
   * happened. See `inFlightRefusal` for what is accepted.
   */
  inFlight?: InFlightInput;
}

/**
 * What "Start next year's" collects (#67). Everything else on the renewal is
 * copied from last year's grant (`renewGrant`).
 */
export interface RenewGrantInput {
  /** Last year's grant: the one being renewed. */
  grantId: string;
  title: string;
  amountRequested?: number;
  /** loiDue, applicationDue, decisionExpected, periodStart, periodEnd and startBy; the rest stay blank. */
  dates: GrantDates;
  /** A current staff member. */
  ownerId: string;
  /** Current programs, at least one. */
  programs: ProgramId[];
}

/** The phases a grant already under way may be brought in at. Closed is not one. */
export type InFlightPhase = 'awarded' | 'active' | 'reporting';

/**
 * What the in-flight path of Add grant records beyond a new grant. Dates it
 * does not know stay blank: `NewGrantInput.dates` carries the ones it does
 * (loiDue, applicationDue, submitted, decided, periodStart, periodEnd).
 */
export interface InFlightInput {
  /** Whole dollars. Required on this path. */
  amountAwarded: number;
  /** Category and approved amount; accounts and class are set on the Budget tab. */
  budgetLines?: Array<Pick<BudgetLine, 'category' | 'planned'>>;
  /** The payment schedule; a payment with `receivedDate` has already arrived. */
  payments?: Array<Pick<Payment, 'label' | 'expectedDate' | 'amount' | 'receivedDate'>>;
  /** The reports owed; one with status submitted or accepted has been sent. */
  reports?: Array<Pick<Report, 'kind' | 'dueDate' | 'status' | 'submittedDate'>>;
}

// ---------------------------------------------------------------------------
// Derived shapes (never stored)
// ---------------------------------------------------------------------------

export type DeadlineKind =
  'task' | 'loi' | 'application' | 'decision' | 'report' | 'payment' | 'period-end' | 'start';

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

/** How spending compares with the share of the grant period that has gone. */
export type PaceStatus =
  | 'on-track'
  | 'spending-fast'
  | 'spending-slow'
  /** A budget line running ahead, but not far enough to warn about. */
  | 'ahead'
  | 'period-ended'
  /** The grant period has not started, or has no dates yet. */
  | 'not-started';

/** Straight-line pacing for a grant or for one budget line. */
export interface Pace {
  status: PaceStatus;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget, 0 to 1 and beyond when over. */
  used: number;
  /** Share of the grant period gone, 0 to 1. */
  elapsed: number;
  /** Counted inclusively, so day one of the period is 1. */
  daysElapsed: number;
  daysTotal: number;
  daysLeft: number;
  periodStart?: string;
  periodEnd?: string;
  /** Average spending per month so far. */
  perMonthSoFar: number;
  /** What would have to be spent per month from today to finish on the end date. */
  perMonthNeeded: number;
  /** The day the money runs out at today's rate, when that is before the period ends. */
  runsOutOn?: string;
  /** Spending by the end date at today's rate, capped at the budget. */
  projectedSpent: number;
  /** What would be left on the end date at today's rate. */
  projectedUnspent: number;
  /** One plain sentence: "Runs out around Jan 22, 2027". */
  headline: string;
}

export interface LinePace extends Pace {
  line: BudgetLine;
}

/** What the portal proposes for a transaction that is waiting to be assigned. */
export type Suggestion =
  | { kind: 'line'; grantId: string; budgetLineId: string }
  | { kind: 'split'; rule: SplitRule }
  | { kind: 'not-grant-funded'; months: number }
  | {
      kind: 'ambiguous';
      candidates: Array<{ grantId: string; budgetLineId: string }>;
      hint: string;
    }
  | { kind: 'none'; hint: string };

export interface ReminderStep {
  /** Days before the due date; 0 is the due date; a repeat after it is negative (-3 is 3 days late). */
  offset: number;
  date: string;
  enabled: boolean;
  state: 'sent' | 'next' | 'scheduled' | 'off';
  /** A "keep reminding" email after the due date rather than one of the reminder days. */
  repeat?: boolean;
}

export interface BackupSummary {
  expenses: number;
  total: number;
  withBackup: number;
  files: number;
  missing: number;
  missingTotal: number;
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

export interface FyTotals extends FiscalYear {
  requested: number;
  awarded: number;
  received: number;
  spent: number;
}

/**
 * Whether a grant's money counts toward programs and projects, and how
 * (decision 0006): awarded (Awarded, Active, Reporting, Closed), "If awarded"
 * while pending (LOI, Applying, Submitted), or not at all (a prospect, a
 * declined or withdrawn grant, an archived one).
 */
export type GrantStanding = 'awarded' | 'if-awarded' | 'none';

/** Why a share's money may not be usable where it goes. Warnings, never refusals. */
export type ShareWarningKind =
  /** A restricted grant's money going outside its programs. */
  | 'outside-restriction'
  /** A project that runs outside the grant period. */
  | 'project-outside-period'
  /** A program's fiscal year that starts after the grant period ends. */
  | 'year-after-period'
  /** A program's fiscal year that ended before the grant period starts. */
  | 'year-before-period'
  /** More given out than the grant has. */
  | 'over-given';

export interface ShareWarning {
  kind: ShareWarningKind;
  /** One plain sentence: "Restricted to In-School Program and Homeschool Program". */
  message: string;
}

/** One share as a grant's card shows it. */
export interface ShareView {
  share: GrantShare;
  /** "Studio Semester Sessions, FY27", "Spring Showcase 2027". */
  name: string;
  /** The program it goes to, or the project's program. */
  programId: ProgramId | undefined;
  /** The project is archived: the share is history and counts toward nothing given. */
  archived: boolean;
  /** Whether it counts toward what the grant has given. */
  counts: boolean;
  warnings: ShareWarning[];
}

/** Where one grant's money goes, and what is left. */
export interface GrantGiving {
  grant: Grant;
  standing: GrantStanding;
  /** All it has to give: the amount awarded, or requested while pending. 0 when it does not count. */
  total: number;
  /** Given to programs and to current projects. */
  given: number;
  /** total − given; negative when more is given out than the grant has. */
  notYetGiven: number;
  /** Its shares, programs first, then projects. */
  shares: ShareView[];
  /** About the grant as a whole: more given out than it has. */
  warnings: ShareWarning[];
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
