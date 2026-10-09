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
| Program budgets and projects | Edit | Edit | Edit | Edit | – | View | View |
| Grant shares | Edit | Edit | Edit | Edit | – | View | View |
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
  same permission as editing them (`mayChangeStaff`), never on your own record. Nobody changes
  their own role either (#47; see below).
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
- Who may open the Programs page follows "Program budgets and projects": everyone but the
  Teacher. Confirmed by the client in October 2026 (#49).
- The Program budgets and projects and Grant shares rows were added with decision
  [0006](0006-programs-projects-and-shares.md) (#53), proposed to follow "Award, budget,
  reports": a program's budget, a project and the shares of a grant's money are money, so the
  office manager and bookkeeper edit them along with the Admin and Director. Confirmed by the
  client in October 2026 (#49). The rows are in `permissions.ts` (`program-budgets`, `grant-shares`),
  because the test that keeps it equal to this table needs them. Since #55 the store's actions
  read them: `setProgramBudget` and the project actions need "Program budgets and projects",
  `giveShare`, `changeShare` and `takeBackShare` need "Grant shares"; the screens come with #56. Adding, renaming and archiving a program stays on the Programs row, which
  moves with the Programs page (#54) but does not change who may do it.
- Beyond the table, only an Admin or a Director makes someone an Admin, adds someone as an
  Admin, or edits, archives or restores an Admin's record (`mayChangeStaff`, `ADMIN_MAKERS`).
  Changed with #47: it was the Admin alone. A role given "Staff and roles" later does not get
  this with it. So that the "Staff and roles" row cannot hand out "Modules, import, export",
  nobody changes their own role, the Admin included: the Edit dialog shows your own role as
  text, and the store refuses the change ("You can't change your own role. Ask someone else who
  manages staff."). The rest of your own record (name, title, teaches) you may still change.
  Nobody archives themself either. Open question: may a Director demote or archive the last
  Admin, which leaves nobody with "Modules, import, export"? Built as allowed, per #47.
- For the backend (#22): once real accounts exist, a Director could add an Admin record and give
  it a login they control. The self-role rule does not stop that, so creating an account needs
  its own rule.
- "Own classes" means the ensembles the teacher is assigned to teach: `Ensemble.leadStaffId`
  (`leadsEnsemble` and `mayTakeRoll` in `modules/teaching/domain/derive.ts`). Guardian name and
  phone are left off a student's record before it reaches the screen for anyone who may not see
  them (`rosterFor`).
