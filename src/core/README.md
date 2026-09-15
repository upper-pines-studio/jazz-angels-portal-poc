# `src/core` — the shared nouns and the store

Core owns the people, the programs, the fiscal year, the module switches, the
store and the formatting helpers. It owns nothing workflow-specific and it
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
- `today: string` — today as `YYYY-MM-DD`. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `actions: PortalActions` — one namespace per slice. Every change is persisted.

**Routing.** An action's type is `<sliceId>/<name>`, so `grants/toggle-task`
only ever reaches the grants reducer. A slice that was not addressed keeps its
identity, so nothing else re-renders. `portal/replace` swaps every slice at once
(reset and import).

**Persistence.** One localStorage key per slice, `ja-portal:<sliceId>:v1`, and
only the slice that changed is written. Export and import use one envelope,
`{ version, savedAt, slices }`; a file written before a module existed imports
fine, because any slice it does not carry is seeded instead.

---

## The files

| File | What is in it |
| --- | --- |
| `types.ts` | `StaffMember`, `Program`, `AppSettings`, `CoreState`, and the augmentable `PortalState` / `PortalActions`. |
| `module.ts` | `ModuleSlice`, `ModuleManifest`, `NavItem`, `StatSpec`, `AttentionItem`, `DashboardContribution` (whose optional `subtitle(state, today)` is joined onto the dashboard's own "Sunday, September 13 · FY27" with ` · `). |
| `store.tsx` | `StoreProvider`, `useStore`, `coreSlice`, `newId`. |
| `repository.ts` | localStorage, one key per slice; export / import / reset. |
| `format.ts` | `money`, `dateShort`, `dateLong`, `dateRange`, `relativeDays`, `daysUntil`, `initials`. |
| `seed.ts` | The five staff, the six programs, the settings. |
| `derive.ts` | `fiscalYear`, `staffById`, `programById`, `programName`. |

**Conventions.** Money is whole dollars as an integer. Dates are ISO
`YYYY-MM-DD` strings. Format only at render time.

## Core actions

| Action | What it does |
| --- | --- |
| `addStaff(input)` | Adds a person. Returns the new id. |
| `updateStaff(id, patch)` | Patches a person, `teaches` included. |
| `updateSettings(patch)` | Patches the settings. |
| `setModuleEnabled(id, on)` | Turns a module on or off. Its data stays. |
| `resetDemo()` | Reseeds every slice. |
| `importJson(text)` | Replaces every slice from an exported file. Throws on an unreadable file. |
| `exportJson()` | The whole portal as pretty JSON. |

See `src/modules/README.md` for how to add a module.
