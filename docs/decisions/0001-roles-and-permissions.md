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
| Programs: add, rename, archive | Yes | Yes | – | – | – | – | – |
| Modules, import, export | Yes | – | – | – | – | – | – |
| QuickBooks: connect | Yes | – | – | – | – | – | – |
| QuickBooks: sync | Yes | Yes | Yes | Yes | – | – | – |

## Rules that hold for every role

- Nobody approves their own hours. The seed already works this way: Denise approves Barry's.
- Student personal data is the most protected thing in the portal. The students are minors, so
  guardian names and phone numbers reach only the people who need them.
- An archived person cannot sign in, and everything they did stays attributed to them
  (see [0002](0002-archive-not-delete.md)). Done (#20): `checkSignIn` refuses them as
  `archived`, a saved session is turned away the same way, and archiving a person needs the
  same permission as editing them (`mayChangeStaff`), never on your own record.
- Every change records who made it. Done (#16): every action is credited to the signed-in person,
  passed to each module's actions as `SliceContext.user`; the activity log stores their staff id
  and shows their name as it is now.

## What it means for the build

- A sign-in belongs to a staff record, and the role lives on that record (`StaffMember.role`,
  set in Settings). Every login in `core/auth.ts` has one; a login whose record is missing is
  refused at sign-in.
- The signed-in person is passed to every action, and the activity log uses them.
- The rail, the routes and the buttons read one permission check, so a hidden screen and a
  refused write agree. Done (#17): the table above is written as data in
  `src/core/permissions.ts` (`PERMISSION_TABLE`, same rows and columns), and `can(role, row,
  need, own)` answers from it. The rail (`app/Shell.tsx`) and the routes (`app/App.tsx`, with
  `app/access.ts`) read each manifest's `requires`; a refused route shows a no-access screen
  and keeps its URL. Every store action names the row it needs in its slice's `rules`, and the
  store (`guardActions` in `core/store.tsx`) refuses the rest with a toast ("You can't do that
  as a Teacher"). The screens leave out what the store would refuse. The database enforces the
  same table with row-level security (#22); the screens only hide what the database would
  refuse anyway.
- The Programs row was added with #44, when programs became editable in Settings: proposed as
  Admin and Director, the same people as "Staff and roles", since programs are the office's own
  configuration and a grant or a report is filed under them. Not final until the client reviews
  it; the open question is whether the Office manager should have it too.
- Beyond the table, only an Admin makes someone an Admin or changes an Admin's record, so the
  "Staff and roles" row cannot hand out "Modules, import, export" (`mayChangeStaff`).
- "Own classes" means the ensembles the teacher is assigned to teach: `Ensemble.leadStaffId`
  (`leadsEnsemble` and `mayTakeRoll` in `modules/teaching/domain/derive.ts`). Guardian name and
  phone are left off a student's record before it reaches the screen for anyone who may not see
  them (`rosterFor`).
