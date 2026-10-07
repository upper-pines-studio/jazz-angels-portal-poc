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
| Sign in: one demo login per role; each belongs to a staff record, whose role it carries; a login with no staff record is refused | (gate) | Mocked: hashes checked in the browser, no server | `app/screens/Login.tsx`, `app/AuthGate.tsx` | `core/auth.ts`: `USERS`, `checkSignIn`; `core/roles.ts` |
| Permissions: what each role may see and do (decision 0001), one check behind the rail, the routes, the buttons and the store; a refused route shows a no-access screen at its own URL; a refused write is a no-op with a toast | (all) | Built in the browser; the database enforces it once there is one (#22) | `app/screens/NoAccess.tsx`, `app/access.ts`, `app/App.tsx` (`Guarded`) | `core/permissions.ts`: `PERMISSION_TABLE`, `can`; `core/store.tsx`: `guardActions`, `useCan`; each slice's `rules` |
| Credit for a change: activity, approvals, uploads and transaction status name the signed-in person | (all) | Built | `grant/ActivityTab.tsx`, rail footer in `app/Shell.tsx` | `core/module.ts`: `SliceContext.user`; `core/store.tsx` |
| Shell: rail, top bar, page header | (all) | Built | `app/Shell.tsx`, `app/responsive.css` | rail is read from each manifest's `nav`, leaving out what the role may not open, and a section with nothing left |
| Dashboard | `/` | Built | `app/screens/Dashboard.tsx` | composed from each manifest's `dashboard` |
| Partners: organizations and venues | `/partners`, `/partners/organizations/:id`, `/partners/venues/:id` | Built | `app/screens/partners/` | `core/store.tsx`, `core/derive.ts` |
| Settings: staff (title, role, teaches), modules, programs, fiscal year, export, import; with the demo on, the demo date and Reset demo data | `/settings` | Built | `app/screens/Settings.tsx` | `core/store.tsx` (`setDemoToday`, `resetDemo`), `core/repository.ts`, `core/demo.ts` |
| Storage, and the demo switch: a build with `VITE_DEMO` on starts from the sample data, off starts every slice empty (decision 0004). The demo date is a browser preference, never exported | | Mocked: localStorage, one key per module | | `core/repository.ts` (`fresh`), `core/demo.ts` (`isDemo`), each slice's `seed` and `empty`, `netlify.toml` |
| Docked side panel | | Built | `app/components/SidePanel.tsx` | |
| Toasts | | Built | `app/ToastHost.tsx` | |
| Lint and formatting: module boundaries, storage, `new Date()` in screens | (`npm run lint`) | Built | | `eslint.config.js`, `prettier.config.js` (repo root) |

## Grants

Module folder `modules/grants/`. Wiring in `grants/manifest.tsx`.

### Before the award

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| All grants: table, filters, views | `/grants` | Built | `grants/screens/Grants.tsx` | `derive.ts`: `grantsByView` |
| Add grant: three-step dialog | `/grants?add=1` | Built | `grants/screens/grants/AddGrantDialog.tsx` | `slice.ts`: `addGrant`; `templates.ts` |
| Grant detail frame: header, tabs, right column | `/grants/:id` | Built | `grants/screens/GrantDetail.tsx` | tab list depends on `isPostAward` |
| Phase stepper and phase changes | `/grants/:id` | Built | `grant/PhaseStepper.tsx`, `grant/TransitionDialog.tsx` | `phases.ts`; `slice.ts`: `transition` |
| Checklist tab | `?tab=checklist` | Built | `grant/ChecklistTab.tsx` | `slice.ts`: task actions; `derive.ts`: `checklistProgress` |
| Activity tab | `?tab=activity` | Built | `grant/ActivityTab.tsx` | `derive.ts`: `grantActivity`; `slice.ts`: `addNote` |
| Key dates, funder and details cards | right column | Built | `grant/SideCards.tsx` | `slice.ts`: `updateGrant` |
| Deadlines: list and calendar | `/deadlines`, `?view=calendar` | Built | `grants/screens/Deadlines.tsx`, `deadlines/CalendarMonth.tsx` | `derive.ts`: `deadlines`; `names.ts`: `funderShortName` |
| Funders | `/funders`, `/funders/:id` | Built | `grants/screens/Funders.tsx`, `FunderDetail.tsx` | `derive.ts`: `funderTotals`, `grantsByFunder` |
| Playbook: checklist templates | `/playbook` | Built | `grants/screens/Playbook.tsx` | `templates.ts`; `slice.ts`: template actions |
| Dashboard pipeline card | `/` | Built | `grants/screens/PipelinePanel.tsx` | `derive.ts`: `pipelineCounts` |

Screen paths in this table and the next two are under `grants/screens/`; domain paths are under
`grants/domain/`.

### After the award: the money side

Grant tabs for a grant that is awarded, active, reporting or closed. Mockups and the facts the
seed reproduces are in `design/saas/`.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Award tab: award record, payment schedule, terms | `/grants/:id` (default tab) | Built | `grant/AwardTab.tsx`, `grant/AwardDialogs.tsx` | `slice.ts`: `updateGrant`, payment actions, term actions |
| Award letter card: preview, open, download, replace | right column of Award | Mocked: file contents are drawn, not stored | `grant/AwardTab.tsx` (`AwardAside`), `money/files.tsx` | `money.ts`: `awardLetter`, `grantFiles` |
| Budget tab: lines mapped to QuickBooks accounts and a class; Remove line moves a line's expenses to another line on the grant, then removes it | `?tab=budget`, `&line=<id>`, `&edit=<id>` | Built | `grant/BudgetTab.tsx`, `grant/BudgetLineEditor.tsx`, `grant/BudgetAccountPicker.tsx` | `money.ts`: `lineMatched`, `accountUsedBy`, `isMapped`, `moveTargets`; `slice.ts`: budget line actions, `moveExpenses` |
| Expenses tab: list, filter, backup index download | `?tab=expenses`, `&backup=missing` | Built | `grant/ExpensesTab.tsx`, `grant/expenseList.ts` | `money.ts`: `grantExpenses`, `backupSummary` |
| Expense detail: receipts, note, reassign, send back | `?tab=expenses&expense=<id>` | Mocked: file contents held in memory for the session | `grant/ExpenseDetail.tsx`, `grant/ExpenseDialogs.tsx`, `money/files.tsx` | `money.ts`: `expenseFiles`; `slice.ts`: `addFile`, `updateExpense`, `unassignTransaction` |
| Reports tab: reports, reminders column, program numbers | `?tab=reports` | Built | `grant/ReportsTab.tsx`, `grant/ProgramNumbers.tsx` | `slice.ts`: report actions; reads Teaching and Timesheets through their `index.ts` |
| Documents tab: stored files and the application register | `?tab=documents` | Mocked: as the award letter | `grant/DocumentsTab.tsx`, `grant/AwardStoredFiles.tsx` | `money.ts`: `grantFiles`; `slice.ts`: file and document actions |

### Money section of the rail

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Transactions: tabs, filters, suggestions, accept, undo | `/transactions`, `?tab=`, `?grant=`, `?line=`, `?q=`, `?account=`, `?period=`, `?page=` | Mocked: QuickBooks feed is seed data | `money/Transactions.tsx`, `money/TransactionRow.tsx`, `money/TransactionMenu.tsx` | `money.ts`: `suggestionFor`, `acceptableSuggestions`, `transactionCounts`, `eligibleLines`, `backupCarry`, `backupMoves`, `transactionSnapshot`; `slice.ts`: `assignTransaction`, `markNotGrantFunded`, `acceptSuggestions`, `restoreTransactions`; `names.ts`: `funderShortName` |
| Split a transaction across grants, save as a rule | `/transactions?tx=<id>` | Built | `money/SplitPanel.tsx` | `money.ts`: `usualShares`, `splitByPercent`; `slice.ts`: `assignTransaction`, `saveSplitRule`; `names.ts`: `funderShortName` |
| Sync with QuickBooks | button on Transactions and Settings | Mocked: moves `incoming` into `transactions`, once | | `slice.ts`: `syncQuickBooks` |
| Budget vs. actual: table, warnings, export, print | `/budget`, `?period=fy\|all\|fy-prev`, `?grant=<id>` | Built | `money/BudgetVsActual.tsx`, `money/bva.ts`, `money/bva.css` (print rules) | `money.ts`: `linePaces`, `grantPace`, `lineNeedsAttention`, `trackedGrantsInFy`; `names.ts`: `funderShortName` |
| Spend-down: charts, figures, advice | `/spend-down`, `?show=`, `#<grantId>` | Built | `money/SpendDown.tsx`, `money/SpendChart.tsx`, `money/spend.ts` (`whatToDo`) | `money.ts`: `grantPace`, `spendSeries`, `paceDriver` |
| Dashboard money card | `/` | Built | `money/MoneyPanel.tsx` | `money.ts`: `grantPace`, `transactionCounts`, `expensesMissingBackup`; `names.ts`: `funderShortName` |
| Dashboard attention rows for money | `/` | Built | `grants/manifest.tsx` (`moneyAttention`) | `money.ts`: `offPaceGrants` |

### Reports and reminders

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Reports owed card | `/deadlines?kind=report` | Built | `deadlines/ReportsOwedCard.tsx` | `money.ts`: `reportsOwed`, `nextReminder`, `reminderSchedule`; `names.ts`: `funderShortName` |
| Reminders panel: schedule, recipients, email preview | `/deadlines?kind=report&report=<id>` | Mocked: emails are previewed, never sent | `deadlines/ReminderPanel.tsx`, `deadlines/ReminderParts.tsx` | `money.ts`: `reminderPlanFor`, `planSchedule` (the draft), `reminderSchedule`; `slice.ts`: `saveReminderPlan`, `resetReminderPlan`; `names.ts`: `funderShortName` |
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
| Schedule: week grid and term view, add class | `/schedule` | Built | `teaching/screens/Schedule.tsx`, `schedule/AddClassDialog.tsx` | `teaching/domain/derive.ts`, `slice.ts` |
| Roll call | `/roll/:meetingId` | Built | `teaching/screens/RollCall.tsx` | `teaching/domain/slice.ts` |
| Students: roster, waitlist, enroll | `/students` | Built | `teaching/screens/Students.tsx`, `students/EnrollStudentDialog.tsx` | `teaching/domain/derive.ts` |
| Import students from a CSV: blank template, preview with each row's problems, closest match or waitlist or skip, add all at once | `/students` (Import) | Built; layout proposed in #14, not final until reviewed | `teaching/screens/students/ImportStudentsDialog.tsx`, `students/import.css` | `teaching/domain/import.ts`: `parseStudentsCsv`, `studentsToImport`, `studentsCsvTemplate`, `readCsv`, `writeCsv`; `slice.ts`: `importStudents` |
| Dashboard today's classes card | `/` | Built | `teaching/screens/TodayPanel.tsx` | `teaching/manifest.tsx` |

## Timesheets

Module folder `modules/timesheets/`. Spec in `docs/PLATFORM.md` section 2.3.

| Feature | Route | Status | Screen | Domain |
| --- | --- | --- | --- | --- |
| Timesheets: hours by week, approvals, log hours | `/timesheets` | Built | `timesheets/screens/Timesheets.tsx`, `LogHoursDialog.tsx` | `timesheets/domain/derive.ts`, `slice.ts` |

## Known gaps

Work that is known to be missing or wrong. Remove a line when it is fixed.

| Gap | Where |
| --- | --- |
| No backend. Everything is localStorage; sign-in is a hash check in the browser. | `core/repository.ts`, `core/auth.ts` |
| Permissions are checked in the browser only; anyone with the dev tools can change their role. Row-level security comes with the backend (#22). | `core/permissions.ts` |
| Rail badges count for everyone: a teacher sees the office's "awaiting approval" count on Timesheets, Read-only the roll calls due on Schedule. | `timesheets/manifest.tsx`, `teaching/manifest.tsx` (`badge`) |
| QuickBooks is simulated. No real connection, and a sync brings new transactions only once. | `grants/domain/seed-money.ts` (`INCOMING`), `slice.ts` (`sync`) |
| The student import adds new students only. A name already in the portal is flagged and starts on Skip; nothing updates an existing student from a file, and a guardian email or address column is ignored. | `teaching/domain/import.ts` |
| File contents are not stored. A file added in a session is lost on reload; a seeded file is a drawn page. | `grants/screens/money/files.tsx` |
| "Download all backup" produces a spreadsheet index, not a zip of the files. | `grants/screens/grant/ExpensesTab.tsx` |
| Reminder emails are never sent. | `grants/screens/deadlines/ReminderPanel.tsx` |
| Choosing another report while the reminders panel has unsaved edits discards them without asking. | `grants/screens/Deadlines.tsx` |
| "Start from the usual five categories" reads its categories and accounts from the demo data. | `grant/BudgetTab.tsx`, `grants/domain/seed-money.ts` (`CATEGORY_ACCOUNTS`) |
| The award letter card says the terms feed the budget and the spend-down warnings; only Spend-down's "What to do" reads them, and only the terms labelled "Unspent funds" and "Budget changes". | `grant/AwardTab.tsx`, `money/spend.ts` (`whatToDo`) |
| The dashboard's "expenses missing a receipt" link counts every grant but opens only the first one's Expenses tab. | `money/MoneyPanel.tsx`, `grants/manifest.tsx` |
| The money side is inside the grants module. If it becomes its own product it needs its own module and slice. | `grants/manifest.tsx`, `grants/domain/` |
| Screens have only smoke tests (`npm run test:e2e`): sign in, add a grant, assign a transaction, take roll, log hours and approve hours, and every route with no data (`empty-states.spec.ts`). Submitting hours has no control on the Timesheets screen, so it is not tested; every other screen and flow has no automated test. | `e2e/`, `modules/*/screens/` |
| No screen adds a session (term) or an ensemble, so an office starting empty cannot put a class on the schedule: Add class needs an ensemble, and the Schedule says so. | `teaching/screens/Schedule.tsx`, `teaching/domain/slice.ts` |
| Programs cannot be added or edited in the portal. A new office (demo off) starts with the six Jazz Angels programs pre-loaded, so the grant and student dialogs have programs to offer; with none, Settings says so. | `app/screens/Settings.tsx`, `core/seed.ts` (`makeCoreEmpty`) |
| The staff list is never empty. With the demo off a new office starts with the seven staff records the sign-in logins belong to (the only way in until real accounts, #22), and loading a saved core slice adds back any of them it lacks; with the demo on it adds back all ten seeded people. Settings' "Only you so far" state shows only once real accounts replace the demo logins. | `core/seed.ts` (`loginStaff`), `core/store.tsx` (`normalise`), `app/screens/Settings.tsx` |
