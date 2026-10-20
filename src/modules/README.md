# `src/modules` — one folder per workflow

A module is a workflow that hangs off the shared nouns in `src/core`: grants,
teaching, timesheets. Adding one is **one folder plus one line in the registry**.

```
src/modules/
  index.ts          MODULES: the registry, in rail order
  grants/
    index.ts        the public API: manifest + read-only derive functions
    manifest.tsx    nav, routes, dashboard contribution, slice
    domain/         types, derive, seed, slice (reducer + actions), __tests__
    screens/        the module's screens and their css
```

---

## Adding a module

**1. The slice.** In `domain/slice.ts`, write the reducer and the actions, and
hang both off the portal store from your own folder:

```ts
declare module '../../../core/types' {
  interface PortalState { teaching: TeachingState }
  interface PortalActions { teaching: TeachingActions }
}

export const teachingSlice: ModuleSlice<TeachingState, TeachingActions> = {
  id: 'teaching',
  seed: () => makeSeed(),   // the demo data: `npm run dev` and the tests
  empty: () => makeEmpty(), // a new office, demo off: empty collections, default settings
  reducer(state, action) { /* only `teaching/*` reaches here */ },
  createActions(dispatch, getState, { today, newId, user }) { /* credit `user.id` */ },
  // What each action needs: a row of decision 0001's table (edit on it), or a
  // rule of its own. TypeScript wants one per action; the store refuses the rest.
  rules: {
    addMeeting: 'schedule',
    setMark: (user, state, meetingId) => mayTakeRoll(state, user, meetingId),
  },
  // The state as the rows of its tables in docs/SCHEMA.md, and back (domain/tables.ts).
  tables: teachingTables,
  // Validate a loaded payload, or return undefined. Start with
  // sliceNullsAsMissing(raw, OPTIONAL): a null optional field loads as a
  // missing one, a null required one rejects the slice (decision 0008, 2A).
  normalise(raw) { /* ... */ },
  // The change in plain words, for "Couldn't save the roll call mark".
  describe(action) { /* 'the roll call mark', or undefined for "that change" */ },
};
```

The reducer handles generic changes only: `insert`, `update` and `remove` on a
collection, and `batch` for several as one change (closing a roll call is the
present marks and the closed meeting together). The rules that decide what
follows from an action (a submitted roll is closed, only a draft is submitted)
live in `createActions`, which reads the state first. Each change is one
`repository.apply`, so a backend writes rows from it without knowing the
module. Grants, teaching and timesheets all work this way.

**The tables.** In `domain/tables.ts`, say how the state maps onto the
module's tables in `docs/SCHEMA.md`: a `SliceTables` (`src/core/rows.ts`) with
`keys` (each table, parents first, with its primary key's columns),
`toRows(state)` and `fromRows(tables)`, columns named as SCHEMA.md names them.
A one-to-one shape becomes columns, a list a child table: grants writes
`Grant.dates` as columns on `grants` and `Grant.programs` as
`grant_programs`; teaching writes a student's guardian and photo release to
`student_private`; timesheets writes each step of an entry's history as an
`activity` row. Rows carry only stored columns, a missing field is `null`, and
a `null` read back is a missing field. Add a round-trip test of the demo seed
and of `empty()` beside the others, and a new table or column to SCHEMA.md
first: `src/app/__tests__/tables.test.ts` fails on a table or column the
document does not draw, and on a drawn table no slice writes.

**2. The manifest.** In `manifest.tsx`, name the module, its rail section, its
routes and what it puts on the dashboard:

```tsx
export const manifest: ModuleManifest = {
  id: 'teaching',
  label: 'Teaching',
  description: 'The class schedule, roll call and the student roster.',
  nav: { section: 'Teaching', items: [{ path: '/schedule', label: 'Schedule', icon: 'calendar' }] },
  routes: [{ path: '/schedule', element: <Schedule />, requires: { subject: 'schedule' } }],
  dashboard: { stats, subtitle, attention, panels: [{ component: TodaysClasses }] },
  slice: teachingSlice,
};
```

`nav` may also be an array of sections when a module needs more than one: grants
puts its screens under **Grants** and its money screens under **Money**.
`settings` is an optional list of `{ component, requires }`, each a Card the
Settings screen renders after its Modules card while the module is on.
`funding` is optional too: `{ sources(state, target), panel?, requires? }`
says what the module puts toward a program's fiscal year or a project
(`FundingTarget`, decision 0006), so the Programs page can add it up and show
it without reaching into the module. Grants answers with each grant's share,
and its `panel`, "Paid for by", is drawn on the sheet with the target it is for.
The sheet colours its bar by the order of the sources, module by module, so a
panel colours its rows in its own sources' order to match (`fundingColour` in
`app/components/funding.tsx`).

**Who sees what.** A route, a rail item, a stat, an attention row, a panel and a
Settings card can each name what it `requires`: a row of the permission table
(`{ subject: 'award' }`, or `need: 'edit'`), or a list of which any one will do.
A rail item, a stat or a row without one takes its route's. A route that opens
one record an "Own" cell limits adds `allows(user, state, params)`. Screens ask
`useCan()` and leave out (not disable) what the role may not do. See
`src/core/permissions.ts` and decision 0001.

**Rail badges.** A rail item's `badge(state, today, user)` is given the
signed-in person and counts only what they can act on there, not everything
the screen shows: the entries they may approve (never their own hours), the
roll calls they may take (a teacher's own classes), the transactions they may
assign. The module decides it in its `domain/`, with `can` and its own-record
helpers (`mayApprove`, `mayTakeRoll`), so it has a test per role. A role that
may only look sees no badge; zero shows nothing.

**Attention rows.** `dashboard.attention(state, today, user)` is given the
signed-in person the same way, so a row can be theirs alone: Timesheets shows a
teacher their own hours sent back and nobody else (`sentBackAttention`). A row
everyone with the role sees ignores `user`, as grants' and teaching's do. Every
row still shows only to a role that meets its `requires` or may follow its `href`.

`dashboard.subtitle(state, today)` is the few words the module adds to the
dashboard's page subtitle, after core's date and fiscal year.

**3. The public API.** `index.ts` exports the manifest and nothing but pure,
read-only functions of `(state, …)` that other modules may call.

**4. The registry.** One line in `src/modules/index.ts`:

```ts
export const MODULES: ModuleManifest[] = [grants.manifest, teaching.manifest, timesheets.manifest];
```

That is the whole wiring. The rail, the routes, the dashboard and the Modules
card in Settings all read the registry.

---

## The rules

1. A module imports another module only through that module's `index.ts`, and
   only pure, read-only functions of `(state: PortalState, …)`. Never its
   screens, its reducer or its state type.
2. Core never imports from `modules/`. `src/modules/index.ts` is the only file
   that lists modules.
3. Screens import from their own module's `domain/` and from `core`.
   `useStore()` comes from core.
4. A module's styles live in its own folder and are imported by its screens.
5. Turning a module off in Settings hides its nav, its routes and its dashboard
   contributions. Its data stays.
6. Every action has a rule, and every screen hides what the rule would refuse.
   Permissions are by role, never by person.

The import side of rules 1 and 2 is lint-enforced: `npm run lint` fails when a
module imports another module's folder other than its `index.ts`, when core imports from
`modules/`, when the registry or `src/app/` reach past a module's `index.ts`,
when anything other than `core/repository.ts` and `core/auth.ts` mentions
`localStorage`, when a screen calls `new Date()` with no arguments, or when
anything imports `Dialog` from the design system. The rules live in
`eslint.config.js` at the repo root.

A dialog is an `AppDialog` (`src/app/components/AppDialog.tsx`), never the
design-system `Dialog` directly. It takes the same props, looks the same, and
adds what a keyboard or screen-reader user needs: focus moves in to the first
field (or first button; mark another control `data-autofocus` to start
there), Tab stays inside, Escape closes it, focus goes back to what opened it,
and the box is a named `role="dialog"`. Pass `busy` while a save is under way
to keep Escape, the × and the scrim from closing it.

Rail sections with the same name merge, in registry order. **Office** is where
Timesheets and core's Settings meet, so Settings is always its last item.
