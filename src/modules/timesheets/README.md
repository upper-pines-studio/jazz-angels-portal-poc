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
    derive.ts     weeks, months, totals by program, own drafts, sent back, who may do what, history
    slice.ts      the reducer, the actions, the `declare module`
    tables.ts     the entries as time_entries rows, their history as activity rows (#121)
  screens/
    Timesheets.tsx      /timesheets
    LogHoursDialog.tsx  Log hours, and Edit hours on your own draft
    SentBack.tsx        "Sent back by Keisha Monroe on Sep 13: …"
    HistoryDialog.tsx   History: every step of one entry, oldest first
    timesheets.css
```

## The nouns

A `TimeEntry` is one person, one day, one program, one activity and a number of
hours in quarter-hour steps. `ensembleId` is an optional plain string pointing
at a teaching-module ensemble; timesheets never imports teaching, so the
readable name lives in `activity` ("Combo A rehearsal, Studio 1").

Status runs `draft` → `submitted` → `approved`. Approving stamps `approvedBy`
and `approvedAt`, and that is the only thing that clears the rail's badge. Until
then the person who logged a submitted entry can recall it to a draft. An
approved entry stays as it is, unless the office sends it back (below).

## Sending back

Approved hours stay on the record; when they are wrong, the office sends them
back to the person to fix (decision 0001, #91). On somebody else's approved
entry, a role that approves gets **Send back** in the week table's last column.
It asks for a reason ("Send these hours back?": "Sun Sep 6, Devon Price, Big
Band rehearsal, Main room, 1.50 hours. They go back to Devon Price as a draft to
fix and submit again, and are no longer approved."; a required "What needs
fixing", hinted "Devon Price sees this on the entry until it is submitted
again."; Cancel or Send back, which stays disabled until there is a reason). The
toast is "Hours sent back", "Devon Price · 1.50 hrs back in their drafts".

`sendBackEntry(id, reason)` makes it a draft again, clears `approvedBy` and
`approvedAt`, and stamps `sentBackBy`, `sentBackAt` and `sentBackReason`. The
person then sees:

- a notice above the week card, whatever week is on screen: "The office sent
  back 1 entry for you to fix", each entry with its day, activity and hours, the
  note, **Show week** (when it is another week) and **Edit hours**;
- in the row, the status **Sent back** and, under the activity, "Sent back by
  Keisha Monroe on Sep 13: This was the Saturday rehearsal, Sep 5, not Sunday.";
- the same note at the top of Edit hours ("Fix what the office asked, then
  submit the week again.").

It is an ordinary draft otherwise: they change it (Edit hours), delete it or
submit it with the week. Submitting clears `sentBackReason`, so the note and the
notice go; `sentBackBy` and `sentBackAt` stay on the entry for good, through
approving again. Sending back again overwrites all three.

The rail badge counts what is waiting on the signed-in person (`waitingOn`):
somebody else's hours to approve, for a role that approves, plus their own
entries sent back and not yet submitted again. Ordinary drafts are their own
work in progress and do not count.

Their dashboard says so too (`sentBackAttention`, #97): one Attention row per
entry sent back, "Hours sent back to fix", with the entry's day, its activity
and "Sent back by Keisha Monroe", a gold Sent back status and the Timesheets
badge. It links to `/timesheets?week=<Monday>` (`weekHref`), which opens that
week (`weekFromParam`), with the entry on it and in the notice above. Only the
person the hours belong to sees it, never the office that sent them back, and
it goes when they submit the entry again.

The store refuses sending back your own hours whatever the role
(`OWN_SEND_BACK_REFUSAL`), anything not approved
(`SEND_BACK_APPROVED_ONLY_REFUSAL`), a blank reason (`SEND_BACK_REASON_REFUSAL`),
and a role that does not approve. Charging hours to a grant is not built yet;
when it is, sending back a charged entry has to say what happens to the charge.

## History

Every entry keeps `history`, a list of the steps it went through (#95):
`logged`, `changed`, `submitted`, `recalled`, `approved`, `sent-back`. Each
names who (`whoId`, the signed-in person) and when (`at`, today's ISO date); a
send back carries its `reason`, and a change the fields it altered, each `from`
and `to`. A change that alters nothing records nothing.

A step is written in the same change as the status it describes: the reducer's
`update` carries the `event` and adds it to the entry, so the two save or roll
back together (decision 0005, "One activity log"). Steps are only ever added: a
patch never touches `history`, and a step whose id (`${entryId}:${n}`) is
already there is not added twice, so a retry keeps one. Refused actions add
nothing. Sending back clears `approvedBy` and `approvedAt` from the entry as it
did, but the approval stays in the history, so approving again leaves two.

An entry saved before #95 loads with what `rebuildHistory` can tell from its
fields, each step marked `rebuilt`: logged by its person, sent back if it was,
then submitted or approved as its status says. Logged and submitted carry no
date, since none was kept. Deleting a draft takes its history with it (decision
0002: a draft is a mistake, not a record).

In the week table the status badge is a button ("Approved, show history", with
a small history mark beside it) for whoever may read it (`mayReadHistory`): the
person who logged it and every role that approves, the same people who see the
row. It opens **History**: "Wed Sep 9, Devon Price, Paramount MS planning with
the band director, 1.50 hours." over the steps, oldest first, the last with the
teal dot:

- Logged by Devon Price, Sep 9
- Submitted by Devon Price, Sep 9
- Approved by Barry Cogert, Sep 13
- Sent back by Keisha Monroe, Sep 13: The meeting ran 1.50 hours, not 1.25.
- Changed by Devon Price, Sep 13: hours 1.25 to 1.50
- Submitted again by Devon Price, Sep 13
- Approved again by Keisha Monroe, Sep 13

A rebuilt history adds "These hours were saved before the portal kept every
step, so this is rebuilt from what the entry recorded. A step without a date is
one whose day was not kept." The dialog closes with Close. With the backend the
steps become rows of the shared `activity` table, subject kind `time-entry`
(`docs/SCHEMA.md`).

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

- Your own **draft**: a pencil, "Edit hours", which opens the Log hours fields
  as "Edit hours" with Save changes (toast "Hours changed", "Sun Sep 6 · 1.50
  hrs, still a draft"), and a trash button, "Delete draft". Delete asks first ("Delete this
  draft?": "Mon Sep 7, Big Band sectional prep, 1.50 hours. This can't be
  undone."; Cancel or Delete
  draft), then toasts "Draft deleted", "Mon Sep 7 · 1.50 hrs".
- Your own **submitted** entry: **Recall**, which takes it back to a draft
  without asking, since submitting again undoes it. The toast is "Hours
  recalled", "1.50 hrs back in your drafts".
- Somebody else's **submitted** entry, for a role that approves: **Approve**.
- Somebody else's **approved** entry, for a role that approves: **Send back**.

Your own approved entry has none. The store asks the same (`mayChangeEntry`,
`mayDeleteEntry`, `mayRecall`, `maySendBack`): it refuses changing or deleting
anything but a draft (`CHANGE_DRAFT_ONLY_REFUSAL`, `DRAFT_ONLY_REFUSAL`),
recalling an approved entry (`APPROVED_REFUSAL`), and any of them on somebody
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
| `logHours(input)` | Adds a draft entry, rounded to the nearest quarter hour, its history starting with `logged`. Returns the id. Every action below that changes an entry adds its step to the history in the same change. |
| `submitEntry(id)` | Draft → submitted, clearing a sent-back reason. A submitted or approved entry is left alone. Only your own (the slice's rule refuses anyone else's, the office's too). No screen offers it on one entry. |
| `submitWeek(weekStart)` | Every one of the signed-in person's drafts in that Monday-to-Sunday week → submitted, as one change. Nobody else's drafts move, whatever the role. Returns how many went. |
| `recallEntry(id)` | Submitted → draft. A draft or an approved entry is left alone. Only your own; an approved one is refused with `APPROVED_REFUSAL`. |
| `approveEntry(id)` | Marks it approved and stamps the signed-in person and today. |
| `sendBackEntry(id, reason)` | Approved → draft, with a required reason, stamping `sentBackBy` and `sentBackAt` and clearing the approval from the entry (it stays in the history). A role that approves, never on their own hours. |
| `changeEntry(id, changes)` | Changes a draft's date, program, ensemble, activity and hours (rounded to the quarter hour). Only your own; anything but a draft is refused with `CHANGE_DRAFT_ONLY_REFUSAL`. |
| `deleteEntry(id)` | Removes a draft entered by mistake (decision 0002). Only your own; a submitted or approved entry is left alone and refused with `DRAFT_ONLY_REFUSAL`. |

## Public API

```ts
hoursByProgram(state, { from, to }): Array<{ programId; hours }>   // biggest first
hoursForProgram(state, programId, from, to): number
hoursForPrograms(state, programIds, from, to): number   // a grant that names several
```

Both are inclusive of `from` and `to` and count every entry, whatever its
status. Grants uses them for the Program numbers card.
