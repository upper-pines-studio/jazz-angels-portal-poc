# `src/core` — the shared nouns and the store

Core owns the people, the programs, the places (organizations and their
venues), the fiscal year, the module switches, the store and the formatting
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
- `today: string` — today as `YYYY-MM-DD`: `settings.demoToday` when the office
  has set a demo date in Settings, else the clock. Pass it to every derive
  function rather than calling `new Date()` in a screen.
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
| `types.ts` | `StaffMember`, `Program`, `Organization`, `Venue`, `Address`, `AppSettings`, `CoreState`, and the augmentable `PortalState` / `PortalActions`. |
| `module.ts` | `ModuleSlice`, `ModuleManifest`, `NavItem`, `StatSpec`, `AttentionItem`, `DashboardContribution` (whose optional `subtitle(state, today)` is joined onto the dashboard's own "Sunday, September 13 · FY27" with ` · `). |
| `store.tsx` | `StoreProvider`, `useStore`, `coreSlice`, `newId`. |
| `repository.ts` | localStorage, one key per slice; export / import / reset. |
| `auth.ts` | Sign-in against SHA-256 credential hashes (no plaintext passwords in source); the session key. Exported as `auth`. |
| `format.ts` | `money`, `dateShort`, `dateLong`, `dateRange`, `relativeDays`, `daysUntil`, `initials`. |
| `seed.ts` | The five staff, the six programs, one district with two schools, the studio, the settings. `STUDIO_VENUE_ID` and `PARAMOUNT_MS_VENUE_ID` are exported for module seeds. |
| `derive.ts` | `fiscalYear`, `staffById`, `programById`, `programName`, `organizationById`, `venueById`, `venueName`, `venuesForOrganization`, `placeLabel`, `addressLine`. |
| `auth.ts` | The sign-in check: SHA-256 of `username:password` via Web Crypto, checked against a small table of hashes, no plaintext in source. The session (who, and when) lives in localStorage under `ja-portal:session:v1`. |

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
| `addStaff(input)` | Adds a person. Returns the new id. |
| `updateStaff(id, patch)` | Patches a person, `teaches` included. |
| `addOrganization(input)` | Adds a partner: a district, a community centre. Returns the new id. |
| `updateOrganization(id, patch)` | Patches a partner. |
| `addVenue(input)` | Adds a place classes meet, optionally under an organization. Returns the new id. |
| `updateVenue(id, patch)` | Patches a venue. Ensembles point at it by id, so a rename shows everywhere. |
| `updateSettings(patch)` | Patches the settings. |
| `setModuleEnabled(id, on)` | Turns a module on or off. Its data stays. |
| `resetDemo()` | Reseeds every slice. |
| `importJson(text)` | Replaces every slice from an exported file. Throws on an unreadable file. |
| `exportJson()` | The whole portal as pretty JSON. |

See `src/modules/README.md` for how to add a module.

## Auth exports

`AuthUser`, `Credential`, `SESSION_KEY`, `USERS`, `hashCredential(username, password)`,
`verify(username, password, users?)`, `currentUser(users?)`, `startSession(user)`,
`endSession()`.
