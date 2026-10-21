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
| Office documents | Edit | Edit | Edit | Edit | – | View | View |
| Staff and roles | Yes | Yes | – | – | – | – | – |
| Programs: add, rename, archive | Yes | Yes | Yes | – | – | – | – |
| Modules, import, export | Yes | – | – | – | – | – | – |
| QuickBooks: connect | Yes | – | – | – | – | – | – |
| QuickBooks: sync | Yes | Yes | Yes | Yes | – | – | – |

Import (and the demo's reset) exists only while the data lives in the browser. On the backend it
is not offered to anyone, the Admin included, because it would delete rows (decision 0008, 3C;
#125). Export stays the Admin's.

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
  configuration and a grant or a report is filed under them. The client answered in October
  2026: the Office manager has it too, so Admin, Director and Office manager. Staff and roles
  stays with the Admin and Director.
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
- The Office documents row was added with #66, when the office's documents (decision
  [0005](0005-roadmap-items-that-shape-the-schema.md)) became a core screen, Office › Documents:
  proposed as Edit for Admin, Director, Office manager and Bookkeeper, who send these papers to
  funders and keep them current; View for Office assistant and Read-only, who may open and
  download them but not add a document or a version, edit, archive or restore one; nothing for a
  Teacher, whose rail leaves the page out. Confirmed by the client in October 2026. The row is
  `office-documents` in `permissions.ts`; the store's `addOfficeDocument`,
  `updateOfficeDocument`, `addOfficeDocumentVersion`, `archiveOfficeDocument` and
  `restoreOfficeDocument` need its Edit, and the dashboard shows a document that is out of date
  or expires soon only to a role that may open it.
- Beyond the table, only an Admin or a Director makes someone an Admin, adds someone as an
  Admin, or edits, archives or restores an Admin's record (`mayChangeStaff`, `ADMIN_MAKERS`).
  Changed with #47: it was the Admin alone. A role given "Staff and roles" later does not get
  this with it. So that the "Staff and roles" row cannot hand out "Modules, import, export",
  nobody changes their own role, the Admin included: the Edit dialog shows your own role as
  text, and the store refuses the change ("You can't change your own role. Ask someone else who
  manages staff."). The rest of your own record (name, title, teaches) you may still change.
  Nobody archives themself either. A Director may demote or archive the last Admin, which
  leaves nobody with "Modules, import, export" until one is made again: confirmed by the client
  in October 2026, as built in #47.
- **Sign-ins are by invitation** (decided October 2026, for the backend; nothing is built in the
  browser, where the logins are fixed). Once real accounts exist, a Director could otherwise add
  an Admin record and give it a login they control, which the self-role rule does not stop. So:
  - Nobody sets or knows another person's password. Giving someone a sign-in sends an
    invitation to their email, and they choose their own password. Whoever has "Staff and
    roles" may send one, for a current (not archived) staff record.
  - Only an Admin sends the invitation for an Admin's record. A Director may still make someone
    an Admin; an Admin invites them.
  - Every new sign-in shows to every Admin, with who sent the invitation: a row in the activity
    log and a line on their dashboard.
  - A staff record needs an email for this (added in #152), and keeps it while it has a sign-in.
  - Built for the backend in #157: the `invite-staff` Edge Function, the trigger that marks an
    invitation accepted on the first sign-in, Settings' Send invitation, and the Admin's
    Sign-ins card on the dashboard (`docs/SCHEMA.md`, "Invitations, as built"). A Director also
    reads the activity lines, as they already read `logins`; only an Admin's dashboard shows them.
- Answered by the client in October 2026, from the schema (#22, `docs/SCHEMA.md`): charging hours
  to a grant (decision [0005](0005-roadmap-items-that-shape-the-schema.md)) follows "Award,
  budget, reports", since it is grant money; a person may delete their own time entries while
  they are drafts, and recall their own submitted ones to a draft until they are approved (#80;
  the first answer was any of their own, whatever the status, but an approved entry is money,
  decision [0002](0002-archive-not-delete.md); the client agreed in October 2026, and approved
  hours that are wrong are sent back by the office to the person to fix, #91); and a student's
  mark is fixed once the roll is
  submitted, changed by reopening the roll.
- "Own classes" means the ensembles the teacher is assigned to teach: `Ensemble.leadStaffId`
  (`leadsEnsemble` and `mayTakeRoll` in `modules/teaching/domain/derive.ts`). Guardian name and
  phone are left off a student's record before it reaches the screen for anyone who may not see
  them (`rosterFor`).
- The guardian's email and address (decision [0004](0004-switch-over-and-real-data.md), #82) are
  "Guardian contact details" too: the same people see them as the phone, and `asSeenBy` leaves
  them off the record with it. Changing them follows "Students: names, attendance".
- A student's photo release (decision [0005](0005-roadmap-items-that-shape-the-schema.md), #65)
  follows "Guardian contact details": the same people see it (a teacher for their own classes;
  the Office assistant, the Bookkeeper and Read-only never), and it is left off the record with
  the guardian's name and phone (`maySeePhotoRelease`, `asSeenBy`, `rollCallStudentsFor`). On a
  submitted roll call, a student who has since moved to another class keeps it only for someone
  who may still see their guardian details. Changing it follows "Students: names, attendance":
  whoever may edit the student (`setPhotoRelease` needs Students: Edit), and the store records
  who changed it.
