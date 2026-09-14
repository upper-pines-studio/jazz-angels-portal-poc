# `src/domain` — the data layer

Everything a screen needs: state, actions, derived data, formatting. Import from
the barrel only.

```ts
import { useStore, deadlines, money, PHASES } from '../../domain';
```

Never import `localStorage` or `repository` directly from a screen — go through
`useStore().actions`. Swapping this folder for Supabase later should not touch a
single screen.

---

## Using the store

`<StoreProvider>` is already mounted in `App.tsx`.

```tsx
function GrantDetail() {
  const { state, today, actions } = useStore();
  const grant = state.grants.find(g => g.id === id);
  const next  = nextDeadline(state, grant.id, today);

  return <Button onClick={() => actions.transition(grant.id, 'submitted', { date: today })}>
    Mark submitted
  </Button>;
}
```

- `state: AppState` — the whole data set: `funders, grants, tasks, documents,
  payments, budgetLines, expenses, reports, activity, staff, programs,
  templates, settings`.
- `today: string` — today as `YYYY-MM-DD`. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `actions` — the only way to change anything. Every change is persisted to
  `localStorage` automatically.

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
| `addGrant(input: NewGrantInput)` | Creates the grant, its checklist from the chosen template, the standard document register, and a "Grant added" activity row. Returns the grant id. |
| `updateGrant(id, patch)` | Patches a grant, `dates` included (pass the whole `dates` object). |
| `transition(grantId, to, payload?)` | Moves the phase, writes the dates that phase implies, logs activity. `payload: { date?, amountAwarded?, periodStart?, periodEnd?, reason? }`. |
| `addTask(input)` / `updateTask(id, patch)` / `deleteTask(id)` | Checklist rows. |
| `toggleTask(id)` | Flips `done` and stamps/clears `doneAt`. |
| `addDocument(input)` / `updateDocument(id, patch)` / `deleteDocument(id)` | Document register. `updatedAt` is stamped for you. |
| `addPayment(input)` / `updatePayment(id, patch)` | Installments from the funder. |
| `markPaymentReceived(id, date)` | Stamps `receivedDate` and logs activity. |
| `addBudgetLine(input)` / `updateBudgetLine(id, patch)` / `deleteBudgetLine(id)` | Award allocation. |
| `addExpense(input)` / `deleteExpense(id)` | Spend against a budget line. |
| `addReport(input)` / `updateReport(id, patch)` | Reports owed to the funder. |
| `markReportSubmitted(id, date)` | Stamps `submittedDate`, sets status `submitted`, logs activity. |
| `addNote(grantId, text)` | Free-text row on the Activity timeline. Returns the activity id. |
| `addTemplate(input)` / `updateTemplate(id, patch)` / `deleteTemplate(id)` | Playbook templates. `addTemplate` re-ids the items for you. |
| `duplicateTemplate(id)` | Copies a template and its items. Returns the new id. |
| `addStaff(input)` / `updateStaff(id, patch)` | Settings → staff list. |
| `updateSettings(patch)` | Currently just `fiscalYearStartMonth`. |
| `resetDemo()` | Wipes storage and reloads the demo data. |
| `importJson(text)` | Replaces everything from an exported file. **Throws** on an unreadable file — catch it and show the message. |
| `exportJson()` | The whole data set as pretty JSON, for the download button. |

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
}
```

---

## Derived data

All pure, all take `state` first, none of them are stored.

| Function | Returns |
|---|---|
| `deadlines(state, today)` | `Deadline[]` across every grant, sorted by date ascending. |
| `grantDeadlines(state, grantId, today)` | The same list scoped to one grant. |
| `nextDeadline(state, grantId, today)` | The most urgent one, or `undefined`. |
| `grantMoney(state, grantId)` | `{ awarded, received, expectedRemaining, spent, remaining, plannedTotal, byLine: [{ line, spent }] }`. `remaining = awarded − spent`. |
| `fiscalYear(dateISO, startMonth)` | `{ label: 'FY27', start: '2026-07-01', end: '2027-06-30' }`. Named for the year it ends. |
| `fyTotals(state, today)` | The above plus `{ requested, awarded, received, spent }` for the current FY. |
| `pipelineCounts(state)` | `[{ phase, count, requested, awarded }]` — the eight stepper phases then `declined`, `withdrawn`. |
| `grantsByView(state, view)` | `view` is `'active' \| 'pre-award' \| 'post-award' \| 'closed' \| 'all'`. |
| `checklistProgress(state, grantId)` | `{ done, total }` for the "8 of 12 done" bar. |

Lookup helpers, because every screen needs them: `grantById`, `funderById`,
`staffById`, `programName`, `grantsByFunder`, `funderTotals`, `grantActivity`
(newest first).

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

- `instantiateTemplate(template, grant, excludeItemIds?)` → `Omit<Task,'id'>[]`.
  Each due date is `grant.dates[anchor] + offsetDays`; when the anchor date is
  unknown the task gets `dueDate: undefined`. LOI items are skipped when the
  grant does not require an LOI.
- `timingLabel(item)` → "21 days before application due" for the Playbook screen.
- `DEFAULT_DOCUMENT_REGISTER` / `instantiateDocumentRegister(grantId, updatedAt)`
  — narrative, budget, IRS letter, board list, financials, all `needed`.

---

## Formatting

`money(25000)` → `$25,000` · `dateShort('2026-09-26')` → `Sep 26` ·
`dateLong(...)` → `Sep 26, 2026` · `dateRange(a, b)` →
`Jul 1, 2026 – Jun 30, 2027` · `relativeDays(iso, today)` → `in 13 days` /
`3 days ago` / `today` · `initials('Barry Cogert')` → `BC` ·
`daysUntil(iso, today)` → a number · `toISO(date)` / `toDate(iso)`.

Undefined dates render as `—`. Use `toDate` rather than `new Date(iso)`: bare
`new Date('2026-09-26')` is UTC midnight and shows the wrong day in California.

---

## Demo data

`makeSeed()` builds the SPEC §3 data set. `SEED_TODAY` is `2026-09-13`, the day
the demo is written around; `CURRENT_USER` is Barry Cogert.

Funder contact names, emails and phone numbers are invented for the demo —
plausible-looking, but none of them is a real person or address.
