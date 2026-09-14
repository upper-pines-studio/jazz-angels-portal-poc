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
}

interface BudgetLine {     // how the award is allocated
  id: string; grantId: string; category: string;   // "Teaching artist stipends"
  planned: number;
}

interface Expense {        // money spent against a budget line
  id: string; grantId: string; budgetLineId: string;
  date: string; payee: string; amount: number; note?: string;
}

interface Report {         // reports owed to the funder
  id: string; grantId: string; kind: 'interim'|'final'; dueDate: string;
  submittedDate?: string; status: 'upcoming'|'drafting'|'submitted'|'accepted';
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

### Derived data (never stored)
- **Deadlines** — one flat list across all grants: every dated task not done, every report not
  submitted, every payment not received, and the grant-level dates (loiDue, applicationDue,
  decisionExpected, periodEnd). Each has `{date, kind, label, grantId, status: 'overdue'|'due-soon'|'upcoming'}`.
  `due-soon` = within 14 days.
- **Per-grant money** — `received = Σ payments.receivedDate`, `spent = Σ expenses`,
  `remaining = amountAwarded − spent`, `plannedTotal = Σ budgetLines.planned`.
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

Give the active grants budget lines (teaching artist stipends, sheet music and charts, instrument
repair, venue and performances, admin) with a handful of expenses each so the spend bars are
meaningful. Give every pre-award grant a checklist from the standard template with a mix of
done/undone tasks.

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
  - Left, tabbed: **Checklist** · **Documents** · **Money** · **Reports** · **Activity**
    - Checklist: tasks grouped by phase; each row Checkbox, title, due date (mono; red if overdue), assignee avatar. "Add task". Completed tasks shown struck through and greyed. Progress bar "8 of 12 done" at the top.
    - Documents: DataTable — name, kind, status Badge (needed/drafting/final/submitted), updated, link icon. "Add document". This is the register for the files in the folder — the POC links out, it does not store files.
    - Money (post-award only; pre-award shows an EmptyState "Budget and payments appear here once the grant is awarded."):
      - Award summary: Awarded · Received · Spent · Remaining (4 small stats).
      - **Payments from funder**: table of installments — label, expected, amount, received (date or "Mark received" button).
      - **Budget** — one ProgressBar per budget line: category, spent / planned, caption remaining. "Add line".
      - **Expenses** — table: date, payee, category, amount, note. "Log expense".
    - Reports: table — kind, due, status Badge, submitted; "Mark submitted".
    - Activity: timeline of Activity rows, plus a note box "Add a note".
  - Right column cards: **Key dates** (all `dates` fields with labels, editable via a small Dialog), **Funder** (name, type, contact, cycle notes, link to funder page), **Details** (amount requested/awarded, restriction, program, owner, notes).

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
