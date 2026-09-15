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
    derive.ts              fiscalYear(), staffById(), programName()
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
    components/            shared app-level bits (badges, TableScroll)
    responsive.css
  design-system/           untouched
```

### 1.2 Core types

```ts
// core/types.ts
export interface StaffMember { id: string; name: string; role: string; teaches: boolean }
export interface Program { id: ProgramId; name: string; short: string }   // short: "Studio", "In-school"
export type ProgramId = 'studio-sessions'|'in-school'|'homeschool'|'jazz-legacy'|'advanced-workshop'|'general-operating';
export interface AppSettings { fiscalYearStartMonth: number; enabledModules: string[] }
export interface CoreState { staff: StaffMember[]; programs: Program[]; settings: AppSettings }

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
  createActions(dispatch, getState: () => PortalState, ctx: { today: string; newId(prefix): string }): A;
  /** Optional: validate + fill a loaded payload. Return undefined to reject. */
  normalise?(raw: unknown): S | undefined;
}

export interface NavItem { path: string; label: string; icon: string; badge?(state: PortalState, today: string): number }
export interface StatSpec { id: string; label: string; value: string; unit?: string; footnote?: string; accent: string; href?: string }
export interface AttentionItem {
  id: string; date: string; label: string; detail: string;
  status: 'overdue'|'due-soon'|'info'; href: string; ownerId?: string;
  source: string;                                // module label, shown as a Badge
}
export interface DashboardContribution {
  stats?(state: PortalState, today: string): StatSpec[];          // at most 2 per module
  attention?(state: PortalState, today: string): AttentionItem[];
  panels?: React.ComponentType[];                                  // each renders a Card
}

export interface ModuleManifest {
  id: string; label: string; description: string;   // description shows in Settings → Modules
  nav: { section: string; items: NavItem[] };
  routes: Array<{ path: string; element: React.ReactElement }>;
  dashboard?: DashboardContribution;
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

Activity (the audit trail) stays inside the grants slice for now; a cross-module activity log is a
later step.

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
- Nav section **Grants**: All grants, Deadlines, Funders, Playbook.
- **Reports tab** gains a card **Program numbers** for the grant's period and program: meetings held,
  students served, average attendance, contact hours (from Teaching) and teaching-artist hours
  (from Timesheets). Copy under the card: "From roll call and timesheets for <program>, <period>."
  Each number links to the module it came from. When a module is disabled or has no data in the
  period the card shows an EmptyState: "Numbers appear here once roll call is taken for
  <program>."
- Public API (`modules/grants/index.ts`): `manifest`, `deadlines`, `fyTotals`, `grantsForProgram`.

### 2.2 Teaching (new; port of Schedule, Roll call, Students)

**Entities** (`modules/teaching/domain/types.ts`):

```ts
interface Term { id; name: 'Fall 2026 session'; programId; start: '2026-09-13'; end: '2026-11-08'; meetingsPlanned: 8 }
interface Ensemble { id; name; programId; room; leadStaffId; tone: 'blue'|'teal'|'olive'|'gold'|'neutral' }
interface ClassMeeting { id; ensembleId; date; start: '16:00'; end: '17:00'; room; rollSubmittedAt?: string; notes?: string }
interface Student { id; name; instrument; yearsIn: number; guardianName; guardianPhone?; programId; ensembleId?; status: 'enrolled'|'waitlist'|'alumni' }
interface AttendanceRecord { id; meetingId; studentId; mark: 'present'|'late'|'absent' }
interface TeachingState { terms; ensembles; meetings; students; attendance }
```

**Seed** (today Sunday 2026-09-13, Fall session week 1 of 8; weekly pattern repeats for the term):

| Ensemble | Program | When | Room | Lead |
|---|---|---|---|---|
| Combo A | studio-sessions | Sun 3:00–4:00pm | Studio 1 | Albert Alva |
| Combo B | studio-sessions | Sun 4:00–5:00pm | Studio 1 | Barry Cogert |
| Big Band | studio-sessions | Sun 5:15–6:45pm | Main room | Devon Price |
| Homeschool I | homeschool | Mon 4:00–5:00pm | Studio 2 | Renee Cole |
| Homeschool II | homeschool | Mon 5:15–6:15pm | Studio 2 | Renee Cole |
| Jazz Legacy | jazz-legacy | Tue 4:00–5:30pm | Main room | Albert Alva |
| Advanced Workshop | advanced-workshop | Tue 6:30–8:00pm | Studio 1 | Barry Cogert |
| Paramount MS | in-school | Thu 3:00–4:00pm | Off-site | Devon Price |

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
  tab: the eight Sundays as a row of dots with performances marked; a list of ensembles with
  enrolled counts. "Add class" opens a small Dialog (ensemble, date, time, room).
- **Roll call** `/roll/:meetingId` — Header: ensemble, "Sunday, Sep 13 · 4:00pm · Studio 1".
  Left card: the roster, each row Avatar, name, instrument · year N, a RadioGroup
  Present / Late / Absent. Targets ≥44px tall; on a phone the radios become full-width
  segmented buttons under the name. Right column: "This roll call" (ProgressBar marked/total,
  Badges present/late/absent counts, rehearsal-notes Textarea, **Submit roll call**), and
  "Attendance trend" (last 5 meetings of this ensemble as bars). Submitting stamps
  `rollSubmittedAt`, raises a Toast, and returns to the schedule. Reopening a submitted roll call
  shows the marks read-only with "Edit roll call".
- **Students** `/students` — Tabs by program with counts plus Waitlist. Left: DataTable (student,
  instrument, ensemble, guardian, attendance % this term, status Badge), search and ensemble
  filter, "Enroll" (Dialog: name, instrument, guardian, program, ensemble). Right: the selected
  student's card (contact, ensemble, attendance this term, last 5 marks as dots). Empty state:
  "No students in this view yet. Enroll a student to add them to the roster."

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
`hoursForProgram(state, programId, from, to): number`.

### 2.4 Core screens

- **Dashboard** `/` — Composed. Title "Dashboard", subtitle "Sunday, September 13 · FY27 · Fall
  session week 1". Stat row: up to four StatCards in module order (grants 2, teaching 2; timesheets'
  stat appears when a slot is free, otherwise as a footnote in the Attention header). Left column
  (2fr): **Attention** card, all modules' items merged, overdue first then by date, each row: date
  (mono), what, detail, a small `source` Badge (Grants / Teaching / Timesheets), owner avatar,
  status Badge. Right column (1fr): each module's panels stacked. Empty attention: "Nothing needs
  attention. The next deadline is <date>." Add-grant button stays in the top bar.
- **Settings** `/settings` — Cards: Staff (name, role, "teaches" Switch), Programs, Fiscal year,
  **Modules** (one row per registered module: label, description, Switch; core cannot be turned
  off; copy: "Turning a module off hides it from the rail and the dashboard. Its data stays."),
  Data (Export JSON, Import, Reset demo data).
- Rail: **Overview** → Dashboard · then each enabled module's section in registry order
  (**Grants**: All grants, Deadlines, Funders, Playbook · **Teaching**: Schedule, Students ·
  **Office**: Timesheets, Settings). Sections with the same name merge; "Office" is where
  Timesheets and core Settings meet. Badge counts come from `NavItem.badge`.
  Footer: signed-in person (Barry Cogert, Program Director).

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
