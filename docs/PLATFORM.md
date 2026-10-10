# Jazz Angels Portal — platform iteration (spec and design brief)

This iteration turns the grants POC into a **portal platform**: a shared core plus one module per
office workflow. Grants is the first module. Teaching (schedule, roll call, students) and
Timesheets are the second and third, ported from the sibling staff-portal POC
(`../jazz-angels-portal-poc`). `docs/SPEC.md` remains the product spec for the grants module and
is unchanged in substance; this document is the source of truth for everything above it.

Today in the demo story is still **2026-09-13** (a Sunday, the first Sunday of the Fall session).

---

## 1. Architecture

### 1.1 The idea

The organisation has a few **shared nouns** (people, programs, the fiscal year) and several
**workflows** that hang off them. Each workflow is a module. Modules read the shared nouns and
each other's public, read-only API; they never reach into each other's state.

```
src/
  core/                    shared nouns + mechanics. Owns nothing workflow-specific.
    types.ts               StaffMember, Program, AppSettings, CoreState, PortalState (augmentable)
    module.ts              ModuleManifest, ModuleSlice, DashboardContribution types
    store.tsx              StoreProvider + useStore(); composes module slices; persists per slice
    repository.ts          localStorage; one key per slice: `ja-portal:<sliceId>:v1`
    format.ts              money/date/initials helpers (moved from domain/format.ts, unchanged)
    seed.ts                core seed: staff, programs, settings
    derive.ts              fiscalYear(), staffById(), programName(), OPERATIONS_ID and the Operations helpers
    index.ts               barrel
  modules/
    index.ts               MODULES: the registry (ordered array of manifests)
    grants/                everything that was src/domain + the grant screens
      index.ts             PUBLIC API only: manifest + read-only derive functions other modules may use
      manifest.tsx
      domain/              types, phases, templates, derive, seed, slice (reducer + actions), __tests__
      screens/             Dashboard contributions, Grants, GrantDetail, Deadlines, Funders, Playbook
    teaching/              Schedule, Roll call, Students
    timesheets/            Time entries and approvals
  app/
    App.tsx                StoreProvider + Shell + routes built from MODULES
    Shell.tsx              rail built from MODULES (sections + items + badge counts)
    screens/Dashboard.tsx  composed from every enabled module's dashboard contributions
    screens/Settings.tsx   core: staff, programs, fiscal year, Modules on/off, export/import/reset
    screens/programs/      core: Programs list (Operations on its own above the programs) and sheets (program, project), ProgramDialog, ProjectDialog
    screens/partners/      core: Partners list, OrganizationDetail, VenueDetail, shared dialogs
    components/            shared app-level bits (badges, TableScroll, the funding bar)
    responsive.css
  design-system/           untouched
```

### 1.2 Core types

```ts
// core/types.ts
export interface StaffMember { id: string; name: string; role: string; teaches: boolean }
export interface Program extends Archivable { id: ProgramId; name: string; short: string }   // short: "Studio", "In-school"
export type ProgramId = string;   // the seeded programs keep 'studio-sessions', 'in-school', …; one added on the Programs page gets a generated `p-…` id
// Operations, the office's running costs, is a Program record but not a program (decision 0006): id OPERATIONS_ID
// ('general-operating', General operating's id), named "Operations", never archived or renamed, offered last in the money and hours pickers, left out of the class and student ones

// Places. An Organization is a partner (a school district, a community centre): the
// relationship, who to call, what was agreed. A Venue is a physical place a class or a
// performance happens. A district has many schools, so a venue may belong to an
// organization; Jazz Angels' own studio belongs to none.
export interface Organization { id; name; kind: 'school-district'|'school'|'community'|'government'|'other';
  contactName?; contactEmail?; contactPhone?; website?; notes? }
export interface Address { street; city; state; zip }
export interface Venue { id; name; kind: 'studio'|'school'|'community'|'performance'|'other';
  organizationId?; address?: Address; contactName?; contactEmail?; contactPhone?; notes? }

// Money for programs (decision 0006). A program has a budget for each fiscal year, named
// "FY27" (the year it ends). A project is one-off work under one program, with its own dates
// and budget; it counts in every fiscal year its dates overlap.
export type FiscalYearLabel = string;   // 'FY27'
export interface ProgramBudget { programId: ProgramId; fiscalYear: FiscalYearLabel; amount: number }
export interface Project extends Archivable { id; name; programId: ProgramId; start; end; budget: number }
// Where money can go: one fiscal year of a program, or a project. A grant's share names one.
export type FundingTarget =
  | { kind: 'program'; programId: ProgramId; fiscalYear: FiscalYearLabel }
  | { kind: 'project'; projectId: string };

// A stored file's facts (not its contents). A grant's GrantFile builds on it.
export type FileFormat = 'pdf' | 'jpg' | 'png' | 'heic';
export interface FileFacts { name: string; format: FileFormat; sizeKb: number; pages?: number }

// The office's documents (decision 0005): the papers every funder asks for, kept once. In code
// "office documents", never "organization" (a partner). The newest version added is current.
export type OfficeDocumentKind = 'irs-letter'|'financials'|'board-list'|'insurance-certificate'|'w9'|'organization-budget'|'other';
export interface OfficeDocumentVersion extends FileFacts { id; addedAt; addedById; expires? }
export interface OfficeDocument extends Archivable { id; kind: OfficeDocumentKind; name; versions: OfficeDocumentVersion[] }

export interface AppSettings { fiscalYearStartMonth: number; enabledModules: string[] }
export interface CoreState { staff: StaffMember[]; programs: Program[]; organizations: Organization[]; venues: Venue[];
  programBudgets: ProgramBudget[]; projects: Project[]; officeDocuments: OfficeDocument[]; settings: AppSettings }

/** Augmented by each module with `declare module`. */
export interface PortalState { core: CoreState }
export interface PortalActions { core: CoreActions }
```

Each module augments the two registries from its own folder, so core never names a module:

```ts
// modules/grants/domain/slice.ts
declare module '../../../core/types' {
  interface PortalState { grants: GrantsState }
  interface PortalActions { grants: GrantsActions }
}
```

### 1.3 Module manifest

```ts
// core/module.ts
export interface ModuleSlice<S, A> {
  id: string;                                   // storage key + state key, e.g. 'grants'
  seed(today: string): S;
  reducer(state: S, action: AnyAction): S;      // actions are `{ type: '<slice>/<name>', ... }`
  createActions(dispatch, getState: () => PortalState, ctx: { today: string; newId(prefix): string; user: SignedInUser }): A;
  /** One per action: a row of decision 0001 (edit on it), or (user, state, ...args) => boolean | reason.
   *  The store refuses an action its rule refuses, with a toast. */
  rules: ActionRules<A>;
  /** Optional: validate + fill a loaded payload. Return undefined to reject. */
  normalise?(raw: unknown): S | undefined;
}

// What a thing needs to show: one row of the permission table, or several of which any one will do.
export type Requires = Requirement | Requirement[];   // Requirement = { subject: Subject; need?: 'open'|'view'|'edit' }
export interface NavItem { path: string; label: string; icon: string; badge?(state: PortalState, today: string): number; requires?: Requires }
export interface StatSpec { id: string; label: string; value: string; unit?: string; footnote?: string; accent: string; href?: string; requires?: Requires }
export interface AttentionItem {
  id: string; date: string; label: string; detail: string;
  status: 'overdue'|'due-soon'|'info'; href: string; ownerId?: string;
  source: string;                                // module label, shown as a Badge
  requires?: Requires;                           // defaults to what `href` needs
}
export interface ModuleRoute {
  path: string; element: React.ReactElement;
  requires?: Requires;                           // refused: the no-access screen, at the same URL
  allows?(user, state, params): boolean;         // the record in hand, for an "Own" cell
}
export interface GatedCard { component: React.ComponentType; requires?: Requires }
export interface DashboardContribution {
  stats?(state: PortalState, today: string): StatSpec[];          // at most 2 per module
  attention?(state: PortalState, today: string): AttentionItem[];
  panels?: GatedCard[];                                            // each renders a Card
}

// What a module puts toward a program's year or a project, for the Programs page (decision 0006).
export interface FundingSource {
  id: string; label: string; detail: string; href: string;   // grants: the grant, its funder, its page
  amount: number;                                // toward this target
  ifAwarded: boolean;                            // pending money, kept apart from awarded money
  total: number; notYetGiven: number;            // what the source has, and has not yet given anywhere
  warnings: string[];
}
export interface FundingContribution {
  sources(state: PortalState, target: FundingTarget): FundingSource[];
  panel?: React.ComponentType<{ target: FundingTarget }>;   // its own "Paid for by" part of the sheet
  requires?: Requires;
}

export interface ModuleManifest {
  id: string; label: string; description: string;   // description shows in Settings → Modules
  nav: { section: string; items: NavItem[] };
  routes: ModuleRoute[];
  dashboard?: DashboardContribution;
  settings?: GatedCard[];
  funding?: FundingContribution;
  slice: ModuleSlice<any, any>;
}
```

### 1.4 Store

`StoreProvider` reads `MODULES` from `src/modules/index.ts`, builds
`state = { core, [slice.id]: slice.seed(today) … }` (or loads each slice from its own storage key),
combines reducers by slice id (an action `grants/addTask` only reaches the grants reducer; core
actions are `core/*`), and exposes:

```ts
const { state, today, actions } = useStore();
state.core.staff; state.grants.grants; state.teaching.students;
actions.grants.transition(id, 'submitted', { date: today });
actions.core.updateSettings({ enabledModules: [...] });
```

Persistence writes only the slice that changed. Export/import produce `{ version, savedAt,
slices: { core, grants, teaching, timesheets } }`; import accepts a file missing a slice and seeds
it. "Reset demo data" reseeds every slice.

Activity (the audit trail) stays inside the grants slice for now, saved in the same change as what
it describes. The schema will have one activity log for every module, each row naming its subject
by kind and id; the grants rows move into it with the backend. See
[decision 0005](decisions/0005-roadmap-items-that-shape-the-schema.md#one-activity-log).

### 1.5 Cross-module rules

1. A module imports another module only through that module's `index.ts`, and only pure,
   read-only functions of `(state: PortalState, …)`. Never its screens, reducer, or state type.
2. Core never imports from `modules/`. `src/modules/index.ts` is the only file that lists modules.
3. Screens import from their own module's `domain/` and from `core`. `useStore()` comes from core.
4. A module's styles live in its own folder and are imported by its screens.
5. Disabling a module in Settings hides its nav, routes and dashboard contributions. Its data stays.

---

## 2. Modules

### 2.1 Grants (existing)

Everything in `docs/SPEC.md`, moved under `modules/grants/`. Behaviour unchanged except:

- **Dashboard** becomes a contribution, not a screen: stats *Awarded this FY* (gold rule) and
  *In pipeline* (blue); attention items from `deadlines()` with `source: 'Grants'`; one panel,
  **Pipeline** (the phase strip). The "Coming up" card is dropped from the dashboard (Deadlines
  covers it).
- Nav section **Grants**: All grants, Deadlines, Funders, Playbook. A second section, **Money**
  (Transactions, Budget vs. actual, Spend-down), holds the screens for a grant after its award.
- **Reports tab** gains a card **Program numbers** for the grant's period and programs (all it names, added together): meetings held,
  students served, average attendance, contact hours (from Teaching) and teaching-artist hours
  (from Timesheets). Copy under the card: "From roll call and timesheets for <program>, <period>."
  Each number links to the module it came from. When a module is disabled or has no data in the
  period the card shows an EmptyState: "Numbers appear here once roll call is taken for
  <program>."
- **A grant's money is shared out** (decision 0006, #55): a `GrantShare` gives part of a grant
  to one program's fiscal year or one project (`domain/shares.ts`). The manifest's `funding`
  answers what pays toward a program's year or a project (`fundingFor`), and its `panel` is
  "Paid for by" on the program's or project's sheet (`screens/shares/PaidFor.tsx`), so the
  Programs page never reaches inside the module. The grant's own side is a card, **Where this
  grant's money goes**, under the Award tab (the first tab before an award;
  `screens/shares/WhereMoneyGoes.tsx`): not yet given of its total, a stacked bar, one row per
  program year or project with Change and Take back, and Give to a program or project. Warnings
  show on the row they are about and before a give; none stops it (#56).
- Public API (`modules/grants/index.ts`): `manifest`, `deadlines`, `fyTotals`, `grantsForProgram`,
  `fundingFor`, `grantsPayingFor`.

### 2.2 Teaching (new; port of Schedule, Roll call, Students)

**Entities** (`modules/teaching/domain/types.ts`):

```ts
interface Term extends Archivable { id; name: 'Fall 2026 session'; programId?; start: '2026-09-13'; end: '2026-11-08'; meetingsPlanned: 8 }   // the screens say "session"
interface Ensemble extends Archivable { id; name; programId; venueId; room; leadStaffId; tone: 'blue'|'teal'|'olive'|'gold'|'neutral' }   // venueId: a core Venue; room is the space inside it
interface ClassMeeting { id; ensembleId; date; start: '16:00'; end: '17:00'; venueId; room; rollSubmittedAt?: string; notes?: string }   // place copied from the ensemble when scheduled
interface Student { id; name; instrument; yearsIn: number; guardianName; guardianPhone?; programId; ensembleId?; status: 'enrolled'|'waitlist'|'alumni' }
interface AttendanceRecord { id; meetingId; studentId; mark: 'present'|'late'|'absent' }
interface TeachingState { terms; ensembles; meetings; students; attendance }
```

**Seed** (today Sunday 2026-09-13, Fall session week 1 of 8; weekly pattern repeats for the term):

| Ensemble | Program | When | Venue · room | Lead |
|---|---|---|---|---|
| Combo A | studio-sessions | Sun 3:00–4:00pm | Jazz Angels Studio · Studio 1 | Albert Alva |
| Combo B | studio-sessions | Sun 4:00–5:00pm | Jazz Angels Studio · Studio 1 | Barry Cogert |
| Big Band | studio-sessions | Sun 5:15–6:45pm | Jazz Angels Studio · Main room | Devon Price |
| Homeschool I | homeschool | Mon 4:00–5:00pm | Jazz Angels Studio · Studio 2 | Renee Cole |
| Homeschool II | homeschool | Mon 5:15–6:15pm | Jazz Angels Studio · Studio 2 | Renee Cole |
| Jazz Legacy | jazz-legacy | Tue 4:00–5:30pm | Jazz Angels Studio · Main room | Albert Alva |
| Advanced Workshop | advanced-workshop | Tue 6:30–8:00pm | Jazz Angels Studio · Studio 1 | Barry Cogert |
| Paramount MS | in-school | Thu 3:00–4:00pm | Paramount Middle School · Band room B-12 | Devon Price |

Core seeds the places: one organization, Paramount Unified School District, with two venues
(Paramount Middle School, where the in-school ensemble meets, and Alondra Middle School, the
expansion site the Port of Long Beach sponsorship would fund), plus Jazz Angels Studio with no
organization. On a schedule the studio's classes read as the room alone ("Studio 1"); anywhere
else the venue comes first ("Paramount Middle School · Band room B-12"). That rule is
`placeLabel` in `core/derive.ts`.

About 40 students with real-sounding but invented names across the ensembles (8–12 per studio
combo, 18 in Big Band, 6–8 per homeschool group, 14 at Paramount MS, 4 on the waitlist). Seed
attendance for the meetings that already happened this term is thin (week 1): Combo A at 3:00pm
today has roll submitted (9 of 10 present, 1 late); Combo B at 4:00pm and Big Band at 5:15pm are
today and unsubmitted. Also seed **last spring's term** (Mar 1 – Apr 26, 2026, 8 meetings per
ensemble, with attendance at 85–96%) so the Program numbers card on an active grant has data
for its period and "attendance trend" has history.

**Screens:**

- **Schedule** `/schedule` — Tabs: Week · Term. Week: CSS-grid, columns Sun–Thu (the days with
  classes) for the week of today, rows are time slots; a class block shows ensemble, room, lead
  avatar; today's column header is highlighted; a block for a meeting whose roll is submitted
  shows a small check. Prev/next week, "Today". Click a block → Roll call for that meeting. Term
  tab: the current session's weeks as a row of dots with performances marked; a **Sessions** list
  (name, dates, classes planned) and an **Ensembles** list with enrolled counts, each with Edit,
  Archive and Restore and an Add button along its foot for the roles that edit the schedule.
  "Add class" opens a small Dialog (ensemble, date, time, room). **Add session** (name, starts,
  ends, classes planned, which follows the weeks between the dates until typed) and **Add
  ensemble** (name, program, lead teacher from the staff who teach, venue and room, colour as
  five named swatches of the ensemble tones) are dialogs too, and edit the same fields. An
  ensemble moved to a new venue or room takes its classes from today on with it; past classes
  and any whose roll is in keep the place they met. With no ensembles the top bar offers Add
  ensemble instead of Add class, and the week grid's empty state says to add one.
- **Roll call** `/roll/:meetingId` — Header: ensemble, "Sunday, Sep 13 · 4:00pm · Studio 1".
  Left card: the roster, each row Avatar, name, instrument · year N, and three circle buttons:
  check (present), clock (late), cross (absent). Everyone starts present (the check filled
  teal); the teacher taps the clock or cross for the exceptions, and tapping it again goes back
  to present. Circles are 36px, growing to 44px on a phone. Right
  column: "This roll call" (Badges present/late/absent counts, rehearsal-notes Textarea,
  **Submit roll call**), and "Attendance trend" (last 5 meetings of this ensemble as bars).
  Submitting writes a present mark for everyone not marked otherwise, stamps
  `rollSubmittedAt`, raises a Toast, and returns to the schedule. Reopening a submitted roll call
  shows the marks read-only with "Edit roll call".
- **Students** `/students` — Tabs by program with counts plus Waitlist. Left: DataTable (student,
  instrument, ensemble, guardian, attendance % this term, status Badge), search and ensemble
  filter, "Enroll" (Dialog: name, instrument, guardian, program, ensemble). Right: the selected
  student's card (contact, ensemble, attendance this term, last 5 marks as dots). Empty state:
  "No students in this view yet. Enroll a student to add them to the roster." "Import" (Dialog)
  brings a term's roster in from a CSV: choose a file or download the blank template, check a
  preview of every row with its problems, take the closest program or ensemble, leave a student
  on the waitlist or skip the row, then add them all at once.

**Dashboard contribution:** stats *Enrolled* (blue; footnote "Fall session · 8 ensembles") and
*Attendance* (teal; average this term, footnote "last 4 weeks"); attention: past meetings with
no roll submitted ("Roll call due · Combo B") as `due-soon` if today, `overdue` if
earlier; panel **Today's classes** (time, ensemble, room, lead, students, "Take roll" button)
which reads "No classes today. The next class is Mon Sep 14, Homeschool I at 4:00pm." on a day
with none.

**Public API** (`modules/teaching/index.ts`):

```ts
attendanceSummary(state, { programId?, from, to }): { meetings: number; studentsServed: number; attendanceRate: number /* 0–1 */; contactHours: number }
enrolledCount(state, programId?): number
```

### 2.3 Timesheets (new; port of Timesheets)

```ts
interface TimeEntry { id; staffId; date; programId; ensembleId?; activity: string; hours: number /* quarter hours as decimal */; status: 'draft'|'submitted'|'approved'; approvedBy?; approvedAt? }
interface TimesheetsState { entries: TimeEntry[] }
```

Seed: entries for the week of Sep 7–13 and the prior four weeks for the four teaching artists,
mixed statuses; two awaiting approval this week; last spring's term has approved hours so a
grant's period has data. Hours are 0.25 increments.

**Screen** `/timesheets` — Stat row: *Hours this week*, *Awaiting approval* (gold accent; it is an
attention state), *This month*, *In-school hours* (footnote "grant-reportable"). Card "Week of
Sep 7" with a teacher filter, prev/next week, DataTable (day, teacher, activity, program, hours,
status Badge, Approve button on submitted rows; approving stamps approvedBy = current user).
**Log hours** Dialog: teacher (defaults to current user), date, program, ensemble (optional),
activity, hours. Below: "Hours by program" (ProgressBars, this month).

**Dashboard contribution:** stat *Teacher hours* (olive; this month); attention: "N timesheets
awaiting approval" as `info` when > 0; no panel.

**Public API**: `hoursByProgram(state, { from, to }): Array<{ programId; hours }>` and
`hoursForProgram(state, programId, from, to): number`; `hoursForPrograms(state, programIds, from, to)` adds several, for a grant that names more than one.

### 2.4 Core screens

- **Sign in** (a gate, no route of its own) — A username and password field and a Sign in button; the whole portal
  sits behind it, so nothing else renders until the check passes. Credentials are never shown on
  the page — no hint, no autofill of a real account. A wrong username or password gives one plain
  error and clears the password field.
- **Dashboard** `/` — Composed. Title "Dashboard", subtitle "Sunday, September 13 · FY27 · Fall
  session week 1". Stat row: up to four StatCards in module order (grants 2, teaching 2; timesheets'
  stat appears when a slot is free, otherwise as a footnote in the Attention header). Left column
  (2fr): **Attention** card, all modules' items merged, overdue first then by date, each row: date
  (mono), what, detail, a small `source` Badge (Grants / Teaching / Timesheets), owner avatar,
  status Badge. Core adds its own rows for office documents out of date or expiring soon, to the
  roles that may open Documents. The card's subtitle is "Overdue first, then what is coming up".
  Right column (1fr): each module's panels stacked. Empty attention: "Nothing needs
  attention. The next deadline is <date>." Add-grant button stays in the top bar.
- **Documents** `/documents`, `/documents/:id` — Core, Office in the rail before Partners
  (decision 0005). One Card, "The organization's documents", with a table: Document, Kind,
  Current version, Added, Expires ("Never" when none), Status Badge (Out of date in danger, Expires
  soon in gold, Current in teal); with a document open the table keeps Document, Expires and
  Status. Top bar: "6 documents · 1 to renew", Add document. A row opens a docked SidePanel: the
  kind as eyebrow, the name, the status and "Expires Oct 1, 2026, in 18 days"; Current version
  and Earlier versions, each a drawn page with the file name, its facts, "Added by … on …", the
  expiry, Open (the viewer) and Download; footer Edit, Archive, Add version. Add document asks
  kind, name (the kind's name until typed over), the file and Expires (blank means never); Add
  version the file and Expires. The dashboard adds Out of date and Expires soon rows (source
  Office, dated by the expiry, the status Badge in the document's words). Who: "Office documents"
  in decision 0001; a Teacher does not see it. A grant's register rows may use these documents
  (#68, `docs/SPEC.md` 4.10.5): the grants module reads them through core's public derives.
- **Partners** `/partners` — Core, because ensembles and meetings point at venues by id. Two
  tables: Venues (name, kind, organization, address, on-site contact; sorted by organization then
  name) and Organizations (name, kind, contact, its venues). Top-bar buttons Add organization and
  Add venue; a row opens its detail page.
  - **Organization** `/partners/organizations/:id` — Contact card (kind, contact, email, phone,
    website, notes) and a Venues table of the places under it, with Add venue prefilled to this
    organization. Edit organization in the top bar.
  - **Venue** `/partners/venues/:id` — Details card (kind, organization link, address, on-site
    contact, phone, email, notes) and **Classes here**: the ensembles that meet at this venue
    (program, when, room, lead, students), read from the teaching module's public index and shown
    only while Teaching is on. Edit venue in the top bar.
- **Programs** `/programs`, `/programs/:id`, `/programs/projects/:projectId` — Core, Operations
  in the rail (decision 0006). A list of every program with its projects nested under it, in its
  own column (it keeps to the window and scrolls by itself, and stacks above the sheet under
  900px), and the selected one's sheet beside it. Over the list, a Fiscal year picker (`?fy=FY28`;
  this year when unset; the choices are this year, the next, and every year with a budget or a
  project) and the year's totals ("$106,500 budgeted · $83,500 funded"). Each list item shows
  what is funded against its budget ("$15,300 of $18,000 · $2,700 to find", "covered", "$500
  over", "No budget yet") and a small stacked bar; a project is listed in every year its dates
  overlap. The URL names the selection; `?archived=1` is Show archived (programs and projects).
  - **Program sheet**: figures Budget, From awarded grants, If pending grants come in, Still to
    find (More than the budget when over), the stacked bar (one segment per grant, hatched for
    "If awarded"), the year's dates; then each module's `funding.panel` (grants: **Paid for
    by**), **Projects in <program>** with Add a project, and Details (name, short name). Set
    budget / Change budget open a dialog. With no budget for the year it says so in a sentence
    instead of the figures.
  - **Project sheet**: the same figures and bar over all the project's dates ("Runs Jun 21 – Jul
    30, 2027, so it counts in FY27 and FY28."), Paid for by, and Details (name, part of, dates,
    budget). Edit, Archive and Restore on the sheet.
  - Who does what: Add program, Edit, Archive and Restore of a program are Admin and Director
    ("Programs"); budgets and projects are "Program budgets and projects" and the shares "Grant
    shares" (Edit for Admin, Director, Office manager, Bookkeeper; View for Office assistant and
    Read-only). A Teacher sees the names only, and a project's page is closed to them. With no
    programs it shows an empty state with Add program.
- **Settings** `/settings` — Cards: Staff (name, role, "teaches" Switch), Partners and venues (a
  count and a button to the Partners screen), Programs (a count and a button to the Programs page), Fiscal year,
  **Modules** (one row per registered module: label, description, Switch; core cannot be turned
  off; copy: "Turning a module off hides it from the rail and the dashboard. Its data stays."),
  Data (Export JSON, Import, Reset demo data).
- Rail: **Overview** → Dashboard · then each enabled module's section in registry order
  (**Grants**: All grants, Deadlines, Funders, Playbook · **Operations**: Programs (core's own,
  placed right after Grants) · **Money**: Transactions, Budget vs.
  actual, Spend-down · **Teaching**: Schedule, Students ·
  **Office**: Timesheets, Documents, Partners, Settings). Sections with the same name merge;
  "Office" is where Timesheets and the core Documents, Partners and Settings screens meet. Badge counts come from
  `NavItem.badge`.
  Footer: signed-in person (Barry Cogert, Program Director) and Sign out.

---

## 3. Design brief (impeccable shape)

**Register:** product. See `PRODUCT.md` and `DESIGN.md`.

**Feature summary.** One staff portal with a shared rail and dashboard, where grants, teaching and
timesheets are modules that look and behave alike. The person at the studio should not be able to
tell where one module ends and the next begins.

**Primary user action.** From the dashboard, see the one thing due next and go do it (take roll,
submit a report, approve hours).

**Design direction.** Colour strategy: **Restrained** (paper neutrals, blue leads, teal for
complete, gold rationed to attention and the awarded rule). Scene: *Barry, laptop on the piano
lid in Studio 1 at 3:50pm on a Sunday, band filing in, checking what is due before Combo B starts.*
That forces light theme, big-enough targets, and nothing that needs a careful read. Anchors: the
existing grants screens (match them exactly), Linear's density and consistency, a well-set
concert programme (Jost headings, generous rules, no decoration).

**Scope.** Production-quality React in the existing stack; a whole surface (three modules plus
core); interactive (real state, real navigation); polish until it builds clean and reads right at
1440, 1024 and 400px.

**Layout strategy.** The Shell is unchanged: 236px rail, 60px top bar, scrolling `main` with
32px padding, content max 1200px. Screens use the same three page shapes already in the grants
module: stat row + two-column (dashboard, timesheets), tabs + table card (grants, students), and
header + detail (grant detail, roll call). Schedule introduces one new shape, the week grid, and
follows the sibling POC's proportions (88px time column, 78px minimum cell height, 3px ensemble
rule on the left of a block; this is the one sanctioned use of a left rule, per the design-system
doc, and it is a schedule block, not a card).

**Key states.** Every list has an empty state in the house voice. Roll call: unstarted, in
progress, submitted (read-only with Edit). Program numbers card: data, no data in period, module
disabled. Dashboard: no attention items. Modules: disabling a module the user is currently in
returns them to the dashboard with a Toast.

**Interaction model.** Row click opens detail; primary action lives in the top bar; dialogs for
create; toasts for confirmations; phase/status changes always capture a date.

**Content requirements.** Copy rules from `docs/SPEC.md` §5 and the brand doc: warm, plain,
specific; labels nouns, buttons verbs; no emoji; numbers over adjectives. Dates "Sep 13" mono in
columns, "Sep 13, 2026" in prose. Hours "2.00" mono. Attendance "94%".

**Anti-goals.** Not a generic admin template. No new colours, no gradients, no side-stripe cards
(the schedule block is the one exception and it is copied from the design-system POC). No
per-module colour theming; modules are told apart by their nouns, not by paint.

**Responsive.** Same breakpoints as `src/app/responsive.css` (1100 / 900 / 640). Roll call must
work one-handed at 400px. The week grid scrolls horizontally inside a `TableScroll` under 900px.

---

## 4. Definition of done

- `npm run build` clean, `npm test` green (existing grants tests moved and passing; new tests for
  store composition, slice persistence, attendanceSummary, hoursByProgram).
- Every grants screen behaves as before; the seed story from SPEC §3 renders unchanged.
- Turning Teaching off in Settings removes its rail section, routes and dashboard items, and the
  Program numbers card shows its disabled state.
- `README.md` and `CLAUDE.md` updated to describe the platform layout; `src/core/README.md` and
  `src/modules/README.md` document how to add a module (one folder + one line in the registry).
