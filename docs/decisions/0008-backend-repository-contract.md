# 0008 How the backend Repository writes rows

**Status:** Decided, October 2026 (#115). The owner took the option this record argued for on
each of the four questions. None of it is built yet; the work is in the issues under
[What changes](#what-changes). The options not taken stay below, with why.

## Why

The store talks to storage through one interface, `Repository` in `src/core/persistence.ts`:
`load` one slice, `apply` one change. The localStorage build (`localRepository` in
`src/core/repository.ts`) writes the slice's whole new state and never reads the action. The
backend will write rows into the tables in `docs/SCHEMA.md`, and that is where the contract has
gaps. None of them is a bug today; each one becomes a bug the day a row backend is plugged in.

Four questions, which depend on each other (see [How the answers fit](#how-the-answers-fit)):

1. What does `apply` receive, so that a backend can turn a change into inserts, updates and
   deletes?
2. How is a cleared field sent?
3. Do import and reset run as one transaction?
4. What format do ids use?

What stayed fixed whatever was chosen: there is no offline queue, a change is saved or it fails,
and a failed change is rolled back and says so (decision [0003](0003-no-offline.md)); nothing on
the eleven archivable tables is ever deleted (decision [0002](0002-archive-not-delete.md)); the
screens hide what the database refuses anyway, so the database enforces decision
[0001](0001-roles-and-permissions.md) with row-level rules (SCHEMA.md, "Row-level security");
and every "by" column is set by the database from the signed-in person, never trusted from the
screen (SCHEMA.md, "Who did it").

## How a change is saved today

`dispatch` in `src/core/live.ts` runs the reducer, shows the result at once, then for each slice
the change touched queues one `repository.apply(sliceId, action, next)`. Each queued change
keeps its `before` (for the rollback), but `apply` is not given it. Only `REPLACE` (import and
reset) ever touches more than one slice, because an action is routed to one slice by its
`<sliceId>/` prefix (`makeReducer` in `src/core/store.tsx`). So one apply is one change to one
slice, which maps well onto one database transaction.

On Try again, `resend` in `live.ts` dispatches the failed action again on the state as it now
stands. Inserts that are safe to send twice, and ids made through `ctx.newId`, are #114.

## 1. What does `apply` receive?

### The question

`apply(sliceId, action, next)` says `action` is "for a backend that writes rows"
(`src/core/persistence.ts:19-26`). That holds for the generic actions (`insert`, `update`,
`remove`, `batch`), which carry their rows. Teaching and timesheets use only those, by design:
their `createActions` reads the state and sends the rows that follow from it. Most of core does
too. But several grants actions are worked out in the reducer from the state as it stood, so the
action alone does not say which rows changed. A backend would have to re-run the reducer on the
server's copy of the state, which may differ, or read `next` whole and guess.

The issue's claims, checked against `src/modules/grants/domain/slice.ts`:

| Action | Claim | What the code does |
| --- | --- | --- |
| `grants/add-grant` (line 261) | Builds rows from earlier state | **Confirmed.** Task ids `${grant.id}-t1…` and document ids `${grant.id}-d1…` are made in the reducer; the tasks are a copy of whichever template `templateId` names *as it stands in state*, minus excluded items, minus the phases a brought-in grant passed; the register comes from `instantiateDocumentRegister`; the activity text is picked in the reducer. The funder, budget lines, payments and reports are carried in the action |
| `grants/assign-transaction` (line 376) | Same | **Confirmed, and worse than stated.** The expense rows keep the ids of the parts that stayed on their line (`backupCarry`), so the action's `expenseId` is used only for new parts; the transaction's old parts are **deleted** with no `remove` in the action; files are moved to the new expenses; backup notes are merged; a new part's note is copied from the transaction's memo; the activity text quotes the budget line's category from state |
| `grants/restore-transactions` (line 436, `restoreTransaction` line 188) | Same | **Confirmed.** The snapshot carries the expenses and files to put back, but the reducer also deletes the transaction's current parts and moves or drops their files by `backupCarry`, none of which is in the action |
| `grants/toggle-task` (line 351) | Flips the current value | **Confirmed.** `{ id, date }` only; `done` is `!task.done` and `doneAt` is set or cleared from it. Sent twice, it undoes itself |
| `REPLACE` (`portal/replace`) | The whole state | **Confirmed.** `makeReducer` returns `action.state` as the new state; see question 3 |

**Other actions with the same problem**, not named in the issue:

- `grants/set-transaction-status` (line 466): setting a transaction aside or sending it back
  **deletes** its parts and their backup files, read from state; the action names only the
  transaction. It also clears `assignedById` and `assignedAt` with `undefined` (question 2).
- `grants/move-expenses` (line 439): moves every expense on one line to another. Which expenses
  is read from state, and the activity text counts and totals them.
- `grants/transition` (line 314): the grant's new dates are merged from its current `dates`, and
  the activity text is the transition's label from `availableTransitions(grant)`.
- `grants/duplicate-template` (line 361): the copy and its items (`${newTemplateId}-i1…`) are
  built from the source template in state.
- `grants/sync` (line 483): moves `incoming` into `transactions`. This is the demo stand-in for
  the QuickBooks sync; with the backend the sync writes `transactions` itself (SCHEMA.md, "What
  is not stored"), so this one goes away rather than being fixed.
- Smaller, and expressible as they are: `grants/save-reminder-plan` and `reset-reminder-plan`
  replace or remove by `reportId`, not by id; `core/set-program-budget` replaces by program and
  fiscal year (`src/core/store.tsx:112`); timesheets' `update` with an `event` appends a step to
  the entry's `history`, which becomes an `activity` row (SCHEMA.md, "Links across modules").
  A backend can write each of these from the action, but only by knowing its special key.

A concrete failure: the bookkeeper reassigns a split transaction from two lines to one. The
action carries one part. A backend writing from the action inserts one expense and never deletes
the two old ones, so the grant's spending counts the transaction twice, and the backup files
still point at the old parts. Nothing shows it until the page is reloaded from the server.

### Options

**A. A row diff, worked out in core from `before` and `next`.** The live store already holds
both. Core turns each slice into rows by table (each slice declares how its collections map to
the tables in SCHEMA.md, nested shapes included: `Grant.dates` to columns, `Grant.programs` to
`grant_programs`, template items, office document versions, a time entry's history to
`activity`, the guardian's fields to `student_private`), compares, and hands `apply` a list per
table: rows inserted (whole), rows updated (only the columns that changed), rows deleted (by
id). The action goes along as a label for logs and "Couldn't save …". The issue's options (a)
and (b) are this one; the only difference is whether the store or the repository runs the diff,
and running it in core means it is tested once and the localStorage repository can ignore it.

- Effort: moderate. A row mapping per slice (the bulk of the work, and it is the same mapping
  SCHEMA.md already describes in words), a generic differ, a changed `apply` signature. No
  reducer changes. Reducers keep unchanged rows as the same objects, so the diff is cheap.
- Correctness: the diff is exactly what the person saw on screen, for every action, including
  ones written later. No reducer runs twice.
- Postgres and row-level rules: each row write meets the table's policy, which is what SCHEMA.md
  plans. Rules that compare old and new values (only a draft time entry may change, an approver
  is never the entry's person, no attendance once the roll is submitted, Operations is never
  archived) cannot be written as a plain policy, because a policy sees the old row or the new
  one, not both; they become `before update` triggers. The "by" columns are set by trigger and
  whatever the diff sends for them is ignored. These are needed under any row option.
- Retry and idempotency (#114): every write is an absolute value (`done = true`,
  `done_at = '2026-10-17'`), an insert is an upsert on a client-made id, a delete of a row
  already gone is a no-op. A request that timed out after the server committed can be sent again
  safely.
- Concurrency: the diff is taken against the client's `before`, which may be stale. Writing
  only the changed columns keeps a colleague's change to another column. For the rest (two
  people reassigning the same transaction), updates and deletes can carry what they expect to
  find (the changed columns' old values, or a row version) and the server refuses on mismatch;
  the store already rolls back and says so (0003).
- 0003 and 0004: no queue needed. Works the same whichever module has switched over.

**B. Every action carries its complete rows.** Rewrite the grants actions above the way teaching
and timesheets already work: `createActions` reads the state and sends a `batch` of `insert`,
`update` and `remove`, with explicit values (`set-task-done { done, doneAt }` instead of a
toggle). The backend maps each generic action onto its table.

- Effort: moderate. Eight grants actions rewritten (`add-grant`, `transition`, `toggle-task`,
  `duplicate-template`, `assign-transaction`, `restore-transactions`, `move-expenses`,
  `set-transaction-status`) and their tests; the reducer becomes the generic three. The row
  mapping for nested shapes is still needed.
- Correctness: holds as long as every future reducer follows the rule. A lint rule or a test
  ("a slice reducer handles only insert, update, remove, batch") can guard it.
- Postgres and row-level rules: as A. The intent is visible in the payload, which helps a
  reader of the logs.
- Retry: idempotent once inserts are (#114) and every value is explicit.
- Question 2 stays open: an `update` patch still clears a field with `undefined`.

**C. One document per slice (JSONB).** The backend stores each slice whole, as the localStorage
build does, and `apply` writes `next`.

- Effort: smallest. `localRepository` almost as it is, on a server.
- Postgres and row-level rules: gives up SCHEMA.md. No foreign keys between modules, no row
  rules: a Teacher would receive the whole teaching slice, guardians' phone numbers included
  (`student_private`, 0001); a Bookkeeper the students. Every change rewrites the slice, so two
  people saving the grants slice at once overwrite each other, unless every save is versioned
  and refused on conflict, which would refuse most saves in a busy week.
- Retry: idempotent (the whole document). Question 2 is moot.
- Only sensible as a short stopgap, and even then it fails 0001's guardian rule.

**D. Named commands on the server.** Each action becomes a server function
(`assign_transaction(tx_id, parts)`), which runs the rule on the server's state in one
transaction and returns the rows it wrote; the client replaces its optimistic rows with them.

- Effort: the largest. The domain logic of every action written a second time in SQL or a
  server language, and kept in step with the TypeScript.
- Correctness: the server is the authority; concurrent changes meet the server's state, not a
  stale copy. Transitional rules live in the function, where they read naturally.
- Retry: needs an idempotency key per command, since a toggle sent twice still toggles twice.
- Can be mixed with A: diff by default, a command for the few changes a diff cannot check.

### Why this one

**A**, a row diff worked out in core from `before` and `next`, writing only changed columns,
with updates and deletes refused when the row changed since it was read. It fixes every
compound action at once without touching a reducer, it is idempotent on retry, it keeps
SCHEMA.md and its row rules, and it answers question 2 for free. B is a good clean-up to do
anyway (it makes the diff match the action one to one), but it is not needed for correctness.
Keep D in reserve for a change a diff cannot check; none is known today.

**Decision:** A. Core works out a row diff from `before` and `next` and hands it to `apply`; an
update or delete names the old values of the columns it changes, and the server refuses it on a
mismatch, with no version column (#122, #124).

## 2. How is a cleared field sent?

### The question

Fields are cleared by setting them to `undefined`. `JSON.stringify` drops a key whose value is
`undefined`, so a backend that writes from `action.patch` never clears the column. Every
clearable column in SCHEMA.md is nullable, so there is a value to send; nothing sends it.

Where it happens:

- `restoreFields()` (`src/core/archive.ts:69`) returns
  `{ archivedAt: undefined, archivedById: undefined }`, used by every Restore on the eleven
  archivable records.
- `grants/toggle-task` clears `doneAt` when a task is unticked (reducer, line 351).
- `grants/set-transaction-status` clears `assignedById` and `assignedAt` on Send back
  (line 466).
- `unlinkDocument` sets `officeDocumentId: undefined` on a register row
  (`src/modules/grants/domain/slice.ts`, `createActions`).
- Teaching: `reopenRollCall` clears `rollSubmittedAt`; `termFields` turns a session back to "All
  programs" with `programId: undefined`, which with a backend would leave it on its program, and
  under decision [0007](0007-sessions-per-program.md) on the wrong line for the overlap rule
  (`src/modules/teaching/domain/slice.ts`).
- Timesheets: submitting clears `sentBackReason`; Send back clears `approvedBy` and `approvedAt`
  (`src/modules/timesheets/domain/slice.ts`).

The issue's example holds: Restore on an archived staff member sends `{}` once serialised. The
row stays archived; on the next load the person is archived again and cannot sign in
(`member` in `StoreProvider`, `src/core/store.tsx`, turns away an archived member). The same
goes for a reopened roll call that stays closed, so attendance cannot be corrected.

One detail the fix has to respect: after `{ ...row, ...patch }`, the key is still on the row
with the value `undefined`, so "missing" and "set to `undefined`" must be treated the same.

### Options

**A. Falls out of a row diff (1A).** The differ compares old and new rows; a column that had a
value and now has none is sent as `null`. State keeps optional fields as they are; `null` exists
only on the wire and in the database. On load, a `null` column becomes a missing field (each
slice's `normalise` already drops a `null` archive field, `normaliseArchived` in
`src/core/archive.ts`, and the same is extended to every optional field).

- Effort: none beyond 1A and the load mapping. No type changes.
- Works for every clear, present and future, because no one has to remember to send it.

**B. `null` on the wire for patches.** If 1B or the current action payload is kept: the
repository serialises every `undefined` in a patch as `null` (a replacer that keeps keys whose
value is `undefined`), and the backend writes `null`.

- Effort: small, in the repository only. Patches must keep the key (`{ doneAt: undefined }`, not
  `delete patch.doneAt`); a reducer that clears by deleting a key, as `assign-transaction` does
  with `backupNote`, is invisible to it.

**C. `null` in state too.** Optional fields become `T | null` across the types, `normalise`,
derive functions and screens, and patches set `null`.

- Effort: large; touches most types in `src/core/types.ts` and each module's `domain/types.ts`,
  and every `?.` and `!== undefined` that reads them. Matches the database one to one, which
  makes the load mapping trivial, but buys little that A does not.

### Why this one

**A**, since 1A was chosen; B would have been needed had the action stayed the payload. Keep
`undefined` in state. Either way, a test per clearing action asserts that what is sent clears the column.

**Decision:** A. A column that lost its value is sent as `null` by the diff, state keeps
`undefined`, and a `null` read back from the database becomes a missing field (#122, #123).

## 3. Do import and reset run as one transaction?

### The question

`REPLACE` is saved as one apply per slice, each on its own queue, and the queues run at the
same time (`dispatch` in `src/core/live.ts`). There is no shared transaction and no order. If
grants fails while core saves, the saved data mixes two datasets: core from the file, grants
from before. With a backend, grants would point at programs and staff that are no longer in
core, and the foreign keys refuse it, or (with deletes deferred) the core save succeeded and the
grants rows are orphans. Try again resends only the failed slices (#112, #117), which helps
in the browser but not against a server whose other slices have since moved on. (The issue says
grants fails "after core saved"; in fact the slices save in parallel, so either can land first.)

As a row diff, an import is worse still: it deletes every row the file does not have, and
decision 0002 says no row of the eleven archivable tables is ever deleted and every foreign key
is `on delete restrict`. An import that replaces live data cannot be expressed in the schema.

Today: Reset demo data is offered only in a demo build and refuses otherwise (`resetDemo` in
`src/core/store.tsx`). Import JSON is open to whoever has "Modules, import, export" (Admin,
decision 0001), in any build.

### Options

**A. One atomic bulk endpoint.** The server replaces every table in one transaction from the
whole state.

- Effort: high. The whole-state-to-rows mapping (same as 1A), plus a server function that
  truncates and reloads in dependency order. Must bypass 0002's no-delete rule and `restrict`
  keys, or run only on an empty office.
- Postgres: one transaction is easy; doing it under row-level rules is not (an Admin cannot see
  every row type, such as `student_private`, without a privileged function).

**B. Save in dependency order with compensation.** Core first, then the modules; on a failure,
put back what already saved.

- Effort: moderate in the store, but the compensation is itself a set of saves that can fail,
  leaving the same mix. Same conflict with 0002.

**C. Import and reset never reach the backend.** Reset stays demo-only, against the demo's own
storage. Import JSON is unavailable once the portal is on the backend; Export JSON stays (it
only reads). If a one-off load is wanted at switch-over, it is a separate, privileged "load into
an empty office" step, run once, not a button in Settings.

- Effort: small. The repository says whether it accepts a whole-state replace, and Settings
  hides Import when it does not.
- Fits 0004: the office starts fresh, staff and programs are typed in, students come by CSV
  (which is ordinary `insert` rows, not `REPLACE`), and a grant in flight is brought over with
  Add grant. None of these needs a whole-portal import.
- Fits 0002: nothing is deleted.

### Why this one

**C.** A whole-portal replace contradicts 0002 on a live database, and 0004 never
needs one. If the owner wants the browser data carried over at switch-over, that is a one-time
load into an empty database, decided and scripted then.

**Decision:** C. Import and reset never reach the backend: Reset stays demo-only, Import JSON is
hidden when the repository does not accept a whole-state replace, and Export stays (#125).

## 4. What format do ids use?

### The question

New ids are a prefix and 10 hex characters: `newId` in `src/core/store.tsx` takes a
`crypto.randomUUID()`, strips the dashes and keeps the first 10 (40 random bits), or falls back
to `Date.now()` and `Math.random()` where `randomUUID` is missing. Some ids are not random at
all: the seeded ones (`general-operating` for Operations, decision 0006; `studio-sessions`) and
ones derived from a parent's id (`${grant.id}-t1` for a new grant's tasks, `${grant.id}-d1` for
its register, `${templateId}-i1` for a copied template's items, `${entryId}:1` for a time entry's
steps). SCHEMA.md keeps ids as `text` so these load unchanged.

40 bits is enough for the browser build, but not for a backend that treats an insert as "upsert
on id" (the idempotent insert of #114 and 1A): by the birthday bound, ten thousand ids of one
kind (a few years of attendance marks) give about a 1 in 20,000 chance that two collide, and a
collision under upsert does not fail, it silently writes one row over another.

### Options

**A. Text ids, made on the client, full length.** Keep the prefix and `text`; use the whole
`randomUUID()` (32 hex characters, 122 random bits), or a UUID v7 or ULID for ids that sort by
creation time. Seeded and derived ids stay as they are.

- Effort: a one-line change to `newId`, plus routing every id through `ctx.newId` (#114; core's
  own actions still call `newId` directly). Drop the `Math.random` fallback: `randomUUID` exists
  in every supported browser on `https` and `localhost`.
- Postgres: `text` primary keys, as SCHEMA.md says. A little larger than `uuid`; no difference
  at this office's size.
- Retry: the id is made before the first send, so a resend upserts the same row (#114). Works
  with the optimistic store, where a new grant's id is used by the next change before the first
  has saved.
- Old ids (10 hex, from exports and the demo) stay valid; nothing is migrated.

**B. `uuid` columns, made on the client (v7).** The database type is `uuid`.

- Effort: moderate. No prefix; Operations and the seeded sessions get fixed UUIDs; every derived
  id becomes a fresh id per row; exports from the browser build no longer load without
  remapping. SCHEMA.md's "Ids are `text`" changes.
- Smaller and type-checked in the database; otherwise the same as A for retry and the store.

**C. Ids issued by the server.** An identity column or a server-made UUID; the client uses a
temporary id and swaps it when the save returns.

- Effort: high. Every temporary id has to be rewritten in state and in every queued change that
  refers to it (a task added to a grant whose save has not returned yet), and on a rollback.
- Retry: a resent insert makes a second row unless each request carries an idempotency key.
- Works against the optimistic live store rather than with it; no benefit at this size.

### Why this one

**A**, text ids made on the client: `prefix-` and the full 32 hex characters of
`crypto.randomUUID()`, no fallback. Seeded and derived ids stay. A derived id is allowed only
inside the same change that inserts its parent, so it is unique whenever the parent's is.
UUID v7 is worth it only if rows should sort by id; `activity` already sorts by `at`.

**Decision:** A. Ids stay `text`, made on the client as the prefix and the full 32 hex
characters of `crypto.randomUUID()`, with no fallback; seeded and derived ids stay (#126).

## How the answers fit

- **1 decides 2.** A row diff (1A) sends `null` for any column that lost its value, so 2A needs
  no extra rule. If the action stays the payload (1B), 2B is needed as well. A document per slice
  (1C) makes 2 moot but gives up the schema.
- **1 and 4 lean on each other.** A diff keys rows by id and writes inserts as upserts, which is
  safe only with ids long enough never to collide (4A or 4B) and made before the first send.
  Server ids (4C) would make every diff carry temporary ids.
- **3 follows from 1 and 0002.** As a diff, an import deletes rows, which 0002 forbids; 3C keeps
  `REPLACE` out of the backend whatever 1 is. 3A would need the same whole-state mapping as 1A.
- **#114 is part of all of it.** Inserts that are safe to send twice, and ids from `ctx.newId`,
  are what make 1A and 4A safe on retry.

## What changes

Each follow-up is its own issue.

1. #122: `Repository.apply` receives the change as rows. Core passes `before` and `next` to a
   differ and hands the repository `{ table, inserts, updates, deletes }` per table, with the
   action as a label, and a cleared field as `null`; `localRepository` keeps writing `next` whole.
   Tests for every compound action above and each clearing action (Restore, unlink a document,
   reopen a roll, a session back to All programs, submit after Send back, Send back).
2. #121: a row mapping per slice (core, grants, teaching, timesheets) that turns state into the
   tables of SCHEMA.md and back: nested shapes to columns and child tables, a time entry's history
   to `activity`, guardian fields to `student_private`. Round-trip tests against the seed.
3. #123: loading from rows, where `null` becomes a missing field in every slice's `normalise`,
   not only the archive fields.
4. #124: refuse a stale write. Updates and deletes carry the old values of the columns they
   change, and the server refuses on a mismatch; no version column.
5. #125: keep `REPLACE` off the backend. The repository says whether it accepts a whole-state
   replace, Settings hides Import JSON when it does not, Reset stays demo-only, Export stays.
6. #126: full-length ids. `newId` keeps the whole UUID and drops the fallback; core's actions take
   ids from `ctx.newId` (with #114). The derived-id rule goes in `src/core/README.md`.
7. #127, optional: rewrite the grants compound actions as `insert`, `update` and `remove` batches
   built in `createActions`, as teaching and timesheets do (option 1B as a clean-up).
8. Done with this record (#115): `docs/SCHEMA.md` gives the id format, that a cleared field is
   written as `null`, that one apply is one transaction across a slice's tables, how a stale write
   is refused, and the triggers for the rules a row policy cannot express and for the "by"
   columns.
