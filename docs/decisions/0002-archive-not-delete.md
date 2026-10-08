# 0002 Records are archived, never deleted

**Status:** Decided, October 2026.

## Decision

Nothing the office has entered is deleted. A grant, a funder, a staff member, a student, a
partner, a venue or a class that is no longer current is archived: it leaves the everyday lists
and stays in history, reports and the activity log. Sessions (terms) and programs joined them
with #44, when they became editable: an archived session leaves the Schedule's session list and
is no longer the current session, its classes untouched; an archived program leaves the pickers
for new records, and every grant, student, ensemble and hour that names it keeps its name.

## Why

Funders ask about past years, auditors ask who did what, and renewals start from last year's
grant. A deleted record breaks every one of those.

## What it means for the build

Done (#20) in the browser build. The database carries the same fields and the same rule (#22).

- Each of those records gets an archived date and who archived it: `archivedAt` (ISO date) and
  `archivedById` (staff id), both optional, read through one helper (`src/core/archive.ts`:
  `isArchived`, `activeOnly`, `withArchived`, `pickable`, `archiveFields`, `restoreFields`).
  Lists hide archived records by default and offer a way to show them: a "Show archived (n)"
  switch at the right of each list's filter bar or card header, shown once something is
  archived, with archived rows listed last under a neutral Archived badge.
- An archived record can be restored: the record's page (or its row) shows "Archived on Oct 7,
  2026 by Keisha Monroe" with Restore. Whoever may edit the record may archive and restore it
  (the same row of the table in 0001); nobody archives themself.
- An archived staff member cannot sign in, and a saved session for them is turned away, with
  "This sign-in belongs to someone who is no longer on the staff. Ask an admin if that is
  wrong." (see [0001](0001-roles-and-permissions.md)). Their approvals, activity, uploads and
  classes still name them.
- An archived record stays in history: activity, reports, Budget vs. actual over all time and
  last fiscal year, a funder's grant history, attendance and hours for past dates. An archived
  grant leaves the pipeline, the deadlines, the reminders, the spending screens and the
  dashboard, and takes no new spending; an archived class leaves the week grid from its archive
  date; an archived student leaves the roster, the roll call and the counts.
- Small parts of a record that are mistakes rather than history, such as a mistyped checklist
  task or a budget line added in error before anything was charged to it, may still be removed.
  Anything with money or attendance against it is archived instead. The store refuses removing
  a budget line that still has expenses on it (they move first), a payment that has arrived and
  a report that has been sent to the funder.
- Nothing cascades: archiving a funder leaves its grants as they are, and the grant page says
  the funder is archived; archiving a partner leaves its venues, and a class its students.
- The database has no cascading deletes on these records.
