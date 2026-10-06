# Jazz Angels Grants — product spec (POC)

Internal grant-management tool for Jazz Angels, a Long Beach / Signal Hill 501(c)(3) that teaches
jazz to middle- and high-school musicians. Today one person runs grants out of a folder per grant
(Word docs to fill in, spreadsheets for timelines). Nothing is shared, nothing is trainable.

**Goal of the POC:** one place that shows every grant, where it is in its life, what is due when,
and, once awarded, where the money went. The "how we do it" knowledge that lives in one person's
head becomes checklist templates the whole office can follow.

**Users:** the program director (owner of most grants), an office administrator, a board member
who wants to see the pipeline. One role for the POC; no login.

---

## 1. The grant lifecycle (phases)

Every grant moves through the same phases. The phase is the single most important fact about a
grant and is shown everywhere as a stepper or a Badge.

| # | Phase | id | Badge tone | Meaning | Enters when |
|---|---|---|---|---|---|
| 1 | Prospect | `prospect` | neutral | We think this funder fits. Researching eligibility, cycle, fit. | Grant is created |
| 2 | LOI | `loi` | olive | Funder requires a letter of intent / inquiry before a full proposal. *Optional* | Grant marked "LOI required" |
| 3 | Applying | `applying` | blue | Writing the proposal and assembling attachments | "Start application" |
| 4 | Submitted | `submitted` | blue | Sent; waiting on the funder | "Mark submitted" (records submitted date) |
| 5 | Awarded | `awarded` | teal | Award letter received; agreement being signed; terms captured | "Record award" (records award amount, period, reporting schedule) |
| 6 | Active | `active` | teal | Money is arriving and being spent against the budget | Agreement signed / first payment received |
| 7 | Reporting | `reporting` | gold | An interim or final report is due or in progress | Automatically when a report is within 30 days of due, or manual |
| 8 | Closed | `closed` | neutral | Final report accepted, all funds spent or returned | "Close grant" |
| — | Declined | `declined` | danger | Funder said no. Terminal, but keep for history. | "Record decline" |
| — | Withdrawn | `withdrawn` | neutral | We chose not to pursue. Terminal. | "Withdraw" |

Phase order for the stepper: prospect → loi → applying → submitted → awarded → active → reporting → closed.
LOI is skipped (hidden in the stepper) when `loiRequired` is false. Declined/withdrawn are shown as a
red/grey terminal marker at the point they happened.

"Pre-award" = prospect, loi, applying, submitted. "Post-award" = awarded, active, reporting, closed.

---

## 2. Domain model

All money in whole US dollars (integers). All dates ISO `YYYY-MM-DD` strings.

```ts
type Phase = 'prospect'|'loi'|'applying'|'submitted'|'awarded'|'active'|'reporting'|'closed'|'declined'|'withdrawn';

interface Funder {
  id: string; name: string;
  type: 'foundation'|'government'|'corporate'|'individual'|'other';
  contactName?: string; contactEmail?: string; contactPhone?: string; website?: string;
  cycleNotes?: string;   // "Rolling", "LOI in Jan, full proposal by Mar 15", etc.
  notes?: string;
}

interface Grant {
  id: string; funderId: string;
  title: string;                 // "Arts Education Grant 2026"
  program: ProgramId;            // which Jazz Angels program the money is for
  restriction: 'restricted'|'unrestricted';
  ownerId: string;               // staff member responsible
  phase: Phase;
  loiRequired: boolean;
  amountRequested?: number; amountAwarded?: number;
  // key dates (any may be undefined until known)
  dates: {
    startBy?: string;            // when we should start working on it (internal)
    loiDue?: string;
    applicationDue?: string;
    submitted?: string;
    decisionExpected?: string;
    decided?: string;            // awarded or declined on
    periodStart?: string; periodEnd?: string;   // grant period
  };
  notes?: string;
  createdAt: string;
}

interface Task {           // checklist item on a grant, usually created from a template
  id: string; grantId: string; phase: Phase; title: string;
  dueDate?: string; assigneeId?: string; done: boolean; doneAt?: string; order: number;
}

interface Document {       // register of the files that live in the grant folder
  id: string; grantId: string; name: string;
  kind: 'narrative'|'budget'|'irs-letter'|'board-list'|'financials'|'award-letter'|'agreement'|'report'|'other';
  status: 'needed'|'drafting'|'final'|'submitted';
  url?: string;            // link to Drive/Dropbox; the POC does not upload files
  updatedAt: string;
}

interface Payment {        // money the funder sends us (installments)
  id: string; grantId: string; label: string;   // "First installment"
  expectedDate: string; amount: number; receivedDate?: string;
  sourcePage?: number;     // the page of the award letter that promises it
}

interface AwardTerm {      // one condition of the award, as the letter words it
  id: string; grantId: string; label: string;   // "Capital purchases"
  text: string; page?: number; order: number;
}

interface BudgetLine {     // how the award is allocated
  id: string; grantId: string; category: string;   // "Teaching artist stipends"
  planned: number;
  accountCodes?: string[]; // QuickBooks expense accounts whose spending counts here: ['6700', '6710']
  classId?: string;        // the QuickBooks class that marks spending as this grant's
}

interface Expense {        // money spent against a budget line
  id: string; grantId: string; budgetLineId: string;
  date: string; payee: string; amount: number; note?: string;
  transactionId?: string;  // the QuickBooks transaction it came from; unset when typed in by hand
  backupNote?: string;     // a remark kept with the receipts, for an auditor
}

interface Report {         // reports owed to the funder
  id: string; grantId: string; kind: 'interim'|'final'; dueDate: string;
  submittedDate?: string; status: 'upcoming'|'drafting'|'submitted'|'accepted';
}

// --- QuickBooks: read-only. People assign what it sends; nothing is written back. ---

interface QuickBooksConnection { connected: boolean; company: string; lastSyncedAt: string; } // ISO date-time
interface QbAccount { code: string; name: string; }   // "6200", "Contract instructors"
interface QbClass { id: string; name: string; }       // "Herb Alpert GOS"

interface Transaction {    // one expense as QuickBooks sent it; never retyped
  id: string; date: string; payee: string; memo: string;
  accountCode: string; classId?: string; amount: number;
  ref: string;             // how QuickBooks knows it: "Bill 1047", "Check 2210", "Expense"
  status: 'to-assign'|'assigned'|'not-grant-funded';
  assignedById?: string; assignedAt?: string;   // who assigned or set it aside, and the day
}

interface Allocation { grantId: string; budgetLineId: string; amount: number; } // one part of an assignment

interface SplitRule {      // "Always split Signal Hill Properties this way"
  id: string; payee: string;
  parts: Array<{ grantId: string; budgetLineId: string; percent: number }>;
}

interface GrantFile {      // a file stored with a grant: the award letter, or the backup for one expense
  id: string; grantId: string;
  expenseId?: string;      // set when the file backs up one expense
  kind: 'award-letter'|'agreement'|'receipt'|'invoice'|'timesheet'|'other';
  name: string; format: 'pdf'|'jpg'|'png'|'heic'; sizeKb: number; pages?: number;
  uploadedById: string; uploadedAt: string;
}

interface ReminderPlan {   // one report's reminder emails; a report without one follows the defaults
  reportId: string;
  offsets: number[];       // days before the due date; 0 is the due date itself
  recipientIds: string[];
  keepReminding: boolean;  // keep emailing after the due date until it is marked submitted
}

interface ReminderDefaults {  // the office's reminder settings, one record
  offsets: number[]; alsoNotifyIds: string[];   // emailed as well as the grant owner
  keepReminding: boolean;
  repeatEveryDays: number; // days between emails once the due date has passed
  sendHour: number;        // 24-hour clock: 8 is 8:00 am
}

interface Activity {       // audit trail, mostly automatic
  id: string; grantId: string; at: string; who: string; text: string;
}

interface StaffMember { id: string; name: string; role: string; }

type ProgramId = 'studio-sessions'|'in-school'|'homeschool'|'jazz-legacy'|'advanced-workshop'|'general-operating';

interface ChecklistTemplate {   // the "playbook" — what to do in each phase
  id: string; name: string;     // "Foundation grant (standard)", "Government grant"
  items: Array<{ phase: Phase; title: string; offsetDays: number; anchor: 'applicationDue'|'periodStart'|'periodEnd'|'submitted'|'decided' }>;
  // offsetDays is relative to the anchor date, negative = before. Used to compute task due dates on onboarding.
}
```

### How the money nouns link
- A **grant** has payments, award terms, budget lines, expenses, reports and files.
- A **budget line** maps to QuickBooks: one or more **accounts** (`accountCodes`) and one **class**
  (`classId`). A transaction matches the line when its account is one of the line's accounts and,
  when QuickBooks gave the transaction a class, the class is the line's class. A line is *mapped*
  when it has at least one account and a class.
- A **transaction** belongs to QuickBooks and is never edited. Once assigned, its parts are the
  **expenses** that carry its `transactionId`: one expense when it sits on one line, two to four
  when it is split. The parts add up to the transaction's amount. Reassigning replaces the parts;
  sending it back or setting it aside removes them.
- An **expense** without a `transactionId` was logged by hand, for something that never went
  through QuickBooks. It counts against its line like any other.
- A **split rule** belongs to a payee. While every line it names still exists, it is the
  suggestion for every new transaction from that payee.
- A **file** with an `expenseId` is backup for that expense and goes when the expense goes. A file
  without one is kept with the grant itself (award letter, signed agreement, other).
- A **report** follows its own **reminder plan** if it has one, else the **reminder defaults**,
  sent to the grant owner plus `alsoNotifyIds`.

### Derived data (never stored)
- **Deadlines** — one flat list across all grants: every dated task not done, every report not
  submitted, every payment not received, and the grant-level dates (loiDue, applicationDue,
  decisionExpected, periodEnd). Each has `{date, kind, label, grantId, status: 'overdue'|'due-soon'|'upcoming'}`.
  `due-soon` = within 14 days.
- **Per-grant money** — `received = Σ payments.receivedDate`, `expectedRemaining = Σ payments not
  received`, `spent = Σ expenses`, `remaining = amountAwarded − spent`, `plannedTotal = Σ budgetLines.planned`.
- **Pacing** — for each tracked grant and each of its budget lines: money used against time gone,
  with a status word. Rules in 4.9.
- **Suggestions** — what the portal proposes for each transaction waiting to be assigned. Rules in 4.9.
- **Reports owed and the reminder schedule** — rules in 4.9.
- **Fiscal-year totals** — FY runs Jul 1 – Jun 30. Requested (submitted this FY), awarded,
  received, spent.
- **Pipeline counts** — grants per phase.

### Persistence
`localStorage` under one key, seeded with demo data on first load. "Reset demo data" in settings.
A `repository` module wraps every read/write so Supabase can replace it later without touching screens.

---

## 3. Seed data (realistic, for the demo)

Staff: Barry Cogert (Program Director), Denise Moreno (Office Administrator), Albert Alva (Co-founder / Artistic Director).

Programs: Studio Semester Sessions, In-School Program (Paramount Unified), Homeschool Program,
Jazz Legacy Program, Advanced Jazz Workshop, General operating.

Funders and grants (today is 2026-09-13; FY27 started 2026-07-01):

| Funder | Grant | Phase | Requested | Awarded | Key dates |
|---|---|---|---|---|---|
| Herb Alpert Foundation (foundation) | General operating support 2026 | active | 50,000 | 50,000 | period Jul 1 2026 – Jun 30 2027; payments 25k received Jul 15, 25k expected Jan 15; interim report due Jan 31 2027; final due Jul 31 2027 |
| Los Angeles County Department of Arts and Culture (government) | Organizational Grant Program FY26-27 | reporting | 25,000 | 22,000 | period Jul 2025 – Jun 2026; final report due Sep 30 2026 (17 days out — due soon) |
| Long Beach Community Foundation (foundation) | Youth Music Access | active | 10,000 | 8,500 | period Mar 2026 – Feb 2027; report due Mar 15 2027 |
| City of Signal Hill Community Grant (government) | Studio equipment and sheet music | submitted | 6,000 | — | submitted Aug 20 2026; decision expected Oct 15 2026 |
| Port of Long Beach Community Sponsorship (corporate) | In-School Program expansion | applying | 15,000 | — | application due Oct 3 2026 (20 days); startBy Sep 1 |
| Ralph M. Parsons Foundation (foundation) | Jazz Legacy Program | loi | 30,000 | — | LOI due Sep 26 2026 (13 days); LOI required |
| California Arts Council (government) | Arts Education Exposure | prospect | 18,000 | — | startBy Oct 1 2026; application due Dec 5 2026 |
| Arts Council for Long Beach (government) | Community Project Grant | applying | 7,500 | — | application due Sep 5 2026 — **overdue** (task "Submit application" not done) |
| Boeing Employees Community Fund (corporate) | Instrument repair fund | declined | 5,000 | — | decided Jun 2 2026 |
| Wells Fargo Foundation (corporate) | Homeschool Program 2025 | closed | 12,000 | 12,000 | closed May 2026 |

Give every pre-award grant a checklist from the standard template with a mix of done/undone tasks.

### The money side (from `design/saas/SAAS-BRIEF.md`; built by `grants/domain/seed.ts` and `seed-money.ts`)

QuickBooks Online is connected to the company "Jazz Angels Inc."; the last sync was today at 8:40 am.
Denise Moreno is the bookkeeper.

Chart of accounts: 6200 Contract instructors, 6410 Program supplies, 6420 Repairs and maintenance,
6500 Facility rental, 6510 Event space, 6520 Utilities, 6530 Telephone and internet, 6700 Insurance,
6710 Office, 6720 Software, 6800 Bank fees. Classes: Herb Alpert GOS, LBCF Youth Music, LA County OGP.

Three grants have money. Every one of their budget lines uses the usual five categories, mapped to
the same accounts and to the grant's own class:

| Category | Accounts | Herb Alpert planned / spent | Long Beach CF planned / spent | LA County planned / spent |
|---|---|---|---|---|
| Teaching artist stipends | 6200 | 22,000 / 12,650 | 4,500 / 1,800 | 12,000 / 11,900 |
| Sheet music and charts | 6410 | 3,000 / 680 | 800 / 240 | 2,000 / 1,960 |
| Instrument repair | 6420 | 5,000 / 2,020 | 1,200 / 385 | 3,000 / 2,900 |
| Venue and performances | 6500 | 12,000 / 1,800 | 1,200 / 0 | 3,000 / 2,800 |
| Admin and insurance | 6700, 6710 | 8,000 / 1,090 | 800 / 0 | 2,000 / 1,900 |
| **Total** | | **50,000 / 18,240** | **8,500 / 2,425** | **22,000 / 21,460** |

Across the three: awarded 80,500, spent 42,125, remaining 38,375.

- **Herb Alpert, General operating support 2026** (unrestricted, General operating, owner Barry):
  ten expenses. The first four are Jul 10 Nonprofits Insurance Alliance 1,090 · Jul 18 Signal Hill
  Music Service 1,240 · Jul 24 Melissa Hasin 1,450 · Aug 5 JW Pepper 268. Payments: 25,000 received
  Jul 15, 25,000 expected Jan 15, 2027. Seven award terms. Award letter (3 pages) and signed
  agreement (6 pages) stored. Spending fast: 36% used with 21% of the period gone, runs out around
  Jan 22, 2027; Teaching artist stipends drive it, 58% used, running out around Nov 8, 2026.
- **Long Beach Community Foundation, Youth Music Access** (restricted, Studio Semester Sessions,
  owner Denise; period Mar 1, 2026 to Feb 28, 2027): four expenses. One payment of 8,500 received
  Jul 20. Five award terms. Award letter (2 pages) stored. Spending slow: 29% used with 54% gone,
  about $4,000 unspent at this rate; Venue and performances and Admin and insurance have no spending.
- **LA County, Organizational Grant Program FY26-27** (reporting): 72 expenses over Jul 2025 to Jun
  2026, every one with its backup. Two payments of 11,000, both received. Five award terms. Award
  notice and signed contract stored. Period ended with $540 unspent.

Every seeded expense on a line came from an assigned QuickBooks transaction (86 of them, assigned by
Denise). Three Herb Alpert expenses (Aug 30 Long Beach Band Repair 780, Sep 2 Sheet Music Plus 412,
Sep 8 Albert Alva 1,600) and one Long Beach expense (Sep 4 Albert Alva 900) have no backup yet.

Transactions: 14 to assign, 86 assigned, 41 not grant-funded (Intuit QuickBooks, Verizon Business
and Gusto every month for twelve months, and five Farmers and Merchants Bank fees), 141 in all.
Eight of the 14 to assign have a suggestion that one click accepts. The studio rent of $2,400 from
Signal Hill Properties (6500, no class) fits Venue and performances on both Herb Alpert and Long
Beach and is the split example. Three more transactions wait in QuickBooks and arrive on the next
sync (JW Pepper 142, Devon Price 300, Verizon Business 85). No split rules are saved.

Reports owed, soonest first: LA County final, Sep 30, 2026 (drafting, due soon) · Herb Alpert
interim, Jan 31, 2027 · Long Beach final, Mar 15, 2027 · Herb Alpert final, Jul 31, 2027 (all not
started). Wells Fargo's final report was accepted in April 2026.

Reminder defaults: 30, 14 and 3 days before, to the grant owner and Denise Moreno, at 8:00 am, not
after the due date (repeat every 3 days when switched on). The LA County final report has its own
plan: 30, 14 and 3 days before and on the due date, to Barry and Denise, and keep reminding. Its
30-day email went on Aug 31; the next is Wed, Sep 16.

Standard checklist template ("Foundation grant — standard"):
- prospect: Confirm eligibility and fit (startBy), Read last year's 990 / funder priorities, Add funder contact
- loi: Draft LOI (loiDue −14), Board chair review (loiDue −5), Submit LOI (loiDue)
- applying: Confirm attachments list with funder (applicationDue −45), Update program narrative (−30), Build project budget (−21), Gather IRS determination letter and board list (−21), Update financial statements (−14), Director review (−7), Submit application (0)
- submitted: Send thank-you / confirmation note (submitted +3), Follow up if no decision (decisionExpected +14)
- awarded: Countersign grant agreement (decided +14), Send acknowledgement letter (decided +7), Set up budget lines (decided +14), Schedule reports (decided +14)
- active: Reconcile expenses monthly (periodStart +30, repeating in spirit; one task is fine)
- reporting: Draft interim/final report (report due −21), Collect attendance and outcomes data (−30), Submit report (0)
- closed: File final acknowledgement, Archive folder

---

## 4. Screens

Shell: the portal frame from the design system — 236px deep-blue Sidebar with logo, 60px white
TopBar with title/subtitle/actions, `main` scrolls on the paper background with 32px padding.
Sidebar items: **Overview** → Dashboard, Deadlines · **Grants** → All grants, Funders · **Office** → Playbook, Settings.
The money screens sit in their own **Money** section: Transactions (badge: count to assign),
Budget vs. actual, Spend-down (badge: count of grants spending fast or slow).
Footer shows the signed-in person (Barry Cogert, Program Director).

### 4.1 Dashboard  `/`
"What needs my attention today."
- Stat row (4 StatCards): *Awarded this FY* (gold rule), *In pipeline* (blue; sum of requested for pre-award grants), *Received vs awarded* (teal; "$33,500 of $58,500"), *Needs attention* (danger; count of overdue + due-soon).
- **Attention** card: list of overdue and due-in-14-days deadlines, most urgent first. Each row: date (mono), what (task/report/application/LOI/payment), grant title + funder, owner avatar, Badge Overdue/Due soon. Row click → grant.
- **Pipeline** card: the 8 phases as a horizontal strip with counts and requested/awarded totals under each. Click → All grants filtered by phase.
- **Coming up** card: next 30 days grouped by week.

### 4.2 All grants  `/grants`
- Tabs: Active (everything not closed/declined/withdrawn), Pre-award, Post-award, Closed, All — with counts.
- Toolbar: search (funder or title), owner Select, program Select, phase Select. Button "Add grant" (primary).
- DataTable columns: Funder (strong) · Grant · Program · Requested (mono, right) · Awarded (mono, right) · Next deadline (mono, with Badge if overdue/soon) · Owner · Phase (Badge).
- Row click → grant detail. Empty state: "No grants in this view yet. Add a grant to start tracking it."

### 4.3 Add grant (onboarding)  dialog over `/grants`, 3 steps
1. **Funder & program** — funder (Select of existing + "New funder…" that reveals name/type/contact fields), grant title, Jazz Angels program, restriction, owner.
2. **Amount & dates** — amount requested, LOI required (Switch) → LOI due, application due, expected decision, grant period start/end, "Start working by" (defaults to 45 days before application due).
3. **Checklist** — pick a template (default "Foundation grant — standard"); preview the tasks with computed due dates; uncheck any that don't apply. "Create grant" creates the grant in `prospect` (or `loi`/`applying` if the user says they've already started) plus the tasks and the standard document register (narrative, budget, IRS letter, board list, financials as `needed`).

### 4.4 Grant detail  `/grants/:id`
Header (TopBar): breadcrumb Grants / Funder name; title = grant title; subtitle = funder · program · owner.
Actions: the *next-phase* button for the current phase (e.g. "Mark submitted", "Record award") as primary, "Record decline" as secondary/danger where relevant, an overflow for Withdraw.

Body:
- **Phase stepper** — full-width card: the phases as connected steps; done steps teal with check, current step blue, future steps grey. Declined shows a red stop marker. Under each done step, the date it happened.
- Two-column layout (2fr / 1fr):
  - Left, tabbed. The tab is in the URL as `?tab=<id>`; the first tab has no parameter, and an
    unknown or unavailable tab falls back to the first. Changing tab drops `expense` and `backup`.
    The tab list depends on the phase:

    | Phase | Tabs, in order | Opens on |
    |---|---|---|
    | Pre-award (prospect, loi, applying, submitted) and declined, withdrawn | **Checklist** · **Documents** · **Activity** | Checklist |
    | Post-award (awarded, active, reporting, closed) | **Award** · **Budget** · **Expenses** · **Reports** · **Documents** · **Checklist** · **Activity** | Award |

    Budget, Expenses and Documents show a count when it is above zero (lines, expenses, files kept
    with the grant).
    - Checklist: tasks grouped by phase; each row Checkbox, title, due date (mono; red if overdue), assignee avatar. "Add task". Completed tasks shown struck through and greyed. Progress bar "8 of 12 done" at the top.
    - Documents: the files stored with the grant, and the application register. See 4.10.5.
    - Award, Budget, Expenses, Reports: the money side of the grant. See 4.10.1 to 4.10.4.
    - Activity: timeline of Activity rows, plus a note box "Add a note".
  - Right column, by tab: **Award** shows the award letter card (4.10.1); **Expenses** shows the
    chosen expense (4.10.3); **Budget** has no right column, the table takes the full width; every
    other tab shows the cards **Key dates** (all `dates` fields with labels, editable via a small Dialog), **Funder** (name, type, contact, cycle notes, link to funder page), **Details** (amount requested/awarded, restriction, program, owner, notes).
  - On the Budget and Expenses tabs the top bar also shows when QuickBooks last synced.
  - Under the Reports tab, a separate **Program numbers** card (4.10.4).

Phase transitions (buttons open a small confirm Dialog that captures the date and, for award, the amount/period):
- prospect → applying ("Start application") or → loi if loiRequired ("Start LOI")
- loi → applying ("LOI accepted, start application")
- applying → submitted ("Mark submitted": submitted date)
- submitted → awarded ("Record award": amount awarded, period start/end, decided date) or → declined ("Record decline": date, reason note)
- awarded → active ("Agreement signed")
- active → reporting ("Start report") · reporting → active ("Report submitted") or → closed ("Close grant")
- any pre-award → withdrawn
Every transition writes an Activity row.

### 4.5 Deadlines  `/deadlines`
- Toggle (Tabs): **List** · **Calendar**.
- List: all derived deadlines grouped by month, each row date · kind Badge · label · grant · owner · status Badge. Filter by owner and kind. Overdue section pinned on top.
- Calendar: month grid (Mon–Sun), 6 rows, each day cell lists up to 3 deadline chips (kind-coloured 3px left rule, truncated label) and "+2 more". Prev/next month, "Today". Click chip → grant.

### 4.6 Funders  `/funders` and `/funders/:id`
- List: DataTable — name, type, contact, grants (count), total awarded (mono), last activity. "Add funder".
- Detail: contact card + history table of every grant with this funder (title, year, phase, requested, awarded).

### 4.7 Playbook  `/playbook`
The checklist templates. Left: list of templates. Right: the selected template's items grouped by
phase, each with title and timing ("21 days before application due"). Edit title/offset inline,
add/remove items, "Duplicate template". This is the page that turns one person's process into
something anyone can follow — give it a one-line explanation at the top.

### 4.8 Settings  `/settings`
Staff list (name, role), programs list, fiscal-year start, "Export data (JSON)", "Import", "Reset demo data".
The grants module adds two cards: **QuickBooks Online** and **Report reminders** (4.14).

### 4.9 The money side: rules every money screen follows
Sections 4.9 to 4.15 describe what the code does today. The numbers and words below are the
constants in `src/modules/grants/domain/money.ts` unless another file is named.

**QuickBooks is read-only.** Transactions arrive from QuickBooks; people assign them to budget lines
and never retype them. Nothing is written back: assigning, splitting, setting aside, sending back,
reassigning and deleting change only the portal. The screens say so where it helps trust
("Read only, nothing is written back", "Splitting here does not change QuickBooks").
- **Sync** moves everything waiting in QuickBooks (`incoming`) onto the transaction list and stamps
  the sync time. In the POC the waiting transactions are seed data and a second sync brings nothing.
  Sync is offered on Transactions and on the Settings card, and only while connected.
- **Disconnected**: what is already here stays and can still be assigned; nothing new arrives. The
  money screens say "QuickBooks is not connected" and link to Settings.

**Which grants have money** (`isTracked`): phase awarded, active or reporting, with an award amount
on record. Closed grants are history: they appear only in Budget vs. actual's "All" and "Last fiscal
year" views. Tracked grants are listed by period end, latest first.

**Which lines a transaction can go on** (`eligibleLines`): the budget lines of grants that are
awarded or active, have an award amount, and whose period covers the transaction's date (a missing
start or end counts as open). A grant in reporting no longer takes new spending.

#### Pacing
Straight-line: spending so far, carried forward at the same daily rate. The same rule runs for a
grant (its award against everything spent on it) and for each budget line (its planned amount
against the expenses on it), over the grant's period.

- Days are counted inclusively: day one of the period is 1. `daysTotal = end − start + 1`.
  `elapsed = daysElapsed / daysTotal`, `used = spent / budget`. A month is 365 / 12 days.
- **Not started**: no period dates, or today is before the start. Headline "Starts Jul 1, 2027" or
  "No grant period yet".
- **Period ended**: today is after the end. Headline "$540 left unspent", "$200 over" or "Fully spent".
- Otherwise, with `perDay = spent / daysElapsed`:
  - `runsOutOn` = start + ⌊budget / perDay⌋ days, kept only when it falls before the end.
  - `projectedSpent` = perDay × daysTotal, rounded, capped at the budget; `projectedUnspent` = budget − that.
  - `perMonthSoFar` = perDay × 365/12; `perMonthNeeded` = remaining ÷ months left.
  - `gap = used − elapsed`. The status is the first that applies:
    1. **Spending fast**: spent is over budget, or `gap` is more than the fast margin *and* the money
       runs out before the end. The fast margin is `GRANT_PACE_MARGIN = 0.1` for a grant and
       `LINE_FAST_MARGIN = 0.25` for a line ("lines are lumpier than grants").
    2. **Ahead of pace** (lines only): `gap` is more than `GRANT_PACE_MARGIN` (0.1) but not fast.
    3. **Spending slow**: `gap` is below −0.1 (`GRANT_PACE_MARGIN`, for grants and lines alike).
    4. **On track**.
  - Headlines: "$X over budget" · "Runs out around Jan 22, 2027" · "No spending yet" or "About
    $4,000 unspent on Feb 28, 2027" · "Ahead of pace" · "On course to finish on time".
- "About" money rounds to $10 under $1,000 and to $100 above (`aboutMoney`). Percentages are whole,
  and an exact half rounds up (`wholePercent`).

The badge words are `PACE_LABEL`: **On track**, **Spending fast**, **Spending slow**, **Ahead of
pace**, **Period ended**, **Not started**. Tones (`screens/money/shared.tsx`, `PACE_TONE`): on
track teal, spending fast gold, spending slow olive, the other three neutral. A bar is drawn gold
when spending fast and red past 100%; a tick on the bar marks the share of the period gone.

- **A line needs attention** (`lineNeedsAttention`) while the period runs and the line is spending
  fast, over budget, or has nothing spent with more than 20% of the period gone. Warnings come
  before a line goes over, not only after.
- **The driver** (`paceDriver`): when a grant is spending fast, its fast line with the highest
  share used.
- **Off pace** (`offPaceGrants`): tracked grants spending fast or slow. This is the number on the
  Spend-down rail item and each one is a dashboard attention row.

#### Transactions: suggest, assign, split, set aside, undo
A transaction is **To assign**, **Assigned** or **Not grant-funded**.

**Suggestion** (`suggestionFor`), the first that applies:
1. **Split rule**: the payee has a saved rule and every line it names still exists. Proposes the
   rule's parts; a one-part rule reads as a plain line marked "Rule". The rule does not check the
   transaction's date against the grants' periods.
2. **One line**: exactly one eligible line matches (its accounts include the transaction's account
   and, when the transaction has a class, the class matches).
3. **Ambiguous**: more than one matches. No one-click accept; the row says "6200 fits two grants.
   Pick one or split." (or "fits three lines" when they are on one grant) and the line picker lists
   those first under "Fits 6200".
4. **Not grant-funded**: nothing matches and this payee has been set aside at least twice before.
   Shows "Last N months", N being the number of distinct months it was set aside.
5. **None**: "No budget line uses 6520 yet".

**Accept** takes one row's suggestion. **Accept N suggestions** (shown on the To assign tab when
any wait) takes every line, split and not-grant-funded suggestion at once; ambiguous and none are
left for a person. Rule percentages become whole dollars that add up to the amount, the last part
taking the rounding (`splitByPercent`).

**Assign** (`assignTransaction`) puts a transaction on one line or splits it. For each part it
writes an Expense with the transaction's date, payee and memo (as the note) and its
`transactionId`, and an Activity row on that part's grant: "Assigned $1,800 from Signal Hill
Properties to Venue and performances (split of $2,400)". It replaces any parts the transaction had
before, marks it Assigned, and records who and when.

**Set aside** (`markNotGrantFunded`): overhead no grant pays for. Removes any parts and their backup.
**Send back** (`unassignTransaction`): back to To assign; removes its parts and their backup files.
Neither writes an Activity row.

**Undo**: every assign, accept, set aside and send back on Transactions shows a toast with **Undo**,
which works once and puts the transactions back to their status and parts before the change.

**Split rule** (`saveSplitRule`): "Always split Signal Hill Properties this way". Ticked when saving
in the split panel, it stores the parts as percentages (to two decimals) for that payee, replacing
any rule it had. Unticking an existing rule and saving deletes it. Rules apply only through the
suggestion: the next transaction from that payee arrives with the rule proposed and still needs Accept.

#### Backup
- Each expense keeps its receipts, invoices and timesheets as files. An expense with no file is
  **Missing backup**. Accepted: PDF, JPG, PNG, HEIC, up to 20 MB each (`MAX_FILE_MB`,
  `screens/money/files.tsx`). A new file's kind is guessed: a PDF is an invoice, an image a receipt.
- Backup goes with its expense: deleting an expense, sending its transaction back or setting it
  aside deletes its files.
- In the POC a file's details are stored, not its contents. A file added this session opens and
  downloads as itself until reload; a seeded one is drawn from what the portal knows and downloads
  as a short text note.

#### Reports and reminders
- **Reports owed** (`reportsOwed`): reports not submitted (no submitted date, status not submitted
  or accepted) on grants that are not closed, declined or withdrawn, soonest due first. A report is
  *due soon* within 14 days (`DUE_SOON_DAYS`, `derive.ts`) and *overdue* after its due date.
- **Reminder days** (`REMINDER_OFFSETS`): 30, 14, 7 and 3 days before, and on the due date (0).
  No other day can be chosen.
- **Which plan** (`reminderPlanFor`): the report's own plan, else the office defaults: their days,
  sent to the grant owner plus the defaults' "also notify" people, with their keep-reminding setting.
- **Schedule** (`planSchedule` for any plan, the reminders panel's draft included;
  `reminderSchedule` for a report's saved plan): each chosen day is dated due date minus the
  offset. Emails go out in the morning, so an email dated today or earlier counts as **sent**; the
  first one after today is **next**; the rest are **scheduled**. `nextReminder` is the earliest next
  email across every report owed (or the reports given), repeats included. The Reports owed banner
  and chips, the Deadlines bell and the reminders panel all read these.
- **Keep reminding after the due date**: an email every `repeatEveryDays` days (an office-wide
  setting, 1 to 30) after the due date, the first on the due date plus that many days, until
  someone marks the report submitted. The schedule lists the repeats up to and including the first
  one after today, each marked as a repeat (offset -3 is three days after the due date); the chips
  show them as the one repeat mark, outlined in gold when a repeat is the next email.
- **Submitted**: a submitted report gets no next email and no repeats; a reminder day after the
  day it was submitted is off.
- **Send hour**: the defaults' `sendHour`, chosen from 6:00 am to 6:00 pm.
- **Emails are previewed, never sent.** "Send a test to me" says "Test not sent".
- Marking a report submitted takes it off the owed list and stops its reminders. Deleting a report
  deletes its plan.

#### What writes to the activity timeline
Assigning a transaction (one row per part), a payment received, a report submitted, an award record
edited, and an award letter stored, replaced or removed. Budget line edits, expense moves, set aside
and send back do not.

### 4.10 Grant tabs after the award  `/grants/:id`

#### 4.10.1 Award  (default post-award tab, no `tab` parameter)
The award as the letter states it. Three bands:
- **Award record**, with "Edit record". Facts: Award amount (or "Not recorded. Add it"), Grant
  period, Date awarded, Restriction (Badge), Funder (link), Program, Owner, Contact (mailto link).
  *Edit record* opens a dialog: amount awarded, date awarded, period start and end, restriction,
  program, owner. It rejects a non-whole amount and an end before the start. Saving with changes
  writes "Award record edited: amount $45,000 to $50,000; …" to the activity timeline.
- **Payment schedule**, with "Add payment". Note "$25,000 of $50,000 received". Table: Installment
  (opens the edit dialog), Expected (red when past and not received), Amount, Status ("Received Jul
  15, 2026", or a Badge Overdue/Expected with "Mark received", which stamps today), Source ("p. 1"
  opens the award letter at that page; plain text when no letter is stored). Row click edits. The
  payment dialog: installment, expected, amount, award letter page, received date; Delete when
  editing. When the schedule does not add up to the award: "The schedule adds up to $X, $Y less than
  the award." Empty: "No installments yet. Add each payment the award letter promises, then mark it
  received when it arrives."
- **Terms and restrictions**, with "Add term". Each term: label, the wording, the page link, and a
  delete with an inline confirm. Click a term to edit it. Empty: "No terms yet. Add each condition in
  the award letter, with the page it is on, so the budget and the spend-down warnings can point back
  to it." Spend-down reads two terms by label: "Unspent funds" and "Budget changes" (4.13).

Right column, **Award letter** card: Badge Uploaded / Not stored. With a letter: its pages on a
small stage with a page turner, name, size and pages, who uploaded it, and Open, Download, Replace.
Replacing removes the old letter and notes it in activity. Without one: a drop zone ("Drop the
award letter here or choose it", PDF, JPG, PNG or HEIC, up to 20 MB). Under it, every other file
kept with the grant (Open, Download).

#### 4.10.2 Budget  `?tab=budget`, `&line=<lineId>`, `&edit=<lineId|new>`
The approved budget, line by line, and how each line maps to QuickBooks.
- URL: `line` highlights that row and scrolls it into view; `edit` opens that row (or a new one) in
  the editor and is then dropped from the URL. Saving a line sets `line` to it.
- **Figures**: Awarded (with "Award letter, Jul 6, 2026"), Budgeted ("Across 5 lines"), Unallocated
  ("Budget matches the award", "$X of the award is not on a line yet", or "Budget is $X over the
  award"), Lines, Mapped ("5 of 5", "Every line is mapped" or "2 lines need an account or a class").
- Band "Budget lines": "A QuickBooks transaction matches a line when its account and class both
  match." Button "Add line". When QuickBooks is disconnected, a note that matching resumes on reconnect.
- Table: Category (with a pace mark when the line is spending fast or slow), Approved, QuickBooks
  accounts (chips, or "Not mapped"), QuickBooks class (or "Not mapped"), Matched so far (dollars
  and expense count, opening those transactions; "Nothing yet"), and a row menu: Edit line, View
  transactions (`/transactions?tab=assigned&grant=…&line=…`), See pacing (`/budget?grant=…`),
  Remove line. A total row: "Equals the award", "$X under the award" or "$X over the award".
- **Editing in place**, one row at a time; clicking another row while one has unsaved changes says
  "Finish the line you are editing". Fields: category (required, unique on the grant, ignoring
  case), approved amount (whole dollars; blank is $0), QuickBooks accounts (a searchable picker
  listing every expense account and which line on this grant already uses it), QuickBooks class (a
  new line starts with the class most of the grant's lines use). The hint under the row says how
  spending will match, and warns when another line on the grant has the same account and class:
  "6200 Contract instructors also counts on Teaching artist stipends, so its transactions will ask
  which line." Enter saves, Escape cancels.
- **Remove line**: allowed only when nothing is matched to it ("Nothing is matched to it yet, so no
  expense is affected"). With expenses on it, it says how many and links to them; there is no way to
  move them all at once (tracked in #13).
- Empty: "No budget lines yet", with **Start from the usual five categories** (adds the five
  categories at $0 with their usual accounts and no class) and **Add line**.

#### 4.10.3 Expenses  `?tab=expenses`, `&expense=<expenseId>`, `&backup=missing`
Every expense counted against this grant, with its backup.
- **Figures**: Expenses (count and total), Backup attached (count and files), Missing backup (count
  and total). **Download all backup** saves a spreadsheet index, `herb-alpert-backup-index.csv`:
  date, payee, budget line, amount, QuickBooks account, class and reference ("Entered by hand" for
  one logged by hand), description, file names or MISSING, backup note, and a total row.
- A band with the sync time ("From QuickBooks, synced today, 8:40 am. Newest first.") and a switch:
  **All** · **Missing a receipt** (sets `backup=missing`).
- Table, newest first: Date, Payee (tagged "Split" when the transaction has several parts, "By hand"
  when there is no transaction), Budget line, Amount, Backup ("2 files" or a gold "Missing" Badge).
  More than 12 rows scroll inside the card. A total row. Click a row to choose it (`expense=`);
  click it again to let go.
- Under the table: "Log an expense by hand", for something that never went through QuickBooks.
  Dialog: date, amount, payee, budget line, what it was for. With no budget lines it says to add
  them on the Budget tab first.
- **Right column**: on a wide screen the tab opens with the newest expense missing backup chosen
  (else the newest). With nothing chosen, a card says how the backup stands and offers "Start with
  the missing ones". The chosen expense shows: previous / next ("9 of 10") and close; payee, amount,
  date, Badge Backup complete / Missing backup; Budget line (opens the Budget tab on that line),
  Description, QuickBooks account and class, or "Source: Entered by hand"; a locked line "Came from
  QuickBooks as bill 1047, assigned by Denise Moreno on Jul 19. Amounts are read only here."; the
  backup files (Open, Download, Remove with a confirm) and a drop zone; a **Note** kept with the
  backup, saved when the field loses focus or with Save, included in the download.
  - **Reassign**: move the expense to another line on the same grant. Only the line changes.
  - **Send back to Transactions** (from QuickBooks): a confirm says it takes every part of the
    transaction off the budget and deletes their backup, and that QuickBooks is not changed.
  - **Delete** (by hand): a confirm, then the expense and its backup are gone.
- Empty: "Nothing spent against this grant yet. Expenses arrive from QuickBooks…", with "Go to
  Transactions" and "Log an expense by hand". Missing filter with nothing missing: "Every expense
  has its backup", with "Show all expenses".

#### 4.10.4 Reports  `?tab=reports`
What the funder is owed and when, and who gets reminded.
- Table, by due date: Kind (Badge, Final gold, Interim neutral), Due (date, then "Due in 17 days",
  "Due today", "3 days overdue", or "Submitted Apr 22"), Status (Not started, Drafting, Submitted,
  Accepted, with a "Mark submitted" link while open), Reminders (the chips and "To Barry and Denise ·
  first Jan 1", or "Reminders stopped"), and actions: **Reminders** (opens
  `/deadlines?kind=report&report=<id>`), edit, delete (asks "Delete this report and its reminders?").
- **Mark submitted** stamps today, sets the status Submitted, logs "Final report submitted" and
  stops its reminders. It does not change the grant's phase.
- "Add report": kind, due date, status, and the submitted date when the status is Submitted or
  Accepted. A new report follows the reminder defaults. Editing moves its reminders with the due date.
- Empty: "No reports scheduled yet. Add the ones the award letter asks for."
- **Program numbers** card, under the tab, once the grant is post-award and has a period start:
  meetings held, students served and attendance from Teaching, and teaching hours from Timesheets,
  from the period start to today (or the period end, if earlier). A general operating grant counts
  every program; any other grant only its own. When Teaching or Timesheets is turned off it says
  which and links to Settings; with no roll call yet: "No numbers yet".

#### 4.10.5 Documents  `?tab=documents` (before and after the award)
Two lists:
- **Stored here**: files kept with the grant itself (not expense backup), newest first, each with a
  thumbnail, kind, size, who added it, and Open, Download, Remove (with a confirm). A drop zone takes
  several files; a dialog then asks what each one is: Award letter, Signed agreement or Other file,
  guessed from the name. A grant keeps one award letter: storing a new one replaces the old.
  Empty, post-award: "Nothing stored yet. Add the award letter or the signed agreement below…";
  pre-award: "…such as the final proposal or a letter from the funder…".
- **Application register**: the DataTable of what each application needs (name, kind, status Badge,
  updated, link icon), "Add document", row click edits (with Delete). Its rows link out to Drive or
  Dropbox; it does not hold files. Empty: "No documents listed yet. Add the first one below."

### 4.11 Transactions  `/transactions`
What QuickBooks sent, and where each one belongs. The bookkeeper works the To assign tab down to
nothing each week.
- Header subtitle: "QuickBooks Online is connected · Last synced today, 8:40 am · Read only, nothing
  is written back". Action: **Sync now** (shows "Syncing" for a moment, then "3 new transactions
  from QuickBooks" or "Nothing new in QuickBooks"); disabled while disconnected.
- URL parameters, all optional; any filter change returns to page 1:
  - `tab`: `to-assign` (default, omitted), `assigned`, `not-grant-funded`, `all`. Tabs show counts.
  - `q`: search payee or memo. `account`: one QuickBooks account code.
  - `period`: `30`, `90` (days), `fy` (this fiscal year), `all`. Default on To assign: the shortest
    of 30 days, 90 days and the fiscal year that still shows every waiting transaction; on the other
    tabs, all time.
  - `grant`, `line`: only transactions with a part on that grant or line; shown as removable chips.
  - `page`: 25 rows a page.
  - `tx`: opens the split panel for that transaction.
- Columns: Date (with the year when not this year), Payee and memo, Account (code and name),
  Amount, Grant and budget line. A row click opens the split panel. The last cell depends on status:
  - **To assign with a suggestion**: the suggested line and grant (or, from a saved rule, "Split ·
    Herb Alpert and Long Beach CF · 75% and 25%"; or "Not grant-funded · Last 12 months"), marked "Suggested", with
    **Accept** and a **Change** link that swaps in the picker.
  - **To assign without one**: a "Choose grant and line" select grouped by grant (only eligible
    lines; "No open grant covers this date" when none), the hint, and links **Split** and **Not
    grant-funded** (and **Keep suggestion** when changing).
  - **Assigned**: the line and funder, or each part with its amount, then "Denise, Sep 12"; a menu:
    Change (opens the panel), Send back to assign, See in grant (one per grant when split; opens the
    Expenses tab on that expense).
  - **Not grant-funded**: "Set aside · Denise, Sep 8"; a menu: Assign to a grant, Send back to assign.
- Each change shows a toast with Undo (4.9).
- Disconnected: a banner "QuickBooks is not connected. What is already here stays…" with Open Settings.
- Empty tab: To assign, "Everything from QuickBooks has a home" with Sync now (or Open Settings when
  disconnected); Assigned, "Nothing assigned yet"; Not grant-funded, "Nothing set aside yet"; All,
  "No transactions yet". Filters that match nothing: "No transactions match" with Clear filters.

#### 4.11.1 Split panel  `/transactions?tx=<transactionId>`
Docked on the right (`SidePanel`). Title: payee and amount; under it date, memo, account, and "From
QuickBooks. Splitting here does not change QuickBooks." Eyebrow "Assign", or "Split across grants"
with more than one part.
- **Starting parts**: where it is now, if assigned; else the saved rule; else the suggested line;
  else, when ambiguous, the candidate lines, bigger award first, at most four, shared evenly (or
  75/25 for Signal Hill Properties, a share written into the screen; tracked in #12); else one empty part.
- Each part: grant (eligible grants on the transaction's date, plus any grant already on a part),
  line, percent and dollars. Changing the grant picks the line with the same category, else one that
  uses the transaction's account, else the first. With two parts, editing one gives the rest to the
  other. Under each part: "Line spent $1,800 of $12,000, $3,600 after this split, over by $X".
- A bar and legend show each part's share. "Add another grant", up to four parts (`MAX_PARTS`).
  "Split evenly". "Give the rest to the last part" / "Take the extra off the last part".
- A check line: "Parts add up to $2,400 · $0 left", or "$X left to place", "$X too much".
- **Save split** / **Assign** is disabled until every part has a grant and a line, no two parts
  share a line, every part is above $0, and the parts add up exactly. The problems are listed.
- "Always split Signal Hill Properties this way" (or "Always assign …") saves or removes the rule (4.9).
- The row behind the panel shows the draft as it is edited ("Editing on the right").

### 4.12 Budget vs. actual  `/budget`
Every grant with money and each budget line, spent against an even pace.
- URL: `period` = `fy` (default, omitted: tracked grants whose period touches this fiscal year, plus
  any grant in reporting), `fy-prev` (tracked and closed-with-award grants touching last fiscal
  year; offered only when one does), `all` (every tracked grant and every closed grant with an
  award). `grant=<id>` opens that grant and scrolls to it.
- Header subtitle with the sync time. Actions: the period select, **Excel** (saves
  `budget-vs-actual-FY27.csv`: grant, funder, line, budgeted, spent, remaining, percent used,
  percent of period gone, status, projection) and **PDF** (prints the page).
- Stat cards: **Awarded** ("3 grants, each shown below"), **Spent** (with % used; "Assigned from
  QuickBooks, read-only"), **Remaining** ("Includes $540 left on LA County, ended"), **Lines needing
  attention** ("3 of 10 lines · 1 spending fast · 2 with no spending yet").
- Table "Budget lines by grant", legend, "No lines over budget" or "2 lines over budget", Expand all
  / Collapse all. A grant row: title (opens its Budget tab), funder and restriction, period
  ("Jul 1, 2026 – Jun 30, 2027 · 21% gone", "· ended", "· closed"), budgeted, spent, remaining, the
  pace bar, %, the pace Badge and its headline, and for an ended grant "Final report due Sep 30"
  (opens its reminders). Grants open by default unless their period has ended.
- A line row: category (opens the Budget tab on that line), the numbers, the bar (gold when
  fast), the pace mark, and "No spending yet with 54% of the period gone" when idle. A line over
  budget or spending fast gets a band: "58% used with 21% of the period gone. At this rate the line
  runs out around Nov 8, 2026, nearly eight months before the grant ends." with View transactions.
- A grant with no lines: "No budget lines yet. Add them to see which parts of the award are
  spending fast or slow." with "Add budget lines".
- Empty: "No grants with money in FY27" with "Show all grants with money" (or "Go to grants" on All).

### 4.13 Spend-down  `/spend-down`
Whether each grant's money will be fully spent by its end date at today's rate.
- URL: `show` = `all` (default), `attention` (spending fast or slow), `ended`. The tabs show counts.
  `#<grantId>` scrolls to that grant, widening the filter if it hides it.
- Header: sync status and **Export** (`spend-down-2026-09-13.csv`, one row per grant with its
  figures, status, result and run-out date).
- Running grants first, spending fast, then slow, then ahead, on track, not started; ended last.
- **A running grant's card**: title (opens the grant), funder, period, award ("restricted" when it
  is), the pace Badge, **Open budget**; the cumulative spending chart against the even pace; figures
  Money used ("36% · $18,240 of $50,000"), Time gone ("21% · 75 of 365 days"), Spent per month so
  far, Needed per month to finish on time; "At this rate" with the headline; **What to do**; and
  "Show budget lines" (each line's bar and mark, opening its transactions).
- **What to do** (`whatToDo`, `screens/money/spend.ts`):
  - Spending fast with a driver: "Bring Teaching artist stipends down to about $980 a month, since
    they are 58% used and on course to run out around Nov 8, 2026, or move money in from Venue and
    performances, which is 15% used." (the line with the most left). Without a driver: bring spending
    down to the needed monthly amount.
  - Spending slow: the lines with nothing spent ("Venue and performances ($1,200) and Admin and
    insurance ($800) have no spending yet, so plan and book that spending now."), else raise
    spending to the needed monthly amount.
  - On track or ahead: keep to the needed monthly amount, and name the next report.
  - Over the award: move the extra to another source or ask the funder about a budget change.
  - A fast grant with a "Budget changes" term, or a slow grant with an "Unspent funds" term, adds
    "Under the award terms, …" with the term's wording.
- **An ended grant's card**, compact: Badge Period ended, the chart, Used, Time gone 100%, Spent per
  month, Needed per month "None, period over", Result ("$540 unspent"); "Nothing more can be spent,
  so report the $540 in the final report due Sep 30, 2026, 17 days from now, and ask the county
  whether to return it." (the last clause only with an "Unspent funds" term); links Open reports and
  Budget vs. actual.
- Empty: "No grants with money yet" with "Open grants". Needs attention with none: "Nothing needs
  attention". Ended with none: "No grant periods have ended".

### 4.14 Reports owed and reminders  `/deadlines?kind=report`
The Deadlines list filtered to reports becomes **Reports owed**. The calendar view keeps the plain
chips. `owner=<staffId>` filters by grant owner; `report=<reportId>` opens that report's reminders
panel (only while the report is open).
- **Reports owed card**: "4 reports to funders · reminder emails go out at 8:00 am". A banner names
  the next email across the reports shown: "Next reminder: Wed, Sep 16, the 14 day reminder for the
  LA County final report, to Barry Cogert and Denise Moreno." Rows: report (kind and funder, grant
  title), due (date and "17 days", "today", "3 days late"), Badge Overdue / Due soon / Upcoming with
  the report's own status, owner, the reminder chips and "To Barry and Denise · first Jan 1", and a
  menu: Edit reminders, Start drafting (when not started), Mark submitted, Open grant. Row click opens
  the panel. Chips: sent (teal, with a check), next (gold outline), scheduled (plain), and a repeat
  mark when it keeps reminding; a legend explains them.
- Under it, **Default reminders**: the default chips, "to the grant owner and Denise Moreno", and
  **Edit defaults**.
- Empty: "No reports owed. Every report is in…"; with an owner filter, "No reports owed for this
  owner" with "Show every owner".

#### 4.14.1 Reminders panel  `/deadlines?kind=report&report=<reportId>`
Docked on the right. Eyebrow "Reminders", title "Final report, LA County", subtitle "Due Wednesday,
Sep 30, 2026 · in drafting" (with "N days overdue" when late). It edits a draft; nothing changes
until **Save reminders**.
- A note: "Following the office defaults" (saving gives the report its own plan) or "This report has
  its own plan" with **Use the defaults** (removes the plan at once).
- **When to send**: the five days with their dates, tagged Sent, Next or "Already past". Past days
  cannot be changed.
- **Who gets the email**: every staff member, the grant owner first and labelled "Grant owner".
  With nobody ticked: "Pick at least one person to email", and Save is disabled.
- **Keep reminding after the due date**: a switch; "Every 3 days until someone marks it submitted."
- **Email preview**: from Jazz Angels Grants, the date and send hour of the next email, the subject
  ("Final report for LA County is due Sep 30") and the body ("Hi Barry and Denise, the final report
  for the Organizational Grant Program FY26-27 is due to the Los Angeles County Department of Arts
  and Culture on Wednesday, Sep 30, in 14 days. It is still in drafting." and "Open the grant to
  finish the checklist and upload the report."). With nothing left to send it says so. **Send a test
  to me** sends nothing: "Test not sent".
- Footer "Only this report changes", Cancel, Save reminders. Closing with unsaved changes asks
  "Discard your changes?". Choosing another report while editing discards the draft without asking.

#### 4.14.2 Default reminders  dialog from Deadlines and Settings
When to send (the five days), who else gets the email ("The grant owner always gets it"), keep
reminding, repeat every N days (1 to 30, only when keep reminding is on), emails go out at (6:00 am
to 6:00 pm). The description counts the reports with their own plan. Saving applies to every report
without one. **Settings** shows the same as a **Report reminders** card, with the reports that have
their own plan; and a **QuickBooks Online** card: company, last sync, transactions received,
waiting and to assign, the chart of accounts and classes with which lines use each, Sync now,
Disconnect (with a confirm), and when disconnected, Connect (a stand-in dialog; no QuickBooks
account is contacted) which syncs at once.

### 4.15 Money on the dashboard, and differences from the mockups
**Dashboard.** A **Money** card lists each tracked grant: short funder, title, the pace bar, "36%
used · 21% gone" (or "period over") and the pace mark; a row opens `/spend-down#<grantId>`. Under it,
links "14 transactions to assign" and "4 expenses missing a receipt" (opening the Expenses tab of the
first such grant, filtered to missing). The attention list gains a row per off-pace grant ("Spending
fast", dated the run-out day; "Spending slow", dated the period end), one for transactions to
assign, and one for expenses missing a receipt.

**Differences from the mockups** (`design/saas/`). The code is what this spec describes; these are
where it and the mockups or `SAAS-BRIEF.md` disagree:
- **Tabs.** The mockups show six post-award tabs: Award, Budget, Expenses, Reports, Documents,
  Activity. The code keeps **Checklist** as a seventh, between Documents and Activity.
- **Long Beach's program.** The brief says In-School Program; the seed says Studio Semester Sessions.
- **Herb Alpert's dates.** The Award mockup has the award on May 22, 2026, the letter uploaded May 26
  and the agreement Jun 9, with different stepper dates. The seed has the award on Jul 6, the letter
  on Jul 8 and the agreement on Jul 14.
- **Set-aside suggestion.** The Transactions mockup shows Intuit QuickBooks as "Last 3 months"; the
  code counts every month the payee was set aside, so it reads "Last 12 months".
- **Signal Hill Properties split.** The mockup proposes 75% and 25%. The code writes that share into
  the split panel rather than working it out (#12), and the row shows the ambiguous hint until the
  panel opens.
- **Receipts.** The Expenses mockup lists Herb Alpert expenses after the brief's four that are not
  the seed's (Albert Alva $3,800 on Sep 8, Renee Cole, Devon Price), and shows 3 missing backup for
  $4,992; the seed has 3 missing for $2,792. The mockup's "Download all backup" is "one zip with an
  index"; the code saves only the index, as a spreadsheet.
- **Files.** The brief says files are uploaded and stored. The POC stores a file's details; its
  contents last only for the session.
- **Spend-down wording.** The mockup's Long Beach advice ends "so book the spring concert now; the
  terms require written approval from the foundation to carry funds past Feb 28, 2027". The code says
  "so plan and book that spending now. Under the award terms, carrying funds past Feb 28, 2027 needs
  written approval from the foundation."
- **Award letter card.** Its footnote, from the mockup, says the terms "feed the budget and the
  spend-down warnings". In the code only Spend-down's What to do reads terms, and only the two named
  "Unspent funds" and "Budget changes"; the budget does not read them.

**Known problems, tracked elsewhere.** Five
helpers shorten a funder's name, each its own way (#11). The 75/25 Signal Hill split is written in
(#12). A budget line with expenses cannot be removed and they cannot be moved at once (#13).
Changing an assigned transaction on Transactions, or undoing a change, replaces its expenses and
leaves their receipts and backup note behind; Send back from Transactions deletes backup without
the warning the Expenses tab gives (#24).

---

## 5. Copy rules (from the brand doc)
Warm, plain, specific. Labels are nouns, buttons are verbs. No emoji. No "unlock/empower/impact".
Numbers over adjectives. Empty states say what will appear and how to make it appear.
Money in mono with thousands separators and a `$`, dates as "Sep 26, 2026" in prose and
"Sep 26" in tight columns (mono).

## 6. Visual rules that matter here
- Phase colours: pre-award phases blue/olive/neutral; awarded/active teal; reporting gold; declined danger; closed neutral.
- The gold accent is rationed: "Awarded this FY" stat rule, the attention Badge, nothing else.
- Cards never nest a shadowed card. Tables use DataTable. Forms use Field + Input/Select/Textarea.
- Dialog renders `position:absolute`, so the scrolling `main` container is `position:relative`.
