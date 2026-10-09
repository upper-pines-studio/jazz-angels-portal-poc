# 0004 Switching over, and getting real data in

**Status:** Decided. How much history to bring in is still open.

## What the office has today

A blend: spreadsheets, QuickBooks, paper, and what people remember. There is no single file to
import.

## Decision

**Start fresh.** The portal begins with what is current. Older records come later: the office
will want to enter past grants and past years, but when and how much is not decided, and does
not need to be before the backend.

**Each module switches over on its own date.**

| Module | Switches over | Before that date |
| --- | --- | --- |
| Teaching: schedule, students, roll call | The start of a school term | Stays in the old system |
| Timesheets | With teaching, at the start of the term | Stays in the old system |
| Grants | One grant at a time: the next new grant, or a grant already in flight | Each grant stays where it is until it is brought over |

So for a while the portal and the old system run side by side, and the portal is the record only
for what has been brought into it.

## How each kind of data gets in

| Data | How |
| --- | --- |
| Staff, programs, partners, venues | Typed in by an admin; a handful of each |
| Students and guardians | Imported from the current roster as a CSV, or typed in |
| The term's schedule | Typed in; a few dozen classes |
| A new grant | Add grant, as today |
| A grant in flight | Brought over mid-life: its phase, award, budget, payment schedule, payments already received, reports already sent, and the QuickBooks transactions since its start date assigned to it |
| Past grants and past years | Later; not decided |
| Past attendance and past timesheets | Not brought over |

## What it means for the build

- **Bringing over a grant in flight is built (#21).** Add grant offers "This grant is already
  under way" to the roles that may edit the award. It starts the grant at Awarded, Active or
  Reporting with its award, budget lines, payment schedule (received ones with their dates),
  the reports owed (sent ones with their dates) and the phase dates it knows, all in one change.
  The checklist has no tasks for the phases it passed, the document register starts as
  submitted, and the activity log gets one row, "Brought into the portal at Active", not one per
  phase. The grant carries `broughtIn: { phase, on }`, so the stepper shows the passed phases
  done, dated only from its submitted, awarded and period-start dates. Closed is not offered. Assigning the
  QuickBooks transactions from before the switch-over is not built; it needs the sync below.
- The QuickBooks sync reaches back to the start of the earliest grant in the portal, not just
  to the switch-over date, so an in-flight grant's earlier spending can be assigned.
- The portal starts empty, not with the demo data, and must look right empty
  (see the empty-state pass). Two things come pre-loaded, because every office needs them and
  they hold no Jazz Angels history: the six programs, and the default playbook, the four
  checklist templates the demo has (#47: `defaultTemplates()` in
  `modules/grants/domain/templates.ts`, used by both `makeSeed` and `makeEmpty`). Their items
  are offsets from a grant's own dates, so nothing depends on the demo date. Only a fresh start
  gets them: a saved grants slice keeps the templates it has, even none.
- A grant record must tolerate missing history, so past grants can be entered later with only
  funder, amount, dates and outcome.
- A student CSV import is worth building; a grants import is not, until history is decided.
