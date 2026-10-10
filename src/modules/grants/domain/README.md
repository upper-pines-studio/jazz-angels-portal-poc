# `src/modules/grants/domain` — the grants data layer

Everything a grants screen needs: state, actions, derived data. The store, the
shared nouns and the formatting helpers come from `src/core`; other modules use
`src/modules/grants/index.ts` and never reach in here.

```ts
import { useStore, money } from '../../../core';
import { deadlines, PHASES } from '../domain';
```

Never import `localStorage` or the repository from a screen — go through
`useStore().actions`. Swapping this folder for Supabase later should not touch a
single screen.

---

## Using the store

`<StoreProvider>` is mounted in `src/app/App.tsx` with every module's slice.

```tsx
function GrantDetail() {
  const { state, today, actions } = useStore();
  const grant = state.grants.grants.find(g => g.id === id);
  const next  = nextDeadline(state, grant.id, today);

  return <Button onClick={() => actions.grants.transition(grant.id, 'submitted', { date: today })}>
    Mark submitted
  </Button>;
}
```

- `state.grants: GrantsState` — what this module owns: `funders, grants, tasks,
  documents, payments, budgetLines, expenses, reports, activity, templates`,
  and for the money side `quickbooks, accounts, classes, transactions,
  incoming, splitRules, files, terms, reminderPlans, reminderDefaults`,
  and `grantShares`, how each grant's money is shared out.
  The people, the programs (with their budgets and projects) and the settings
  live in `state.core`.
  `activity` is the module's log, one row per change on a grant, written in
  the same change as what it describes so the two save or roll back together.
  It stays here until the backend, where its rows become rows of the one
  activity table every module shares, subject kind `grant` (decision 0005,
  "One activity log").
- `today: string` — today as `YYYY-MM-DD`. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `actions.grants` — the only way to change anything here. Every change is
  persisted to `ja-portal:grants:v1` automatically.
- Derive functions take the whole `PortalState`, so they can read
  `state.core.settings` as well as `state.grants.*`.

**A grant's programs.** `Grant.programs` is a list of at least one program id
(decision 0006). For a restricted grant it is where the money may go; for an
unrestricted one, what it was applied for. A grant saved before this had one
`program`; `normalise` (`withPrograms` in `slice.ts`) loads it as a list of one.

**Conventions:** money is always whole dollars as an integer. Dates are always
ISO `YYYY-MM-DD` strings (`Activity.at` is the one ISO date-time). The DOM's
`Document` type would clash, so the document-register interface is
`GrantDocument`.

---

## Actions

Add/update actions that create something return its new id.

| Action | What it does |
|---|---|
| `addFunder(input)` | Creates a funder. Returns the id. |
| `updateFunder(id, patch)` | Patches a funder. |
| `archiveFunder(id)` / `restoreFunder(id)` | Archives a funder (off the Funders list and the Add grant picker; its grants untouched) or restores it. Needs the pipeline row. |
| `archiveGrant(id)` / `restoreGrant(id)` | Archives a grant, or restores it, and logs "Archived" / "Restored" in the same change. Needs the pipeline row. |
| `addGrant(input: NewGrantInput)` | Creates the grant, its checklist from the chosen template, the standard document register, and a "Grant added" activity row. Returns the grant id. The register's IRS letter, board list and financials rows use the office's documents of those kinds when there are any (`newRegisterLinks`, #68). With `input.inFlight` it brings in a grant already under way instead (see below). |
| `updateGrant(id, patch)` | Patches a grant, `dates` included (pass the whole `dates` object). |
| `transition(grantId, to, payload?)` | Moves the phase, writes the dates that phase implies, logs activity. `payload: { date?, amountAwarded?, periodStart?, periodEnd?, reason? }`. |
| `addTask(input)` / `updateTask(id, patch)` / `deleteTask(id)` | Checklist rows. |
| `toggleTask(id)` | Flips `done` and stamps/clears `doneAt`. |
| `addDocument(input)` / `updateDocument(id, patch)` / `deleteDocument(id)` | Document register. `updatedAt` is stamped for you. An `officeDocumentId` in the input or patch is checked as `linkDocument` checks it. |
| `linkDocument(id, officeDocumentId)` / `unlinkDocument(id)` | Point a register row at an office document, or stop (#68). Refused, with why, for a document of another kind (any is fine on Other), an archived one, or one no longer there; a link to a document archived since is kept while the row changes. The row's own `url` stays, hidden, for when it is unlinked. |
| `addPayment(input)` / `updatePayment(id, patch)` / `deletePayment(id)` | Installments from the funder. A payment that has arrived is not deleted (`PAYMENT_RECEIVED_REFUSAL`); clear its received date first if it was a mistake. |
| `markPaymentReceived(id, date)` | Stamps `receivedDate` and logs activity. |
| `addBudgetLine(input)` / `updateBudgetLine(id, patch)` / `deleteBudgetLine(id)` | Award allocation. A line with expenses on it is not removed (`LINE_IN_USE_REFUSAL`); `moveExpenses` first. |
| `moveExpenses(fromLineId, toLineId)` | Moves every expense on a line to another line of the same grant in one change, changing only `budgetLineId`, and logs one activity row. Returns `false`, changing nothing, for a missing line or a line on another grant. Remove line calls it, then `deleteBudgetLine`. |
| `addExpense(input)` / `deleteExpense(id)` | Spend against a budget line. |
| `addReport(input)` / `updateReport(id, patch)` / `deleteReport(id)` | Reports owed to the funder. Deleting one also drops its reminder plan. A report that has been sent (status `submitted` or `accepted`, or a `submittedDate`) is not deleted (`REPORT_SENT_REFUSAL`); set its status back first if it was marked by mistake. |
| `markReportSubmitted(id, date)` | Stamps `submittedDate`, sets status `submitted`, logs activity. |
| `giveShare({ grantId, target, amount })` | Gives part of a grant's money to a program's fiscal year or to a project, and logs "Gave $1,500 to Homeschool Program, FY27" in the same change. A program's year left out defaults to the one the grant period starts in (`defaultShareYear`). Giving again to the same program year or project adds to that share. Returns the share id. See "Grant shares" below. |
| `changeShare(id, { amount?, fiscalYear? })` | Changes a share's amount, or the year a program share counts toward, and logs it. A project share has no year to change. |
| `takeBackShare(id)` | Removes a share, so its money is not yet given again, and logs "Took back …" on the grant. |
| `addNote(grantId, text)` | Free-text row on the Activity timeline. Returns the activity id. |
| `addTemplate(input)` / `updateTemplate(id, patch)` / `deleteTemplate(id)` | Playbook templates. `addTemplate` re-ids the items for you. |
| `duplicateTemplate(id)` | Copies a template and its items. Returns the new id. |

Staff, settings, export, import and reset are core's, not this module's:
`actions.core.addStaff`, `actions.core.updateSettings`, `actions.core.exportJson`,
`actions.core.importJson`, `actions.core.resetDemo`.

### `NewGrantInput`

```ts
{
  funderId?: string;              // existing funder
  newFunder?: Omit<Funder,'id'>;  // or the "New funder…" branch
  title; programs /* one or more */; restriction; ownerId; loiRequired;
  phase?: Phase;                  // default 'prospect'
  amountRequested?: number;
  dates?: GrantDates;
  notes?: string;
  templateId?: string | null;     // null / omitted = no checklist
  excludeTemplateItemIds?: string[];   // items the user unchecked in step 3
  includeDocumentRegister?: boolean;   // default true
  inFlight?: InFlightInput;            // a grant already under way
}
```

### Bringing in a grant already under way (decision 0004)

`addGrant` with `phase` at `'awarded'`, `'active'` or `'reporting'` (`IN_FLIGHT_PHASES`)
and `inFlight` set writes, in one change (one `add-grant` action, so one save):

```ts
inFlight: {
  amountAwarded: number;                                   // required, whole dollars
  budgetLines?: { category; planned }[];                   // accounts and class come later
  payments?: { label; expectedDate; amount; receivedDate? }[];   // received = has a date
  reports?: { kind; dueDate; status; submittedDate? }[];         // sent = submitted/accepted
}
```

- The phase dates it knows go in `dates` as usual (`loiDue`, `applicationDue`, `submitted`,
  `decided`, `periodStart`, `periodEnd`); any may be left out.
- The grant gets `amountAwarded` and `broughtIn: { phase, on: today }`.
- The checklist is the template from `phase` on: `instantiateTemplate(…, fromPhase)` drops
  the items of every phase before it. The document register is created `submitted`.
- The activity log gets one row, `broughtInText(phase)`: "Brought into the portal at Active",
  credited to the signed-in person. It matches none of the stepper's `ENTERED` patterns.
- **`Grant.broughtIn`** tells the stepper the grant arrived mid-life. `phaseEnteredOn` dates a
  phase up to `broughtIn.phase` only from the grant date that says it entered it (Submitted
  `submitted`, Awarded `decided`, Active `periodStart`), never from `createdAt`. Prospect,
  LOI, Applying and Reporting show no date: `loiDue` and `applicationDue` are deadlines, not
  the day the grant entered those phases. Later phases date from their own activity
  rows as for any grant.
- The store's rule for `addGrant` needs "Award, budget, reports" edit as well as the pipeline
  row when `inFlight` is set, so the Office assistant is refused, and refuses any input
  `inFlightRefusal(input)` objects to (Closed or a pre-award phase, no award or cents on it,
  an end before the start, a budget line with no category or a repeated one ignoring case,
  a payment without a name, amount or expected date, a sent date on a report not sent).

---

## Derived data

All pure, all take `state` first, none of them are stored.

| Function | Returns |
|---|---|
| `deadlines(state, today)` | `Deadline[]` across every grant, sorted by date ascending. |
| `grantDeadlines(state, grantId, today)` | The same list scoped to one grant. |
| `nextDeadline(state, grantId, today)` | The most urgent one, or `undefined`. |
| `grantMoney(state, grantId)` | `{ awarded, received, expectedRemaining, spent, remaining, plannedTotal, byLine: [{ line, spent }] }`. `remaining = awarded − spent`. |
| `fyTotals(state, today)` | `core`'s `fiscalYear(today, …)` plus `{ requested, awarded, received, spent }` for the current FY. |
| `pipelineCounts(state)` | `[{ phase, count, requested, awarded }]` — the eight stepper phases then `declined`, `withdrawn`. |
| `grantsByView(state, view, includeArchived?)` | `view` is `'active' \| 'pre-award' \| 'post-award' \| 'closed' \| 'all'`. Archived grants only with `includeArchived`, after the current ones. |
| `checklistProgress(state, grantId)` | `{ done, total }` for the "8 of 12 done" bar. |

**Archived grants (decision 0002).** `deadlines`, `pipelineCounts`, `fyTotals`, `grantsByView`,
and on the money side `isTracked` (so `trackedGrants`, `trackedGrantsInFy`, `offPaceGrants`,
`expensesMissingBackup`), `eligibleLines`, `reportsOwed` and so `nextReminder` leave archived grants
out. History keeps them: `grantById`, `grantsByFunder`, `funderTotals` ("awarded all time"),
`grantActivity`, `funderActivity`, `grantMoney`, and `trackedGrants(state, true)`, which Budget vs. actual's All and
last-year views read. `fundersList(state, includeArchived?)` is the Funders list.

Lookup helpers, because every screen needs them: `grantById`, `funderById`,
`grantsByFunder`, `grantsForProgram` (a grant is under each program it names), `programNames(state, grant, short?)` ("A, B and C"), `coversWholeStudio(grant)` (it names Operations, core's `OPERATIONS_ID`), `funderTotals`, `grantActivity` (newest
first), `funderActivity(state, funderId)` (every row on the funder's grants, archived grants
included, newest first, each as `{ row, grant }`: a `FunderActivityLine`; the funder's Recent
activity), `funderLastActivity(state, funderId)` (the day of its newest row, for the Funders list),
`activityWho` (the name an activity row credits). `staffById`, `programName` and `fiscalYear` are core's.

`funderShortName(name, tight?)` (`names.ts`) is the one way to shorten a
funder's name, so a funder reads the same on every screen: "Herb Alpert
Foundation" → "Herb Alpert", "LA County Dept. of Arts and Culture" → "LA
County". "Long Beach Community Foundation" stays whole, since "Long Beach"
alone is the city; `tight` gives "Long Beach CF" for a table cell, a chip or a
dashboard row. Other names are kept as they are; no name gives "Unknown funder".

The module's public API — what other modules may import from
`src/modules/grants` — is `manifest`, `deadlines`, `fyTotals`,
`grantsForProgram`, `fundingFor` and `grantsPayingFor`. The manifest's
`funding.sources` is `fundingFor`, which is how the Programs page (a core
screen) learns what pays for a program's year or a project.

### The `Deadline` shape

```ts
{
  id: string;        // 'task:<taskId>', 'loi:<grantId>', 'report:<reportId>', …
  date: string;      // ISO
  kind: 'task' | 'loi' | 'application' | 'decision' | 'report' | 'payment' | 'period-end' | 'start';
  label: string;     // "Application due", "Submit LOI", "Final report due"
  grantId: string;
  ownerId?: string;  // task assignee, falling back to the grant owner
  status: 'overdue' | 'due-soon' | 'upcoming';
}
```

`due-soon` is **within 14 days, inclusive** (`DUE_SOON_DAYS`). "Needs attention"
= everything whose status is not `upcoming`.

What feeds the list: open tasks with a due date, reports not yet submitted,
payments not yet received, and the grant's own key dates. Grants in a terminal
phase (`closed`, `declined`, `withdrawn`) contribute nothing at all.

Rules for the grant-level dates:

- `startBy` only while the grant is still `prospect`.
- `loiDue` / `applicationDue` drop off once the grant is past that phase.
- `decisionExpected` only while the grant sits in `submitted`.
- `periodEnd` only in `awarded` / `active` — by `reporting` the report is the
  real deadline.
- A grant date and an open task on the **same day for the same grant** are one
  deadline, not two (the standard template anchors "Submit application" to
  `applicationDue`). The grant date wins; the duplicate task row is folded in.

---

## Phases

```ts
PHASE_ORDER     // the 8 stepper phases, in order
ALL_PHASES      // those 8 + declined + withdrawn
PHASES[phase]   // { label, tone, isPreAward, isTerminal }
```

| Phase | Label | Tone | |
|---|---|---|---|
| `prospect` | Prospect | `neutral` | pre-award |
| `loi` | LOI | `olive` | pre-award |
| `applying` | Applying | `blue` | pre-award |
| `submitted` | Submitted | `blue` | pre-award |
| `awarded` | Awarded | `teal` | post-award |
| `active` | Active | `teal` | post-award |
| `reporting` | Reporting | `gold` | post-award |
| `closed` | Closed | `neutral` | terminal |
| `declined` | Declined | `danger` | terminal |
| `withdrawn` | Withdrawn | `neutral` | terminal |

- `stepperPhases(grant)` — the steps to draw; hides `loi` when
  `grant.loiRequired` is false.
- `isPreAward(phase)`, `isPostAward(phase)`, `isTerminal(phase)`,
  `phaseIndex(phase)` (−1 for declined/withdrawn).
- `availableTransitions(grant)` → `Transition[]`, most important first:

```ts
{ to: Phase; label: string; kind: 'primary'|'secondary'|'danger';
  fields: Array<'date'|'amountAwarded'|'periodStart'|'periodEnd'|'reason'> }
```

`fields` is what the confirm dialog must capture; an empty list means the
button needs no dialog beyond a confirmation. Terminal phases return `[]`.

---

## Templates (the Playbook)

`DEFAULT_TEMPLATES` ships four: **Foundation grant — standard** (the default,
`DEFAULT_TEMPLATE_ID`), **Government grant**, **Corporate sponsorship**,
**Renewal (returning funder)**. `defaultTemplates()` returns a fresh copy of
them, for the demo and a new office alike. Live templates are in `state.templates`.

- `instantiateTemplate(template, grant, excludeItemIds?, fromPhase?)` → `Omit<Task,'id'>[]`.
  Each due date is `grant.dates[anchor] + offsetDays`; when the anchor date is
  unknown the task gets `dueDate: undefined`. LOI items are skipped when the
  grant does not require an LOI, and with `fromPhase` the items of every phase
  before it are skipped (a grant brought in already under way).
- `templatePlan(…same arguments)` → `{ item, task }[]`, the kept items paired with
  their tasks, for the Add grant checklist preview.
- `timingLabel(item)` → "21 days before application due" for the Playbook screen.
- `DEFAULT_DOCUMENT_REGISTER` / `instantiateDocumentRegister(grantId, updatedAt, status?, officeDocumentLinks?)`
  — narrative, budget, IRS letter, board list, financials, all `needed` (or `status`);
  `officeDocumentLinks` names, by kind, the office document a row uses.

---

## Formatting

Formatting lives in `src/core/format.ts`:

`money(25000)` → `$25,000` · `dateShort('2026-09-26')` → `Sep 26` ·
`dateLong(...)` → `Sep 26, 2026` · `dateRange(a, b)` →
`Jul 1, 2026 – Jun 30, 2027` · `relativeDays(iso, today)` → `in 13 days` /
`3 days ago` / `today` · `initials('Barry Cogert')` → `BC` ·
`daysUntil(iso, today)` → a number · `toISO(date)` / `toDate(iso)`.

Undefined dates render as `—`. Use `toDate` rather than `new Date(iso)`: bare
`new Date('2026-09-26')` is UTC midnight and shows the wrong day in California.

---

## Demo data

`makeSeed()` builds the SPEC §3 data set for this module. `SEED_TODAY` is
`2026-09-13`, the day the demo is written around. The staff and the programs
are seeded by `src/core/seed.ts`. Seeded activity rows name their person by
staff id (`whoId`); a new row is credited to whoever is signed in
(`SliceContext.user`), and `activityWho` gives the name to show.

`makeEmpty()` is what a new office starts with when the demo is off
(decision 0004): every collection empty but the playbook, QuickBooks not
connected, the default reminder schedule. The playbook is `defaultTemplates()`,
the same four templates the demo has (#47); a saved slice keeps its own. See `src/core/demo.ts`.

The seeded register rows for the IRS letter, board list and financials use
core's seeded office documents where a version was on file by the grant's
submitted date (`seededLink`): the LA County grant (submitted Mar 2025) shows
last year's financials, the Herb Alpert grant last year's board list, and the
Wells Fargo grant (Nov 2024) keeps rows of its own. The Port of Long Beach
lists the insurance certificate, which expires soon.

Funder contact names, emails and phone numbers are invented for the demo —
plausible-looking, but none of them is a real person or address.

---

## Grant shares (`shares.ts`, decision 0006)

A `GrantShare` is a slice of a grant's money that one program's fiscal year or
one project gets: `{ id, grantId, target, amount }`, where `target` is core's
`FundingTarget` (`{ kind: 'program', programId, fiscalYear: 'FY27' }` or
`{ kind: 'project', projectId }`). It is not a share of a transaction
(`usualShares`, the part of a QuickBooks transaction one grant pays); the two
never meet. Shares are by grant, not by budget line, and one share counts
toward one fiscal year.

- **Which grants count** (`grantStanding`): `awarded` at Awarded, Active,
  Reporting and Closed, against `amountAwarded`; `if-awarded` at LOI, Applying
  and Submitted, against `amountRequested`, kept apart as "If awarded"; `none`
  for a prospect, a declined or withdrawn grant and an archived one. A grant
  that stops counting keeps its shares; they count toward nothing.
  `grantPot(grant)` is what it has to give.
- **The fiscal year** of a program share defaults to the year the grant period
  starts in, else the year it is given in (`defaultShareYear`;
  `resolveTarget` fills it in). A project share has none: a project counts in
  every year its dates overlap (core's `projectsInFiscalYear`).
- **A grant's card** reads `grantGiving(state, grantId)`: `{ grant, standing,
  total, given, notYetGiven, shares, warnings }`, each share a `ShareView`
  (`name`, `programId`, `archived`, `counts`, `warnings`), programs before
  projects. A share to an archived project stays in the list, `counts: false`,
  and its money is not yet given again. `givingGrants(state)` lists the grants
  with money to give, awarded first, largest first, for "Add money from a
  grant". `sharesOfGrant`, `shareTo(state, grantId, target)`, `grantGiven` and
  `shareCounts` are the parts.
- **A program's or project's sheet** reads `fundingFor(state, target)`: one
  core `FundingSource` per counting grant (funder short name, title, link to
  its Award tab, the amount, `ifAwarded`, its total and not yet given, warning
  sentences), awarded first, then by amount. A program's year sees only the
  shares named for that year; a project sees all of its shares. Core's
  `fundingSummary(targetBudget(state, target), sources)` gives the budget,
  awarded, if awarded and still to find. `grantsPayingFor` is the same as grants.
- **Warnings, never refusals** (`ShareWarning`, `{ kind, message }`):
  `outside-restriction` ("Restricted to In-School Program and Homeschool
  Program", for a restricted grant's money outside its programs, a project
  judged by its program), `project-outside-period` ("Runs past the grant
  period, which ends Jun 30, 2027"), `year-after-period` ("FY28 starts after
  the grant period ends, Jun 30, 2027"), `year-before-period` ("FY26 ended
  before the grant period starts, Jul 1, 2026") and `over-given` ("$500 more
  than the grant has", on the grant). `targetWarnings(state, grant, target)`
  gives the first four for any target; `giveWarnings(state, { grantId, target, amount },
  replacing?)` adds `over-given` as it would be after giving, for the Give form.
  A grant with no period dates yet has no period to fall outside.
- **What is refused** is only what cannot be saved, with why (`giveProblem`,
  `changeProblem`): an amount that is not whole dollars above $0
  (`SHARE_AMOUNT_REFUSAL`), a missing or archived grant, a prospect, a declined
  or withdrawn grant, a missing program or project, an archived project, a year
  that is not one, a year on a project share, and moving a program share onto a
  year the grant already gives to. Who may: "Grant shares" in decision 0001.

The demo seeds the prototype's shares (#49): Herb Alpert gives $48,000 of
$50,000, some to the Summer Jazz Intensive past its period; Long Beach CF all of
its $8,500; the Port of Long Beach, restricted to In-School and Homeschool and
still at Applying, $13,000 of its $15,000 to both. `__tests__/shares.test.ts`
holds every program's and project's FY27 figures to the prototype's. A save from
before shares loads with none, and a new office starts with none.

On screen (#56), in `screens/shares/`: `WhereMoneyGoes` is the grant's card
under its Award tab, or its first tab before an award (`grantGiving` for the
rows and the bar, `defaultShareYear` for the Fiscal year a Give starts on,
`giveWarnings` to show the warnings before a Give); `PaidFor` is the manifest's
`funding.panel` on a program's or a project's sheet (`fundingFor` for the rows,
`givingGrants` for Add money from a grant, `shareTo` to find the share a row
changes or takes back); `ShareDialogs` holds Change the share and Take back,
which both sides use.

---

## The money side (`money.ts`, `seed-money.ts`)

After the award a grant is a record of money. QuickBooks is mocked and
read-only: `transactions` is what it has sent, `incoming` is what arrives on
the next `syncQuickBooks()`, and nothing is ever written back.

- **A transaction is assigned, never retyped.** `assignTransaction(id, parts)`
  turns it into one `Expense` per part, each carrying its `transactionId`, so a
  split is two expenses with one transaction behind them and `grantMoney` needs
  no special case. Assigning again keeps the backup: a part that stays on its
  grant and line keeps its expense, and a part that goes hands its files and
  note to the first new part on the same grant, else the first (`backupCarry`).
  `unassignTransaction(id)` takes them off again, backup included.
  `markNotGrantFunded(id)` sets overhead aside. `restoreTransactions(snapshots)`
  is Undo: it puts back what `transactionSnapshot` saw, files and notes included.
- **A budget line matches a transaction** when the transaction's account is one
  of the line's `accountCodes` and, if QuickBooks gave it a class, the class is
  the line's `classId`. `suggestionFor(state, tx)` returns the one line that
  fits, a saved split rule, "not grant-funded" for a payee set aside before, or
  a hint saying why it cannot choose. `usualShares(state, tx, candidates)` gives
  the shares a split starts from: the payee's rule, else its last assigned
  transaction's shares on those candidates, else even, with its `source`.
- **Pacing is straight-line.** `grantPace` and `linePaces` compare the share of
  the money used with the share of the period gone and carry today's daily rate
  forward: `runsOutOn`, `projectedUnspent`, `perMonthNeeded`. A grant is off
  pace at ten points either way; a line, being lumpier, warns at twenty-five.
- **Files** are described in `files`; an expense's backup carries its
  `expenseId`. `backupSummary` counts what is attached and what is missing. A
  `GrantFile` builds on core's `FileFacts` (name, format, size, pages), which
  office documents share (#66); `GrantFileFormat` is core's `FileFormat` and
  `fileSize` is core's, re-exported here. The screens' file pieces that are not
  about grants live in `app/components/files.tsx`; `screens/money/files.tsx`
  keeps the grant kinds and the page drawn from a grant or an expense.
- **The register and the office's documents** (`officeDocuments.ts`, #68).
  The IRS letter, financials, board list, insurance certificate, W-9 and
  organization budget are also kept once for the office, with versions and
  expiry, in core (`OfficeDocument`, Office › Documents). `DocumentKind` has
  the same six ids (`OFFICE_KINDS`); `budget` stays the grant's own project
  budget, apart from `organization-budget`. A register row may use one
  (`GrantDocument.officeDocumentId`) and keeps its own status.
  - `officeDocumentsFor(state, kind)`: the current office documents a row of
    that kind may use (every one on Other); empty means nothing is offered.
    `kindsMatch(kind, doc)` is the test.
  - `versionShown(doc, grant)`: `currentVersion(doc, grant.dates.submitted)`,
    so the current version until the grant has a submitted date, then the
    newest added on or before it (a version added that day counts), or none.
    Worked out, never stored: a new version changes an unsubmitted grant's row
    and not a submitted one's.
  - `linkedOfficeDocument(state, row, grant, today)`: what a linked row shows:
    the document, `version`, `submittedOn`, `isCurrent`, `archived`, and
    `warning` (before submission, Out of date or Expires soon against today;
    after, only Out of date, when the version had expired by the submitted
    date). Undefined for an unlinked row or a document no longer there.
  - `newRegisterLinks(state)`: the first current office document of each of
    `NEW_GRANT_LINKED_KINDS` (IRS letter, board list, financials), which
    `addGrant` puts on the `add-grant` change as `officeDocumentLinks`.
  - `officeLinkProblem(state, kind, id, previousId?)`: why a row may not use
    that document, the words the store refuses with.
  A register saved before this loads unchanged, its rows unlinked.
- **Reminders.** A report follows `reminderDefaults` until it is given its own
  `ReminderPlan`. `planSchedule` (any plan, a draft included) and
  `reminderSchedule` (the saved one) date each reminder and say which have
  gone; emails go out in the morning, so one dated today counts as sent. A plan
  that keeps reminding adds repeats every `repeatEveryDays` after the due date,
  up to the next one; `nextReminder` sees them.

The seed reproduces `design/saas/SAAS-BRIEF.md` to the dollar and the day;
`__tests__/money.test.ts` holds it to that.
