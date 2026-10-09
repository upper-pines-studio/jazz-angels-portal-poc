# Feature map

Every feature in the portal: its route, its status, and the files that own it. Use it to find
where to work. When you add, move or finish a feature, update its row in the same change.

**Status words**

- **Built**: works end to end on browser-stored data.
- **Mocked**: the screen works, but something behind it is simulated. The row says what.
- **Gap**: known to be missing or wrong. Listed under [Known gaps](#known-gaps).

**Paths** are relative to `src/`. `grants/` means `src/modules/grants/`, and likewise for
`teaching/` and `timesheets/`.

## Working on a feature

Each row names a feature's screen files and the domain functions behind it. A number on a screen
comes from a derive function, and a change goes through an action on
`useStore().actions.<module>`, so to change what a screen shows, start at the derive function.
Tests cover the domain layer only: a domain change needs a test, and a screen change needs a look
in the browser. The folder layout of a module is in `src/modules/README.md`.

## Core

Shared by every module. Owned by `core/` and `app/`.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Sign in: one demo login per role; each belongs to a staff record, whose role it carries; a login with no staff record is refused, and so is one whose record is archived (a saved session too) | (gate) | Mocked: hashes checked in the browser, no server | `app/screens/Login.tsx`, `app/AuthGate.tsx` | `core/auth.ts`: `USERS`, `checkSignIn`, `staffRefusal`; `core/roles.ts` |
| Archive and restore (decision 0002): grants, funders, staff, students, partners, venues and classes, and sessions and programs (#44). Each list hides archived records and has a "Show archived (n)" switch; an archived record's page shows who archived it and when, with Restore; the confirmation says what hides and what stays | (all nine lists) | Built; controls proposed in #20, not final until reviewed | `app/components/archive.tsx` (`ShowArchivedSwitch`, `ArchivedName`, `ArchiveButton`, `ArchiveDialog`, `ArchivedNotice`, `useArchivedParam`) | `core/archive.ts`; `archive*`/`restore*` actions in `core/store.tsx`, `grants/domain/slice.ts`, `teaching/domain/slice.ts`; `core/derive.ts` (`programOptions`), `teaching/domain/derive.ts` (`termForDate`, `termsList`) |
| Permissions: what each role may see and do (decision 0001), one check behind the rail, the routes, the buttons and the store; a refused route shows a no-access screen at its own URL; a refused write is a no-op with a toast | (all) | Built in the browser; the database enforces it once there is one (#22) | `app/screens/NoAccess.tsx`, `app/access.ts`, `app/App.tsx` (`Guarded`) | `core/permissions.ts`: `PERMISSION_TABLE`, `can`; `core/store.tsx`: `guardActions`, `useCan`; each slice's `rules` |
| Credit for a change: activity, approvals, uploads and transaction status name the signed-in person | (all) | Built | `grant/ActivityTab.tsx`, rail footer in `app/Shell.tsx` | `core/module.ts`: `SliceContext.user`; `core/store.tsx` |
| Shell: rail, top bar, page header; the top bar says "Saving…" while a save takes a moment and "Couldn't save" with Try again after a failure | (all) | Built | `app/Shell.tsx` (`SaveState`), `app/responsive.css` | rail is read from each manifest's `nav`, leaving out what the role may not open, and a section with nothing left; `core/store.tsx` (`useStore().saving`) |
| Dashboard | `/` | Built | `app/screens/Dashboard.tsx` | composed from each manifest's `dashboard` |
| Partners: organizations and venues; archive and restore on each page, Show archived on each list (local state) | `/partners`, `/partners/organizations/:id`, `/partners/venues/:id` | Built | `app/screens/partners/` | `core/store.tsx` (`archiveOrganization`, `archiveVenue`), `core/derive.ts` (`venuesForOrganization`) |
| Settings: staff (title, role, teaches, archive and restore, Show archived in local state; an Admin or a Director may make someone an Admin, and nobody changes their own role: their own Edit dialog shows the role as text, #47), modules, programs, fiscal year, export, import; with the demo on, the demo date and Reset demo data | `/settings` | Built | `app/screens/Settings.tsx` | `core/permissions.ts` (`mayChangeStaff`, `ADMIN_MAKERS`, `OWN_ROLE_REFUSAL`); `core/store.tsx` (`updateStaff` rule, `archiveStaff`, `restoreStaff`, `setDemoToday`, `resetDemo`), `core/repository.ts`, `core/demo.ts` |
| Programs: add, rename (name and short name), archive and restore, for Admin and Director (decision 0001, "Programs", proposed in #44); a new program gets a generated id, so a rename breaks nothing; an archived program leaves the pickers for new grants, students, ensembles and hours and stays named on everything that names it | `/settings` (Programs card) | Built; layout proposed in #44, not final until reviewed | `app/screens/settings/ProgramsCard.tsx` | `core/store.tsx` (`addProgram`, `updateProgram`, `archiveProgram`, `restoreProgram`, their rules, `normalise`); `core/derive.ts` (`programOptions`, `programsList`, `programProblem`) |
| Program budgets, projects and grant shares (decision 0006, #55): a program's budget for each fiscal year; projects under a program (archive and restore); a grant's money shared out to a program's year or a project, with given and not yet given, "If awarded" kept apart, and four warnings that never refuse. The demo seeds the prototype's numbers; a new office starts with none | (no screen yet: #56) | Gap: domain only, the screens come with #56 | | `core/store.tsx` (`setProgramBudget`, `addProject`, `updateProject`, `archiveProject`, `restoreProject`, their rules, `normalise`); `core/derive.ts` (`programBudget`, `projectsInFiscalYear`, `fiscalYearChoices`, `targetBudget`, `fundingSummary`); `core/module.ts` (`FundingContribution`); `grants/domain/shares.ts` (`grantGiving`, `fundingFor`, `givingGrants`, `targetWarnings`, `giveWarnings`, `defaultShareYear`); `grants/domain/slice.ts` (`giveShare`, `changeShare`, `takeBackShare`); `grants/manifest.tsx` (`funding`) |
| Storage, and the demo switch: a build with `VITE_DEMO` on starts from the sample data, off starts every slice empty (decision 0004), but for the six programs and the default playbook (#47). The demo date is a browser preference, never exported. Every change goes through the `Repository` interface: one `load` per module, one `apply` per change, both async; a change shows at once and a failed apply rolls its slice back with a toast saying what was not saved (decision 0003). In `npm run dev`, the `ja-portal:fail-saves` preference makes every save fail | | Mocked: localStorage behind the `Repository` interface, one key per module | | `core/persistence.ts` (`Repository`), `core/repository.ts` (`localRepository`, `fresh`, `FAIL_SAVES_KEY`), `core/live.ts` (the per-slice queue and rollback), `core/demo.ts` (`isDemo`), each slice's `seed`, `empty` and `describe`, `netlify.toml` |
| Docked side panel; one with unsaved edits asks "Discard your changes?" before it closes or the page swaps it | | Built | `app/components/SidePanel.tsx` (`dirty`, `usePanelGuard`) | |
| Toasts | | Built | `app/ToastHost.tsx` | |
| Lint and formatting: module boundaries, storage, `new Date()` in screens | (`npm run lint`) | Built | | `eslint.config.js`, `prettier.config.js` (repo root) |

## Grants

Module folder `modules/grants/`. Wiring in `grants/manifest.tsx`.

### Before the award

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| All grants: table, filters, views; a grant names one or more programs (decision 0006, #53): the Programs column lists them by short name and the program filter matches a grant if any of them does; archived grants hidden unless Show archived | `/grants`, `?archived=1` | Built | `grants/screens/Grants.tsx` | `derive.ts`: `grantsByView` (`includeArchived`), `programNames`, `grantsForProgram` |
| Add grant: three-step dialog for a new grant, at Prospect or Applying; step 1 ticks one or more programs (at least one). The same checklist of programs is in Grant details and Edit award record (`grant/ProgramPicker.tsx`) | `/grants?add=1` | Built | `grants/screens/grants/AddGrantDialog.tsx`, `grant/ProgramPicker.tsx` | `slice.ts`: `addGrant`; `templates.ts`: `templatePlan` |
| Bring in a grant already under way: "This grant is already under way" in step 1 of Add grant opens five steps (funder and program with the phase now, award and the dates it knows, budget, payments and reports, checklist from that phase on), offered to the roles that may edit the award; one change, one "Brought into the portal at …" activity row (decision 0004) | `/grants?add=1` | Built | `grants/screens/grants/AddGrantDialog.tsx`, `grants/screens/grants/InFlightSteps.tsx` | `slice.ts`: `addGrant` with `inFlight`, the `addGrant` rule; `inflight.ts`: `inFlightRefusal`; `templates.ts`: `templatePlan` (`fromPhase`); `phases.ts`: `IN_FLIGHT_PHASES`, `passedPhases` |
| Grant detail frame: header, tabs, right column; Archive in the header, the archived banner with Restore, an archived funder named in the subtitle | `/grants/:id` | Built | `grants/screens/GrantDetail.tsx` | tab list depends on `isPostAward`; `slice.ts`: `archiveGrant`, `restoreGrant` |
| Phase stepper and phase changes; a grant brought in shows the steps it passed as done, dated only from its submitted, awarded and period-start dates | `/grants/:id` | Built | `grant/PhaseStepper.tsx`, `grant/TransitionDialog.tsx` | `phases.ts`: `phaseEnteredOn`; `slice.ts`: `transition` |
| Checklist tab | `?tab=checklist` | Built | `grant/ChecklistTab.tsx` | `slice.ts`: task actions; `derive.ts`: `checklistProgress` |
| Activity tab | `?tab=activity` | Built | `grant/ActivityTab.tsx` | `derive.ts`: `grantActivity`; `slice.ts`: `addNote` |
| Key dates, funder and details cards; the funder card says when the funder is archived | right column | Built | `grant/SideCards.tsx` | `slice.ts`: `updateGrant` |
| Deadlines: list and calendar | `/deadlines`, `?view=calendar` | Built | `grants/screens/Deadlines.tsx`, `deadlines/CalendarMonth.tsx` | `derive.ts`: `deadlines`; `names.ts`: `funderShortName` |
| Funders; archive and restore on the funder page, Show archived on the list; a funder's grant history keeps its archived grants | `/funders`, `?archived=1`, `/funders/:id` | Built | `grants/screens/Funders.tsx`, `FunderDetail.tsx` | `derive.ts`: `fundersList`, `funderTotals`, `grantsByFunder`; `slice.ts`: `archiveFunder`, `restoreFunder` |
| Playbook: checklist templates; the four default templates come with the demo and with a new office alike (#47) | `/playbook` | Built | `grants/screens/Playbook.tsx` | `templates.ts` (`DEFAULT_TEMPLATES`, `defaultTemplates`); `seed.ts` (`makeSeed`, `makeEmpty`); `slice.ts`: template actions |
| Dashboard pipeline card | `/` | Built | `grants/screens/PipelinePanel.tsx` | `derive.ts`: `pipelineCounts` |

Screen paths in this table and the next two are under `grants/screens/`; domain paths are under
`grants/domain/`.

### After the award: the money side

Grant tabs for a grant that is awarded, active, reporting or closed. Mockups and the facts the
seed reproduces are in `design/saas/`.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Award tab: award record, payment schedule, terms; a payment that has arrived is not deleted | `/grants/:id` (default tab) | Built | `grant/AwardTab.tsx`, `grant/AwardDialogs.tsx` | `slice.ts`: `updateGrant`, payment actions (`PAYMENT_RECEIVED_REFUSAL`), term actions |
| Award letter card: preview, open, download, replace | right column of Award | Mocked: file contents are drawn, not stored | `grant/AwardTab.tsx` (`AwardAside`), `money/files.tsx` | `money.ts`: `awardLetter`, `grantFiles` |
| Budget tab: lines mapped to QuickBooks accounts and a class; Remove line moves a line's expenses to another line on the grant, then removes it | `?tab=budget`, `&line=<id>`, `&edit=<id>` | Built | `grant/BudgetTab.tsx`, `grant/BudgetLineEditor.tsx`, `grant/BudgetAccountPicker.tsx` | `money.ts`: `lineMatched`, `accountUsedBy`, `isMapped`, `moveTargets`; `slice.ts`: budget line actions, `moveExpenses` |
| Expenses tab: list, filter, backup index download | `?tab=expenses`, `&backup=missing` | Built | `grant/ExpensesTab.tsx`, `grant/expenseList.ts` | `money.ts`: `grantExpenses`, `backupSummary` |
| Expense detail: receipts, note, reassign, send back with the same confirm and Undo as Transactions | `?tab=expenses&expense=<id>` | Mocked: file contents held in memory for the session | `grant/ExpenseDetail.tsx`, `grant/ExpenseDialogs.tsx`, `money/files.tsx`, `money/sendBack.tsx` | `money.ts`: `expenseFiles`, `transactionSnapshot`; `slice.ts`: `addFile`, `updateExpense`, `unassignTransaction`, `restoreTransactions` |
| Reports tab: reports, reminders column, program numbers (across all the grant's programs together; a grant that names General operating counts every program); a report that has been sent (submitted, accepted or with a sent date) is not deleted | `?tab=reports` | Built | `grant/ReportsTab.tsx`, `grant/ProgramNumbers.tsx` | `slice.ts`: report actions (`REPORT_SENT_REFUSAL`); reads Teaching and Timesheets through their `index.ts` (`attendanceSummary` with `programIds`, `hoursForPrograms`); `derive.ts`: `coversWholeStudio` |
| Documents tab: stored files and the application register | `?tab=documents` | Mocked: as the award letter | `grant/DocumentsTab.tsx`, `grant/AwardStoredFiles.tsx` | `money.ts`: `grantFiles`; `slice.ts`: file and document actions |

### Money section of the rail

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Transactions: tabs, filters, suggestions, accept, undo | `/transactions`, `?tab=`, `?grant=`, `?line=`, `?q=`, `?account=`, `?period=`, `?page=` | Mocked: QuickBooks feed is seed data | `money/Transactions.tsx`, `money/TransactionRow.tsx`, `money/TransactionMenu.tsx`, `money/sendBack.tsx` | `money.ts`: `suggestionFor`, `acceptableSuggestions`, `transactionCounts`, `eligibleLines`, `backupCarry`, `backupMoves`, `transactionSnapshot`; `slice.ts`: `assignTransaction`, `markNotGrantFunded`, `acceptSuggestions`, `restoreTransactions`; `names.ts`: `funderShortName` |
| Split a transaction across grants, save as a rule; an edited split asks before it closes or another transaction opens | `/transactions?tx=<id>` | Built | `money/SplitPanel.tsx`, `money/Transactions.tsx` (`usePanelGuard`) | `money.ts`: `usualShares`, `splitByPercent`; `slice.ts`: `assignTransaction`, `saveSplitRule`; `names.ts`: `funderShortName` |
| Sync with QuickBooks | button on Transactions and Settings | Mocked: moves `incoming` into `transactions`, once | | `slice.ts`: `syncQuickBooks` |
| Budget vs. actual: table, warnings, export, print; this year leaves archived grants out, All and last fiscal year keep them | `/budget`, `?period=fy\|all\|fy-prev`, `?grant=<id>` | Built | `money/BudgetVsActual.tsx`, `money/bva.ts` (`grantsForPeriod`), `money/bva.css` (print rules) | `money.ts`: `linePaces`, `grantPace`, `lineNeedsAttention`, `trackedGrants` (`includeArchived`), `trackedGrantsInFy`; `names.ts`: `funderShortName` |
| Spend-down: charts, figures, advice | `/spend-down`, `?show=`, `#<grantId>` | Built | `money/SpendDown.tsx`, `money/SpendChart.tsx`, `money/spend.ts` (`whatToDo`) | `money.ts`: `grantPace`, `spendSeries`, `paceDriver` |
| Dashboard money card | `/` | Built | `money/MoneyPanel.tsx` | `money.ts`: `grantPace`, `transactionCounts`, `expensesMissingBackup`; `names.ts`: `funderShortName` |
| Dashboard attention rows for money | `/` | Built | `grants/manifest.tsx` (`moneyAttention`) | `money.ts`: `offPaceGrants` |

### Reports and reminders

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Reports owed card | `/deadlines?kind=report` | Built | `deadlines/ReportsOwedCard.tsx` | `money.ts`: `reportsOwed`, `nextReminder`, `reminderSchedule`; `names.ts`: `funderShortName` |
| Reminders panel: schedule, recipients, email preview; with unsaved edits it asks before it closes, and choosing another report leaves it open with its edits until Discard or Keep editing | `/deadlines?kind=report&report=<id>` | Mocked: emails are previewed, never sent | `deadlines/ReminderPanel.tsx`, `deadlines/ReminderParts.tsx`, `Deadlines.tsx` (`usePanelGuard`) | `money.ts`: `reminderPlanFor`, `planSchedule` (the draft), `reminderSchedule`; `slice.ts`: `saveReminderPlan`, `resetReminderPlan`; `names.ts`: `funderShortName` |
| Default reminders | Deadlines and Settings | Built | `deadlines/ReminderDefaults.tsx`, `settings/RemindersCard.tsx` | `slice.ts`: `updateReminderDefaults` |
| QuickBooks connection card | `/settings` | Mocked: connect is a stand-in dialog | `settings/QuickBooksCard.tsx` | `slice.ts`: `setQuickBooksConnected`, `syncQuickBooks` |

### Shared by the money screens

Reach for these before writing a new one.

| Piece | File |
| --- | --- |
| `PaceBadge`, `PaceMark`, `PaceBar`, `Figures`, `QuickBooksStatus`, `LinkButton`, `toCsv`, `downloadText` | `grants/screens/money/shared.tsx` |
| `FilePaper`, `FileViewerDialog`, `FileDrop`, `PageTurner`, `describeFile`, `rememberFile`, `downloadFile` | `grants/screens/money/files.tsx` |
| `SectionBand`, `FooterBand`, `AddButton`, `DialogFields`, `FieldRow`, `InlineConfirm`, `DeleteX` | `grants/screens/grant/parts.tsx` |
| Pacing thresholds and status words | `grants/domain/money.ts`: `GRANT_PACE_MARGIN`, `LINE_FAST_MARGIN`, `PACE_LABEL` |
| Demo data for the money side | `grants/domain/seed-money.ts` |

## Teaching

Module folder `modules/teaching/`. Spec in `docs/PLATFORM.md` section 2.2.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Schedule: week grid and term view, add class; archive and restore an ensemble from the term view's Ensembles card (Show archived as `?archived=1`); an archived ensemble's classes leave the week grid from its archive date | `/schedule`, `?view=term&archived=1` | Built | `teaching/screens/Schedule.tsx`, `schedule/AddClassDialog.tsx` | `teaching/domain/derive.ts` (`isScheduled`, `ensemblesList`), `slice.ts` (`archiveEnsemble`, `restoreEnsemble`) |
| Sessions and ensembles: the term view's Sessions card (name, dates, classes planned; Show archived on the card) and Ensembles card each have Edit, Archive, Restore and an Add button, for the roles that edit the schedule; Add session and Add ensemble dialogs (an ensemble's lead is one of the staff who teach, its colour one of the five tones); a new venue or room moves the ensemble's classes from today on; with no ensemble the top bar offers Add ensemble | `/schedule?view=term` | Built; layout proposed in #44, not final until reviewed | `teaching/screens/Schedule.tsx` (`SessionsCard`, `EnsemblesCard`), `schedule/TermDialog.tsx`, `schedule/EnsembleDialog.tsx` | `slice.ts` (`addTerm`, `updateTerm`, `archiveTerm`, `restoreTerm`, `addEnsemble`, `updateEnsemble`, their rules); `derive.ts` (`termProblems`, `ensembleProblems`, `weeksBetween`, `leadOptions`, `nextTone`, `termsList`) |
| Roll call; when a save fails every mark and the notes stay on screen with "Couldn't save. Your marks are still here." and a Try again that sends them again; an archived student is off an open roll, and a submitted one lists everyone marked at it | `/roll/:meetingId` | Built | `teaching/screens/RollCall.tsx` | `teaching/domain/slice.ts`, `derive.ts` (`rollCallStudents`), `useStore().whenSaved` |
| Students: roster, waitlist, enroll; archive and restore from the student card, Show archived on the roster | `/students`, `?archived=1` | Built | `teaching/screens/Students.tsx`, `students/EnrollStudentDialog.tsx` | `teaching/domain/derive.ts` (`rosterFor` with `includeArchived`), `slice.ts` (`archiveStudent`, `restoreStudent`) |
| Import students from a CSV: blank template, preview with each row's problems, closest match or waitlist or skip, add all at once | `/students` (Import) | Built; layout proposed in #14, not final until reviewed | `teaching/screens/students/ImportStudentsDialog.tsx`, `students/import.css` | `teaching/domain/import.ts`: `parseStudentsCsv`, `studentsToImport`, `studentsCsvTemplate`, `readCsv`, `writeCsv`; `slice.ts`: `importStudents` |
| Dashboard today's classes card | `/` | Built | `teaching/screens/TodayPanel.tsx` | `teaching/manifest.tsx` |

## Timesheets

Module folder `modules/timesheets/`. Spec in `docs/PLATFORM.md` section 2.3.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Timesheets: hours by week, approvals, log hours; Submit week hands the signed-in person's own drafts for the week on screen to the office (a confirmation, then they read Submitted and can't be changed), and is left out when they have none or the teacher filter shows somebody else; an archived teacher's hours and approvals still count and name them | `/timesheets` | Built | `timesheets/screens/Timesheets.tsx`, `LogHoursDialog.tsx` | `timesheets/domain/derive.ts` (`ownDrafts`), `slice.ts` (`submitWeek`, `submitEntry`) |

## Known gaps

Work that is known to be missing or wrong. Remove a line when it is fixed.

| Gap | Where |
| --- | --- |
| No backend. Everything is localStorage behind the `Repository` interface; sign-in is a hash check in the browser. | `core/repository.ts`, `core/auth.ts` |
| Permissions are checked in the browser only; anyone with the dev tools can change their role. Row-level security comes with the backend (#22). | `core/permissions.ts` |
| Rail badges count for everyone: a teacher sees the office's "awaiting approval" count on Timesheets, Read-only the roll calls due on Schedule. | `timesheets/manifest.tsx`, `teaching/manifest.tsx` (`badge`) |
| Program budgets, projects and grant shares exist in the data (#55) but no screen shows or changes them yet: the Programs sheets and each grant's "Where this grant's money goes" come with #56. | `core/store.tsx`, `grants/domain/shares.ts` |
| QuickBooks is simulated. No real connection, and a sync brings new transactions only once. | `grants/domain/seed-money.ts` (`INCOMING`), `slice.ts` (`sync`) |
| The student import adds new students only. A name already in the portal is flagged and starts on Skip; nothing updates an existing student from a file, and a guardian email or address column is ignored. | `teaching/domain/import.ts` |
| File contents are not stored. A file added in a session is lost on reload; a seeded file is a drawn page. | `grants/screens/money/files.tsx` |
| "Download all backup" produces a spreadsheet index, not a zip of the files. | `grants/screens/grant/ExpensesTab.tsx` |
| Reminder emails are never sent. | `grants/screens/deadlines/ReminderPanel.tsx` |
| Leaving the page (a rail link, the browser's back) while a docked panel has unsaved edits discards them without asking; only closing the panel and choosing another record ask. | `app/components/SidePanel.tsx` |
| "Start from the usual five categories" reads its categories and accounts from the demo data. | `grant/BudgetTab.tsx`, `grants/domain/seed-money.ts` (`CATEGORY_ACCOUNTS`) |
| The award letter card says the terms feed the budget and the spend-down warnings; only Spend-down's "What to do" reads them, and only the terms labelled "Unspent funds" and "Budget changes". | `grant/AwardTab.tsx`, `money/spend.ts` (`whatToDo`) |
| The dashboard's "expenses missing a receipt" link counts every grant but opens only the first one's Expenses tab. | `money/MoneyPanel.tsx`, `grants/manifest.tsx` |
| The money side is inside the grants module. If it becomes its own product it needs its own module and slice. | `grants/manifest.tsx`, `grants/domain/` |
| Screens have only smoke tests (`npm run test:e2e`): sign in, add a grant, bring in a grant already under way, assign a transaction, send back an expense from a grant's Expenses tab and undo it, take roll, log, submit and approve hours with two logins, every route with no data (`empty-states.spec.ts`), and a new office adding a program, a venue, a session, an ensemble, a class and a student and taking roll (`new-office.spec.ts`). Every other screen and flow has no automated test. | `e2e/`, `modules/*/screens/` |
| A new office (demo off) still starts with the six Jazz Angels programs pre-loaded (`makeCoreEmpty`), though Settings can now add, rename and archive them. Two of the seeded ids carry meaning in code: Timesheets' "In-school hours" stat reads `in-school`, and a grant on `general-operating` counts the whole studio in Program numbers; a program added in Settings is never either. | `core/seed.ts`, `timesheets/screens/Timesheets.tsx`, `grant/ProgramNumbers.tsx` |
| Sessions may overlap; the current session is the earliest one today falls in. Changing a session's dates moves no classes, and nothing puts a session's weekly classes on the schedule but Add class, one at a time. There are five ensemble colours, so ensembles share them. | `teaching/domain/derive.ts` (`termForDate`), `schedule/AddClassDialog.tsx` |
| The steps for bringing in a grant already under way have no mockup; #21 proposed them and they are not final until reviewed. QuickBooks transactions from before the switch-over are not assigned to a grant brought in (the sync would have to reach back to its period start), so its spending, and its pace on Budget vs. actual and Spend-down, count only what is entered or assigned in the portal. A payment counts as received only with its received date, so one whose arrival day is unknown cannot be entered as received; a received payment's expected date may be left blank and takes the received date. On a brought-in grant Prospect, LOI, Applying and Reporting show no date: the LOI and application due dates are deadlines, not the day it entered the phase. A past, closed grant fits the record (the award, the dates and the history are all optional) but there is no screen to enter one. | `grants/screens/grants/InFlightSteps.tsx`, `grants/domain/money.ts` |
| The archive controls (the Show archived switch, the Archive button and its confirmation, the banner with Restore) have no mockup; #20 proposed them and they are not final until reviewed. There is no bulk archive, and archiving a funder logs no activity row, since activity belongs to a grant. | `app/components/archive.tsx` |
| Submit week and its confirmation have no mockup; #45 proposed them and they are not final until reviewed. A submitted entry cannot be recalled, so a mistake is the office's to sort out. | `timesheets/screens/Timesheets.tsx` |
| `deleteEntry` removes an hours entry whatever its status; no screen offers it yet. When one does, it should offer drafts only (an approved entry is money). | `timesheets/domain/slice.ts` |
| The staff list is never empty. With the demo off a new office starts with the seven staff records the sign-in logins belong to (the only way in until real accounts, #22), and loading a saved core slice adds back any of them it lacks; with the demo on it adds back all ten seeded people. Settings' "Only you so far" state shows only once real accounts replace the demo logins. | `core/seed.ts` (`loginStaff`), `core/store.tsx` (`normalise`), `app/screens/Settings.tsx` |
