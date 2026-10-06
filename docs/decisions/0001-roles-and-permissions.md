# 0001 Roles and permissions

**Status:** Decided, October 2026.

## Decision

Every person who signs in has exactly one role. Whether they teach is a separate switch, the
`teaches` flag that staff already carry, so a director who also teaches a combo keeps the
director's role and gets a teacher's view of their own classes on top.

| Role | Who | In short |
| --- | --- | --- |
| Admin | Whoever runs the system | Everything, including staff accounts, roles, modules, the QuickBooks connection, import and export |
| Director | Barry, Denise | All programs, all money, final approvals |
| Office manager | Day-to-day operations | Grants, the schedule, students and partners; assigns transactions |
| Bookkeeper | Part-time or contract finance | Money and timesheet approvals. No student personal data |
| Teacher | Teaching artists | Sees the whole schedule; takes roll and sees contacts for their own classes; logs their own hours |
| Office assistant | Interns, volunteers | Grant checklists, deadlines, data entry. No money edits, no guardian contacts, no approvals |
| Read-only | Board members, an auditor | Sees grants, budgets and reports, grant by grant. No student personal data |

## What each role can do

| | Admin | Director | Office manager | Bookkeeper | Teacher | Assistant | Read-only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Grants: pipeline, checklist, deadlines | Edit | Edit | Edit | View | – | Edit | View |
| Award, budget, reports | Edit | Edit | Edit | Edit | – | View | View |
| Transactions: assign, split | Edit | Edit | Edit | Edit | – | – | View |
| Schedule and classes | Edit | Edit | Edit | – | View all | View | View |
| Roll call | Any class | Any class | Any class | – | Own classes | – | – |
| Students: names, attendance | Edit | Edit | Edit | – | Own classes | View | Counts only |
| Guardian contact details | Yes | Yes | Yes | – | Own classes | – | – |
| Timesheets: log hours | Own | Own | Own | Own | Own | Own | – |
| Timesheets: approve | Yes | Yes | Yes | Yes | – | – | – |
| Partners and venues | Edit | Edit | Edit | View | View | View | View |
| Staff and roles | Yes | Yes | – | – | – | – | – |
| Modules, import, export | Yes | – | – | – | – | – | – |
| QuickBooks: connect | Yes | – | – | – | – | – | – |
| QuickBooks: sync | Yes | Yes | Yes | Yes | – | – | – |

## Rules that hold for every role

- Nobody approves their own hours. The seed already works this way: Denise approves Barry's.
- Student personal data is the most protected thing in the portal. The students are minors, so
  guardian names and phone numbers reach only the people who need them.
- An archived person cannot sign in, and everything they did stays attributed to them
  (see [0002](0002-archive-not-delete.md)).
- Every change records who made it. Today every action is credited to `CURRENT_USER`
  (`core/seed.ts`), the first staff member, whoever is signed in; that is fixed before the
  backend.

## What it means for the build

- A sign-in belongs to a staff record. The intern login in `core/auth.ts` has none today.
- The signed-in person is passed to every action, and the activity log uses them.
- The rail, the routes and the buttons read one permission check, so a hidden screen and a
  refused write agree. The database enforces the same table with row-level security; the
  screens only hide what the database would refuse anyway.
- "Own classes" means the ensembles the teacher is assigned to teach.
