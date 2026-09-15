# Jazz Angels Portal — proof of concept

One staff portal for the Jazz Angels office, built as a platform: a shared core (people, programs,
the fiscal year) and one module per workflow. **Grants** is the first; Teaching and Timesheets
follow.

One place for every grant Jazz Angels applies for: where it is in its life, what is due when, and,
once awarded, where the money went. The process that today lives in one person's head becomes
checklist templates (the **Playbook**) that anyone in the office can follow.

```bash
npm install
npm run dev      # http://localhost:5181
npm test         # core and domain-layer tests
npm run build    # typecheck + production build (what Netlify runs)
```

## What it does

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Composed from every enabled module: their stats, one merged Attention list, and their panels (for grants, the pipeline by phase). |
| **Grants** | Every grant in one table, filtered by phase, owner and program. **Add grant** is a 3-step onboarding: funder and program → amounts and dates → the checklist it will follow. |
| **Grant detail** | The phase stepper (Prospect → LOI → Applying → Submitted → Awarded → Active → Reporting → Closed), the checklist, the document register, and after award: payments from the funder, budget lines with spend, expenses and reports. Phase changes are recorded with the date. |
| **Deadlines** | Every date across every grant as a list by month or a calendar. |
| **Funders** | The funder directory and each funder's grant history. |
| **Playbook** | The checklist templates. Each step has a timing rule such as "21 days before application due", so due dates are computed when a grant is added. |
| **Settings** | Staff (and who teaches), programs, fiscal year, which modules are on, export / import / reset. |

## How it is built

- React 18 + TypeScript + Vite, react-router 6, date-fns. No backend for the POC.
- **Core** (`src/core/`) owns the shared nouns — staff, programs, the fiscal year, the settings —
  plus the store and the formatting helpers. `useStore()` gives every screen
  `{ state, today, actions }`, namespaced by module: `state.grants.grants`,
  `actions.core.updateSettings`.
- **Modules** (`src/modules/`) are one folder per workflow. Each hands the platform a slice of
  state and a manifest (nav, routes, dashboard contribution); `src/modules/index.ts` lists them, and
  the rail, the router and the dashboard are built from that list. Settings can turn one off.
- **Data** lives in the browser's localStorage behind `src/core/repository.ts`, one key per module
  (`ja-portal:grants:v1`). Only the slice that changed is written; export and import use one
  envelope. Swapping in Supabase later means replacing that one file.
- **Domain layers** (`src/modules/*/domain/`) are pure and tested: for grants, phases and allowed
  transitions, checklist templates with date offsets, derived deadlines and money, fiscal-year
  totals, seed data.
- **Design system** (`src/design-system/`) is the Jazz Angels staff-portal system: 27 components,
  brand tokens, and `docs/design-system.md`. The mockups this app was built from are in `design/`.
- `docs/PLATFORM.md` is the platform spec; `docs/SPEC.md` is the grants product spec.
- `src/core/README.md` and `src/modules/README.md` say how to add a module: one folder, one line.

## Demo data

The seed is written around **September 13, 2026** with ten grants across the phases, two of them
awarded with budgets and expenses, one application overdue. Funder contact names and emails are
invented. Use **Settings → Reset demo data** to start over.

## Deploying

`netlify.toml` builds with `npm run build` and serves `dist/` with an SPA redirect. Any static
host works.
