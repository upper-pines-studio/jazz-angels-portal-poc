# 0002 Records are archived, never deleted

**Status:** Decided, October 2026.

## Decision

Nothing the office has entered is deleted. A grant, a funder, a staff member, a student, a
partner, a venue or a class that is no longer current is archived: it leaves the everyday lists
and stays in history, reports and the activity log.

## Why

Funders ask about past years, auditors ask who did what, and renewals start from last year's
grant. A deleted record breaks every one of those.

## What it means for the build

- Each of those records gets an archived date and who archived it. Lists hide archived records
  by default and offer a way to show them.
- An archived record can be restored.
- An archived staff member cannot sign in (see [0001](0001-roles-and-permissions.md)).
- Small parts of a record that are mistakes rather than history, such as a mistyped checklist
  task or a budget line added in error before anything was charged to it, may still be removed.
  Anything with money or attendance against it is archived instead.
- The database has no cascading deletes on these records.
