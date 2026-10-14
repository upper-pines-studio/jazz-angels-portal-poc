# `src/modules/timesheets` — teaching-artist hours

Hours go in as a draft, get submitted, and the office approves them. Approved
hours are what a grant report asks for, so the module's public API is two
read-only functions that answer "how many hours did this program get between
these dates".

See `docs/PLATFORM.md` §2.3 for the spec.

```
timesheets/
  index.ts        PUBLIC API: manifest, hoursByProgram, hoursForProgram, hoursForPrograms
  manifest.tsx    nav (Office → Timesheets), route, dashboard contribution
  domain/
    types.ts      TimeEntry, TimesheetsState, TimesheetsActions
    seed.ts       the demo hours
    derive.ts     weeks, months, totals by program, own drafts, who may do what
    slice.ts      the reducer, the actions, the `declare module`
  screens/
    Timesheets.tsx      /timesheets
    LogHoursDialog.tsx
    timesheets.css
```

## The nouns

A `TimeEntry` is one person, one day, one program, one activity and a number of
hours in quarter-hour steps. `ensembleId` is an optional plain string pointing
at a teaching-module ensemble; timesheets never imports teaching, so the
readable name lives in `activity` ("Combo A rehearsal, Studio 1").

Status runs `draft` → `submitted` → `approved`. Approving stamps `approvedBy`
and `approvedAt`, and that is the only thing that clears the rail's badge. Until
then the person who logged a submitted entry can recall it to a draft; an
approved entry stays as it is.

## Submitting

The week card's **Submit week** button hands over the signed-in person's own
drafts for the week on screen, after a confirmation ("Submit the week of Sep 7":
"Your 2 draft entries, 3.50 hours, go to the office for approval. You can recall
them until the office approves them.", or for one "Your 1 draft entry, 1.50 hours,
goes to the office for approval. You can recall it until the office approves it.";
Cancel or Submit hours). The toast is "Hours
submitted", "2 entries · 3.50 hrs". The button is left out when the person has no
drafts that week, so the office, who see everyone's drafts, never get it for
somebody else's, and when the teacher filter shows somebody else. There is no per-entry Submit: hours are handed in a week at a
time, as the Log hours dialog says.

## Recalling and deleting

The week table's last column holds one control per row, for whoever may use it:

- Your own **draft**: a trash button, "Delete draft". It asks first ("Delete this
  draft?": "Mon Sep 7, Big Band sectional prep, 1.50 hours. This can't be
  undone."; Cancel or Delete
  draft), then toasts "Draft deleted", "Mon Sep 7 · 1.50 hrs".
- Your own **submitted** entry: **Recall**, which takes it back to a draft
  without asking, since submitting again undoes it. The toast is "Hours
  recalled", "1.50 hrs back in your drafts".
- Somebody else's **submitted** entry, for a role that approves: **Approve**.

An approved entry has none. The store asks the same (`mayDeleteEntry`,
`mayRecall`): it refuses deleting anything but a draft (`DRAFT_ONLY_REFUSAL`),
recalling an approved entry (`APPROVED_REFUSAL`), and either on somebody
else's hours, the office's too.

## Weeks

Weeks run **Monday to Sunday**, so the Fall session's Sunday classes close the
week rather than opening it. Today in the story is Sunday 2026-09-13, the last
day of the week of Sep 7.

## The seed

| Stretch | What | Status |
| --- | --- | --- |
| Mar 1 – Apr 26 2026 | last spring's term, 8 weeks × 8 entries | all approved |
| Aug 10 – Sep 6 2026 | four weeks of summer groups and prep, 9 entries a week | approved, two stray drafts |
| Sep 7 – Sep 13 2026 | Fall session prep, then the first Sunday | 5 approved, 4 draft, 2 submitted |

The two submitted entries are Renee Cole (3.00) and Devon Price (3.25): 6.25
hours awaiting approval, which is the rail badge, the gold stat and the one
dashboard attention row.

## Actions

| Action | What it does |
| --- | --- |
| `logHours(input)` | Adds a draft entry, rounded to the nearest quarter hour. Returns the id. |
| `submitEntry(id)` | Draft → submitted. A submitted or approved entry is left alone. Only your own (the slice's rule refuses anyone else's, the office's too). No screen offers it on one entry. |
| `submitWeek(weekStart)` | Every one of the signed-in person's drafts in that Monday-to-Sunday week → submitted, as one change. Nobody else's drafts move, whatever the role. Returns how many went. |
| `recallEntry(id)` | Submitted → draft. A draft or an approved entry is left alone. Only your own; an approved one is refused with `APPROVED_REFUSAL`. |
| `approveEntry(id)` | Marks it approved and stamps the signed-in person and today. |
| `deleteEntry(id)` | Removes a draft entered by mistake (decision 0002). Only your own; a submitted or approved entry is left alone and refused with `DRAFT_ONLY_REFUSAL`. |

## Public API

```ts
hoursByProgram(state, { from, to }): Array<{ programId; hours }>   // biggest first
hoursForProgram(state, programId, from, to): number
hoursForPrograms(state, programIds, from, to): number   // a grant that names several
```

Both are inclusive of `from` and `to` and count every entry, whatever its
status. Grants uses them for the Program numbers card.
