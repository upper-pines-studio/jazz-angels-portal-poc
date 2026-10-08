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
  incoming, splitRules, files, terms, reminderPlans, reminderDefaults`.
  The people, the programs and the settings live in `state.core`.
- `today: string` — today as `YYYY-MM-DD`. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `actions.grants` — the only way to change anything here. Every change is
  persisted to `ja-portal:grants:v1` automatically.
- Derive functions take the whole `PortalState`, so they can read
  `state.core.settings` as well as `state.grants.*`.

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
| `addGrant(input: NewGrantInput)` | Creates the grant, its checklist from the chosen template, the standard document register, and a "Grant added" activity row. Returns the grant id. With `input.inFlight` it brings in a grant already under way instead (see below). |
| `updateGrant(id, patch)` | Patches a grant, `dates` included (pass the whole `dates` object). |
| `transition(grantId, to, payload?)` | Moves the phase, writes the dates that phase implies, logs activity. `payload: { date?, amountAwarded?, periodStart?, periodEnd?, reason? }`. |
| `addTask(input)` / `updateTask(id, patch)` / `deleteTask(id)` | Checklist rows. |
| `toggleTask(id)` | Flips `done` and stamps/clears `doneAt`. |
| `addDocument(input)` / `updateDocument(id, patch)` / `deleteDocument(id)` | Document register. `updatedAt` is stamped for you. |
| `addPayment(input)` / `updatePayment(id, patch)` / `deletePayment(id)` | Installments from the funder. A payment that has arrived is not deleted (`PAYMENT_RECEIVED_REFUSAL`); clear its received date first if it was a mistake. |
| `markPaymentReceived(id, date)` | Stamps `receivedDate` and logs activity. |
| `addBudgetLine(input)` / `updateBudgetLine(id, patch)` / `deleteBudgetLine(id)` | Award allocation. A line with expenses on it is not removed (`LINE_IN_USE_REFUSAL`); `moveExpenses` first. |
| `moveExpenses(fromLineId, toLineId)` | Moves every expense on a line to another line of the same grant in one change, changing only `budgetLineId`, and logs one activity row. Returns `false`, changing nothing, for a missing line or a line on another grant. Remove line calls it, then `deleteBudgetLine`. |
| `addExpense(input)` / `deleteExpense(id)` | Spend against a budget line. |
| `addReport(input)` / `updateReport(id, patch)` / `deleteReport(id)` | Reports owed to the funder. Deleting one also drops its reminder plan. A report that has been sent (status `submitted` or `accepted`, or a `submittedDate`) is not deleted (`REPORT_SENT_REFUSAL`); set its status back first if it was marked by mistake. |
| `markReportSubmitted(id, date)` | Stamps `submittedDate`, sets status `submitted`, logs activity. |
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
  title; program; restriction; ownerId; loiRequired;
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
`grantActivity`, `grantMoney`, and `trackedGrants(state, true)`, which Budget vs. actual's All and
last-year views read. `fundersList(state, includeArchived?)` is the Funders list.

Lookup helpers, because every screen needs them: `grantById`, `funderById`,
`grantsByFunder`, `grantsForProgram`, `funderTotals`, `grantActivity` (newest
first), `activityWho` (the name an activity row credits). `staffById`, `programName` and `fiscalYear` are core's.

`funderShortName(name, tight?)` (`names.ts`) is the one way to shorten a
funder's name, so a funder reads the same on every screen: "Herb Alpert
Foundation" → "Herb Alpert", "LA County Dept. of Arts and Culture" → "LA
County". "Long Beach Community Foundation" stays whole, since "Long Beach"
alone is the city; `tight` gives "Long Beach CF" for a table cell, a chip or a
dashboard row. Other names are kept as they are; no name gives "Unknown funder".

The module's public API — what other modules may import from
`src/modules/grants` — is `manifest`, `deadlines`, `fyTotals` and
`grantsForProgram`.

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
**Renewal (returning funder)**. Live templates are in `state.templates`.

- `instantiateTemplate(template, grant, excludeItemIds?, fromPhase?)` → `Omit<Task,'id'>[]`.
  Each due date is `grant.dates[anchor] + offsetDays`; when the anchor date is
  unknown the task gets `dueDate: undefined`. LOI items are skipped when the
  grant does not require an LOI, and with `fromPhase` the items of every phase
  before it are skipped (a grant brought in already under way).
- `templatePlan(…same arguments)` → `{ item, task }[]`, the kept items paired with
  their tasks, for the Add grant checklist preview.
- `timingLabel(item)` → "21 days before application due" for the Playbook screen.
- `DEFAULT_DOCUMENT_REGISTER` / `instantiateDocumentRegister(grantId, updatedAt, status?)`
  — narrative, budget, IRS letter, board list, financials, all `needed` (or `status`).

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
(decision 0004): every collection empty, QuickBooks not connected, no checklist
templates, the default reminder schedule. See `src/core/demo.ts`.

Funder contact names, emails and phone numbers are invented for the demo —
plausible-looking, but none of them is a real person or address.

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
  `expenseId`. `backupSummary` counts what is attached and what is missing.
- **Reminders.** A report follows `reminderDefaults` until it is given its own
  `ReminderPlan`. `planSchedule` (any plan, a draft included) and
  `reminderSchedule` (the saved one) date each reminder and say which have
  gone; emails go out in the morning, so one dated today counts as sent. A plan
  that keeps reminding adds repeats every `repeatEveryDays` after the due date,
  up to the next one; `nextReminder` sees them.

The seed reproduces `design/saas/SAAS-BRIEF.md` to the dollar and the day;
`__tests__/money.test.ts` holds it to that.
