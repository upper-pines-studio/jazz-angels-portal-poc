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
  seed: () => makeSeed(),
  reducer(state, action) { /* only `teaching/*` reaches here */ },
  createActions(dispatch, getState, { today, newId }) { /* … */ },
  normalise(raw) { /* validate a loaded payload, or return undefined */ },
};
```

**2. The manifest.** In `manifest.tsx`, name the module, its rail section, its
routes and what it puts on the dashboard:

```tsx
export const manifest: ModuleManifest = {
  id: 'teaching',
  label: 'Teaching',
  description: 'The class schedule, roll call and the student roster.',
  nav: { section: 'Teaching', items: [{ path: '/schedule', label: 'Schedule', icon: 'calendar' }] },
  routes: [{ path: '/schedule', element: <Schedule /> }],
  dashboard: { stats, attention, panels: [TodaysClasses] },
  slice: teachingSlice,
};
```

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

Rail sections with the same name merge, in registry order. **Office** is where
Timesheets and core's Settings meet, so Settings is always its last item.
