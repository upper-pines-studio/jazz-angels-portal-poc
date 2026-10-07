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
- `today: string` — today as `YYYY-MM-DD`: the demo date when the demo is on
  and this browser uses one, else the clock. Pass it to every derive function
  rather than calling `new Date()` in a screen.
- `demo: boolean`, `demoToday: string | undefined` — whether this is a demo
  build, and the demo date in use (Settings shows and moves it).
- `user: SignedInUser` — `{ id, name, role }` of whoever is signed in, read
  from their staff record, so a rename or a new role in Settings shows at once.
- `actions: PortalActions` — one namespace per slice. Every change is persisted.

**Who did it.** Every slice's `createActions(dispatch, getState, ctx)` gets a
`SliceContext`: `today`, `newId(prefix)` and `user`, the signed-in person. An
action that records who did something (an activity row, an approval, an
upload, a transaction's status) credits `ctx.user.id`, never a fixed person.
`StoreProvider` takes the signed-in staff id as `userId` (App passes the
login's `staffId`); if that id names nobody in the staff list it renders
nothing and calls `onUnknownUser`, and App signs the person out with the
refusal message.

**Routing.** An action's type is `<sliceId>/<name>`, so `grants/toggle-task`
only ever reaches the grants reducer. A slice that was not addressed keeps its
identity, so nothing else re-renders. `portal/replace` swaps every slice at once
(reset and import).

**Persistence.** One localStorage key per slice, `ja-portal:<sliceId>:v1`, and
only the slice that changed is written. Export and import use one envelope,
`{ version, savedAt, slices }`; a file written before a module existed imports
fine, because any slice it does not carry starts fresh instead.

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
| `types.ts` | `StaffMember` (`title` is the job title, `role` is one of the seven `Role`s of decision 0001), `SignedInUser`, `Program`, `Organization`, `Venue`, `Address`, `AppSettings` (the fiscal year and the module switches; the demo date is not in it), `CoreState`, and the augmentable `PortalState` / `PortalActions`. |
| `module.ts` | `ModuleSlice` (`seed(today)` the demo data, `empty()` a new office, `normalise(raw, demo)`, and its `rules`: what each action needs), `ModuleManifest` (its `nav` is one `NavSection` or several, its optional `settings` are gated Cards for the Settings screen), `ModuleRoute` (`requires`, `allows`), `Requires`, `NavItem`, `NavSection`, `StatSpec`, `AttentionItem`, `GatedCard`, `DashboardContribution` (whose optional `subtitle(state, today)` is joined onto the dashboard's own "Sunday, September 13 · FY27" with ` · `). |
| `store.tsx` | `StoreProvider` (its `onRefused` shows a refused action's reason), `useStore`, `useCan`, `coreSlice`, `guardActions` (wraps every slice's actions in its `rules`), `refusalMessage`, `newId`, `resolveToday`, `savedStaff()` (the staff list as saved, which sign-in reads before the store mounts). |
| `demo.ts` | `isDemo()` (the `VITE_DEMO` switch), `DEMO_TODAY_KEY` and the demo-date preference helpers. |
| `roles.ts` | `ROLES`, `ROLE_LABELS` (the words the screens use: Admin, Director, Office manager, Bookkeeper, Teacher, Office assistant, Read-only), `isRole`. |
| `permissions.ts` | Decision 0001's table as data (`PERMISSION_TABLE`, same rows and columns as the decision file), `can(role, subject, need, own)` the one check, `cell`, `isOwnOnly`, `meets` / `meetsAny`, `mayChangeStaff` (only an Admin makes or changes an Admin). |
| `repository.ts` | localStorage, one key per slice; export / import / reset, each given the demo mode (`fresh` picks `seed` or `empty`); `loadPreference` / `savePreference` for a per-browser setting such as the collapsed rail or the demo date. With `auth.ts`, the only file that may touch localStorage (lint-enforced). |
| `auth.ts` | Sign-in against SHA-256 credential hashes (no plaintext passwords in source); the session key. Exported as `auth`. |
| `format.ts` | `money`, `dateShort`, `dateLong`, `dateRange`, `relativeDays`, `daysUntil`, `initials`. |
| `seed.ts` | `makeCoreSeed()`: the ten staff (one per demo login, plus the teaching artists), the six programs, one district with two schools, the studio, the settings. `makeCoreEmpty()`: a new office, with the six programs pre-loaded, the seven staff records the logins need (`loginStaff()`), no partners or venues, the default settings. `STUDIO_VENUE_ID` and `PARAMOUNT_MS_VENUE_ID` are exported for module seeds. |
| `derive.ts` | `fiscalYear`, `staffById`, `programById`, `programName`, `organizationById`, `venueById`, `venueName`, `venuesForOrganization`, `placeLabel`, `addressLine`. |
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
| `addStaff(input)` | Adds a person: name, title, role, teaches. Returns the new id. |
| `updateStaff(id, patch)` | Patches a person, `role` and `teaches` included. |
| `addOrganization(input)` | Adds a partner: a district, a community centre. Returns the new id. |
| `updateOrganization(id, patch)` | Patches a partner. |
| `addVenue(input)` | Adds a place classes meet, optionally under an organization. Returns the new id. |
| `updateVenue(id, patch)` | Patches a venue. Ensembles point at it by id, so a rename shows everywhere. |
| `updateSettings(patch)` | Patches the settings: the fiscal year, the module switches. |
| `setModuleEnabled(id, on)` | Turns a module on or off. Its data stays. |
| `resetDemo()` | Reseeds every slice. Demo only: with the demo off it changes nothing and says so. |
| `setDemoToday(iso)` | Moves the demo date, or `undefined` for the clock. A browser preference, not data. Demo only. |
| `importJson(text)` | Replaces every slice from an exported file. Throws on an unreadable file. |
| `exportJson()` | The whole portal as pretty JSON. |

See `src/modules/README.md` for how to add a module.

## Auth exports

`AuthUser` (`{ username, staffId }`), `Credential`, `SESSION_KEY`, `USERS`,
`hashCredential(username, password)`, `verify(username, password, users?)`,
`staffFor(user, staff)`, `checkSignIn(username, password, staff, users?)` (resolves to
`{ ok: true, user, member }` or `{ ok: false, reason: 'mismatch' | 'no-staff' }`, and writes no
session), `currentUser(users?)`, `startSession(user)`, `endSession()`.

**Loading an older save.** `coreSlice.normalise` moves a saved person's old free-text `role`
(their job title) to `title`, gives them the role of the seeded person with the same id (else
Teacher if they teach, else Read-only), and adds any person a login belongs to that the save
lacks, so every login still resolves; with the demo on it adds back every seeded person, and the
seeded partners and venues to a save from before places existed. It drops a `demoToday` an older
save carries in its settings.
