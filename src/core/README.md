# `src/core` — the shared nouns and the store

Core owns the people, the programs with their budgets and projects, the places
(organizations and their venues), the fiscal year, the module switches, the store and the formatting
helpers. It owns nothing workflow-specific and it
never imports from `src/modules`.

```ts
import { useStore, fiscalYear, money, dateShort } from '../../core';
```

---

## How the store composes slices

Every module hands the platform one `ModuleSlice`. `StoreProvider` is given the
registry's slices, puts `coreSlice` in front of them, and builds one state key
per slice:

```tsx
// src/app/App.tsx
<StoreProvider slices={MODULES.map(m => m.slice)}>
```

```ts
const { state, today, actions } = useStore();

state.core.staff;                 // the shared nouns
state.grants.grants;              // the grants module's own state
actions.core.updateSettings({ fiscalYearStartMonth: 7 });
actions.grants.transition(id, 'submitted', { date: today });
```

- `state: PortalState` — `{ core, grants, teaching, timesheets }`. Each module
  adds its own key with `declare module '../../../core/types'`, so core never
  names a module.
- `today: string` — today as `YYYY-MM-DD`: the demo date when the demo is on
  and this browser uses one, else the clock. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `demo: boolean`, `demoToday: string | undefined` — whether this is a demo
  build, and the demo date in use (Settings shows and moves it).
- `user: SignedInUser` — `{ id, name, role }` of whoever is signed in, read
  from their staff record, so a rename or a new role in Settings shows at once.
- `actions: PortalActions` — one namespace per slice. Every change is persisted.
- `saving: Saving` — `{ status: 'idle' | 'saving' | 'error', error?, retry? }`:
  whether a change is on its way to the repository, or the last one could not
  be saved. The shell's top bar shows it.
- `whenSaved(): Promise<boolean>` — resolves once everything dispatched so far
  has been applied: `true`, or `false` when something failed and was rolled
  back. Roll call waits on it before it leaves the page.

**Who did it.** Every slice's `createActions(dispatch, getState, ctx)` gets a
`SliceContext`: `today`, `newId(prefix)` and `user`, the signed-in person. An
action that records who did something (an activity row, an approval, an
upload, a transaction's status) credits `ctx.user.id`, never a fixed person.
`StoreProvider` takes the signed-in staff id as `userId` (App passes the
login's `staffId`); if that id names nobody in the staff list, or someone
archived, it renders nothing and calls `onUnknownUser('no-staff' | 'archived')`,
and App signs the person out with that refusal message.

**Routing.** An action's type is `<sliceId>/<name>`, so `grants/toggle-task`
only ever reaches the grants reducer. A slice that was not addressed keeps its
identity, so nothing else re-renders. `portal/replace` swaps every slice at once
(reset and import).

**Persistence.** The store talks to storage through one interface,
`Repository` in `persistence.ts`:

```ts
interface Repository {
  load(slice: ModuleSlice, today: string, demo: boolean): Promise<unknown>; // one per slice
  apply(sliceId: string, action: AnyAction, next: unknown): Promise<void>;  // one per change
}
```

`StoreProvider` calls `load` once per slice when it mounts and renders nothing
until they are all in. After that every change goes through `live.ts`:

1. `dispatch` runs the reducer and the screens see the change at once.
2. Each slice the change touched is handed to `apply(sliceId, action, next)`:
   the action as the slice dispatched it, for a backend that writes rows, and
   the slice's whole new state, for one that writes documents. An import or a
   reset (`portal/replace`) is one apply per slice.
3. Applies run one at a time per slice, in order. While any is in flight
   `saving.status` is `saving`.
4. When one rejects, that slice goes back to how it stood before the failed
   change, and the changes queued behind it on the same slice are dropped with
   it (each was made on top of it). Other slices carry on. `saving` becomes
   `error` with "Couldn't save <what>", where <what> comes from the slice's
   `describe(action)` ("the roll call mark"), else "that change";
   `onSaveFailed` gets the same sentence (App shows it as a toast), and
   `saving.retry` dispatches the dropped changes again. The next successful
   apply clears the error.

There is no offline queue and nothing retries on its own (decision 0003).
`StoreProvider` takes the repository as a prop (`repository`), defaulting to
`localRepository`; the tests pass a fake that fails on demand.

`localRepository` in `repository.ts` is the first implementation and the only
one: one localStorage key per slice, `ja-portal:<sliceId>:v1`. `load` reads the
key (and keeps a slice that started fresh, so it loads the same next time);
`apply` writes the slice's new state and rejects when the browser will not
store it (full, or storage switched off). In `npm run dev`, setting the
preference `ja-portal:fail-saves` to `1` (`FAIL_SAVES_KEY`; in devtools,
`localStorage.setItem('ja-portal:fail-saves', '1')`) makes every apply fail,
so the failure path can be seen; remove it to save again. A production build
ignores it.

Export and import use one envelope, `{ version, savedAt, slices }`; a file
written before a module existed imports fine, because any slice it does not
carry starts fresh instead. `readImport` and `freshState` only build the new
state; the store applies it like any other change. Preferences
(`loadPreference` / `savePreference`) and `savedStaff()`, which sign-in reads
before the store mounts, stay outside the interface: they are this browser's.

**Demo or empty.** `isDemo()` in `demo.ts` is the one reading of the build-time
`VITE_DEMO` switch: `1`/`true` on, `0`/`false` off, unset on in `npm run dev` and
off in `npm run build` (Netlify sets it to `1` in `netlify.toml`). The store
passes the answer to the repository, which starts a slice with nothing stored
(on load, on an import that lacks it, on reset) from `slice.seed(today)` when it
is on and `slice.empty()` when it is off (decision 0004: the portal starts
empty). The tests pass the mode themselves and never read the build.

**The demo date.** Not part of the data: a per-browser preference under
`ja-portal:demo-today` (`DEMO_TODAY_KEY`), so export, import and reset never
carry it. Unset means the seed's day, `SEED_TODAY`; "Use the real date" stores
`clock`. With the demo off it is ignored and today is the clock.

---

## The files

| File | What is in it |
| --- | --- |
| `types.ts` | `StaffMember` (`title` is the job title, `role` is one of the seven `Role`s of decision 0001), `SignedInUser`, `Program` (archivable; `ProgramId` is a plain string: the seeded ids stay as they were, a new program gets a generated `p-…` id), `Organization`, `Venue`, `Address`, `ProgramBudget` (a program's whole-dollar budget for one fiscal year, named by `FiscalYearLabel` "FY27"), `Project` (archivable one-off work under one program: name, `programId`, start and end, budget), `ProjectInput`, `FundingTarget` (a program's fiscal year, or a project: where money can go), `AppSettings` (the fiscal year and the module switches; the demo date is not in it), `CoreState`, and the augmentable `PortalState` / `PortalActions`. |
| `module.ts` | `ModuleSlice` (`seed(today)` the demo data, `empty()` a new office, `normalise(raw, demo)`, its `rules`: what each action needs, and an optional `describe(action)`: the change in plain words for a failed save), `ModuleManifest` (its `nav` is one `NavSection` or several, its optional `settings` are gated Cards for the Settings screen), `ModuleRoute` (`requires`, `allows`), `Requires`, `NavItem`, `NavSection`, `StatSpec`, `AttentionItem`, `GatedCard`, `FundingContribution` and `FundingSource` (a module's `funding`: what it puts toward a program's year or a project, and optionally its own `panel` for the sheet), `DashboardContribution` (whose optional `subtitle(state, today)` is joined onto the dashboard's own "Sunday, September 13 · FY27" with ` · `). |
| `persistence.ts` | The `Repository` interface: `load` one slice, `apply` one change, both promises. |
| `live.ts` | `createLiveStore`: the state, the per-slice apply queue, the rollback, `Saving` and `whenSaved`. No React, so the tests drive it with a fake repository. |
| `store.tsx` | `StoreProvider` (its `onRefused` shows a refused action's reason, its `onSaveFailed` a change that could not be saved, its `repository` defaults to localStorage), `useStore`, `useCan`, `coreSlice`, `guardActions` (wraps every slice's actions in its `rules`), `refusalMessage`, `newId`, `resolveToday`, `savedStaff()` (the staff list as saved, which sign-in reads before the store mounts). |
| `demo.ts` | `isDemo()` (the `VITE_DEMO` switch), `DEMO_TODAY_KEY` and the demo-date preference helpers. |
| `roles.ts` | `ROLES`, `ROLE_LABELS` (the words the screens use: Admin, Director, Office manager, Bookkeeper, Teacher, Office assistant, Read-only), `isRole`. |
| `archive.ts` | Decision 0002 in one place: `Archivable` (`archivedAt`, `archivedById`), `isArchived`, `archivedBy(record, date)` (archived on or before a day), `activeOnly`, `archivedOnly`, `withArchived(rows, include)` (current first, archived after), `pickable(rows, keepId)` (current, plus the one already chosen), `archiveFields(user, today)`, `restoreFields()`, `normaliseArchived` (every slice's `normalise` runs the nine archivable record types through it: the seven of decision 0002, plus sessions and programs). |
| `permissions.ts` | Decision 0001's table as data (`PERMISSION_TABLE`, same rows and columns as the decision file), `can(role, subject, need, own)` the one check, `cell`, `isOwnOnly`, `meets` / `meetsAny`, `mayChangeStaff` (only an Admin or a Director, `ADMIN_MAKERS`, makes, changes or archives an Admin), `OWN_ROLE_REFUSAL` (nobody changes their own role). |
| `repository.ts` | `localRepository`, the `Repository` on localStorage, one key per slice; `FAIL_SAVES_KEY`, the development switch that makes every save fail; export / `readImport` / `freshState`, each given the demo mode (`fresh` picks `seed` or `empty`); `loadPreference` / `savePreference` for a per-browser setting such as the collapsed rail or the demo date. With `auth.ts`, the only file that may touch localStorage (lint-enforced). |
| `auth.ts` | Sign-in against SHA-256 credential hashes (no plaintext passwords in source); the session key. Exported as `auth`. |
| `format.ts` | `money`, `dateShort`, `dateLong`, `dateRange`, `relativeDays`, `daysUntil`, `initials`. |
| `seed.ts` | `makeCoreSeed()`: the ten staff (one per demo login, plus the teaching artists), the six programs with their FY27 budgets, three projects (the Summer Jazz Intensive runs into FY28), one district with two schools, the studio, the settings. `makeCoreEmpty()`: a new office, with the six programs pre-loaded, the seven staff records the logins need (`loginStaff()`), no partners, venues, budgets or projects, the default settings. `STUDIO_VENUE_ID`, `PARAMOUNT_MS_VENUE_ID` and `SEED_PROJECT_IDS` are exported for module seeds. |
| `derive.ts` | `fiscalYear`, `fiscalYearNamed(label, startMonth)` ("FY27" back to its dates), `fiscalYearsOverlapping(start, end, startMonth)`, `fiscalYearChoices(state, today)` (this year, the next, and every year with a budget or a project), `staffById` (archived people too, so history names them), `programById`, `programName` (an archived program still reads by its name), `programOptions(state, keepId?)` (the pickers: current programs plus the one already chosen), `programsList(state, includeArchived?)`, `programFields` and `programProblem` (a blank name or one another program has), `organizationById`, `venueById`, `venueName`, `venuesForOrganization(state, id, includeArchived?)`, `placeLabel`, `addressLine`. Budgets and projects (decision 0006): `programBudget(state, programId, fy)` (undefined when none is set), `programBudgetProblem`, `projectById`, `projectName`, `projectsForProgram(state, programId, includeArchived?)`, `projectOverlaps(project, fy)`, `projectsInFiscalYear(state, fy, includeArchived?)` (a project shows in every year it overlaps), `projectFields`, `projectProblem`, `isWholeDollars`, `BUDGET_REFUSAL`. Targets: `targetBudget`, `targetName` ("In-School Program, FY27"), `targetProgramId`, `sameTarget`, `targetKey` (`program:in-school:FY27`, `project:prj-showcase`), and `fundingSummary(budget, sources)`: the sheet's `{ budget, awarded, ifAwarded, funded, stillToFind, overBudget }`, awarded and "If awarded" kept apart. |
| `auth.ts` | The sign-in check: SHA-256 of `username:password` via Web Crypto, checked against a small table of hashes, no plaintext in source. A login is a username and a `staffId`; its name and role come from that staff record, and a login whose record is missing is refused. The session (who, and when) lives in localStorage under `ja-portal:session:v1`. |

**Conventions.** Money is whole dollars as an integer. Dates are ISO
`YYYY-MM-DD` strings. Format only at render time.

**Places.** An `Organization` is the relationship (who to call, what was
agreed); a `Venue` is the physical place, and may belong to an organization,
so a district lists its schools. Jazz Angels' own studio is a venue of kind
`studio` with no organization. Modules point at venues by id and never copy
the name: `placeLabel(state, venueId, room)` renders "Studio 1" for the studio
and "Paramount Middle School · Band room B-12" for anywhere else. The office
manages both on the Partners screen (`src/app/screens/partners/`).

## Core actions

| Action | What it does |
| --- | --- |
| `addStaff(input)` | Adds a person: name, title, role, teaches. Returns the new id. Needs Staff and roles; adding an Admin needs an Admin or a Director (`mayChangeStaff`). |
| `updateStaff(id, patch)` | Patches a person, `role` and `teaches` included. Same rule as `addStaff`, and an Admin's record too needs an Admin or a Director; nobody changes their own role (`OWN_ROLE_REFUSAL`, "You can't change your own role. Ask someone else who manages staff."). |
| `addOrganization(input)` | Adds a partner: a district, a community centre. Returns the new id. |
| `updateOrganization(id, patch)` | Patches a partner. |
| `addVenue(input)` | Adds a place classes meet, optionally under an organization. Returns the new id. |
| `updateVenue(id, patch)` | Patches a venue. Ensembles point at it by id, so a rename shows everywhere. |
| `addProgram(input)` | Adds a program: a name and a short name (the name when left blank). Returns a generated id, never one made from the name. Needs Programs (Admin, Director); a blank or taken name is refused with why. |
| `updateProgram(id, patch)` | Renames a program. Its id stays, so every grant, student, ensemble and hour that names it shows the new name. Same rule. |
| `archiveProgram(id)` / `restoreProgram(id)` | Archives a program (it leaves the pickers for new grants, students, ensembles and hours; everything that names it keeps it) or restores it. Needs Programs. |
| `setProgramBudget(programId, fiscalYear, amount)` | Sets what a program costs in one fiscal year ("FY27"), replacing that year's budget (Set budget or Change budget on the program's sheet). Needs Program budgets and projects (decision 0001: Admin, Director, Office manager, Bookkeeper); refuses a missing program, a year that is not one, and an amount that is not whole dollars, 0 or more. |
| `addProject(input)` / `updateProject(id, patch)` | Add a project on a program's sheet, Edit on a project's. Adds a project under a program (returns a generated `prj-…` id), or changes its name, program, dates or budget; the name is trimmed. Same row; refuses a blank name, a missing program, missing dates, an end before the start, and a budget that is not whole dollars. |
| `archiveProject(id)` / `restoreProject(id)` | Archives a project (decision 0002): it leaves the lists; the grant shares to it stay in history and stop counting toward a grant's "not yet given". Same row. |
| `updateSettings(patch)` | Patches the settings: the fiscal year, the module switches. |
| `setModuleEnabled(id, on)` | Turns a module on or off. Its data stays. |
| `archiveStaff(id)` / `restoreStaff(id)` | Archives a person (they cannot sign in and leave the staff list and pickers; their work still names them) or restores them. Same rule as editing them (`mayChangeStaff`); nobody archives themself ("You can't archive yourself. Ask someone else who manages staff."). |
| `archiveOrganization(id)` / `restoreOrganization(id)` | Archives a partner or restores it. Its venues are not touched. Needs Partners: Edit. |
| `archiveVenue(id)` / `restoreVenue(id)` | Archives a venue or restores it. Classes that met there keep it. Needs Partners: Edit. |
| `resetDemo()` | Reseeds every slice, one apply per slice. Demo only: with the demo off it changes nothing and says so. |
| `setDemoToday(iso)` | Moves the demo date, or `undefined` for the clock. A browser preference, not data. Demo only. |
| `importJson(text)` | Replaces every slice from an exported file, one apply per slice. Throws on an unreadable file. |
| `exportJson()` | The whole portal as pretty JSON. |

See `src/modules/README.md` for how to add a module.

## Auth exports

`AuthUser` (`{ username, staffId }`), `Credential`, `SESSION_KEY`, `USERS`,
`hashCredential(username, password)`, `verify(username, password, users?)`,
`staffFor(user, staff)`, `staffRefusal(user, staff)` (`'no-staff'`, `'archived'` or null),
`checkSignIn(username, password, staff, users?)` (resolves to `{ ok: true, user, member }` or
`{ ok: false, reason: 'mismatch' | 'no-staff' | 'archived' }`, and writes no session),
`currentUser(users?)`, `startSession(user)`, `endSession()`. A saved session whose person is
archived is turned away the same way, and so is the signed-in person if an import archives them
(`StoreProvider`'s `onUnknownUser` gets the reason).

**Loading an older save.** `coreSlice.normalise` moves a saved person's old free-text `role`
(their job title) to `title`, gives them the role of the seeded person with the same id (else
Teacher if they teach, else Read-only), and adds any person a login belongs to that the save
lacks, so every login still resolves; with the demo on it adds back every seeded person, and the
seeded partners and venues to a save from before places existed. A program keeps its id
whatever it is (seeded or generated), gets its name as its short name when it has none, and has
its archive fields checked. A person who is there but
archived stays archived: only a missing record is added back. Archive fields that are not strings
are dropped (`normaliseArchived`). It drops a `demoToday` an older
save carries in its settings. A save from before budgets and projects loads with none, demo or not
(decision 0006), and a budget row it cannot read is dropped.
