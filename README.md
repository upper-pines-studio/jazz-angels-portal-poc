# Jazz Angels Grants — proof of concept

One place for every grant Jazz Angels applies for: where it is in its life, what is due when, and,
once awarded, where the money went. The process that today lives in one person's head becomes
checklist templates (the **Playbook**) that anyone in the office can follow.

```bash
npm install
npm run dev      # http://localhost:5181
npm test         # domain-layer tests
npm run build    # typecheck + production build (what Netlify runs)
```

## What it does

| Screen | Purpose |
| --- | --- |
| **Dashboard** | What needs attention today: overdue and due-soon items, fiscal-year totals, the pipeline by phase, the next 30 days. |
| **Grants** | Every grant in one table, filtered by phase, owner and program. **Add grant** is a 3-step onboarding: funder and program → amounts and dates → the checklist it will follow. |
| **Grant detail** | The phase stepper (Prospect → LOI → Applying → Submitted → Awarded → Active → Reporting → Closed), the checklist, the document register, and after award: payments from the funder, budget lines with spend, expenses and reports. Phase changes are recorded with the date. |
| **Deadlines** | Every date across every grant as a list by month or a calendar. |
| **Funders** | The funder directory and each funder's grant history. |
| **Playbook** | The checklist templates. Each step has a timing rule such as "21 days before application due", so due dates are computed when a grant is added. |
| **Settings** | Staff, fiscal year, export / import / reset. |

## How it is built

- React 18 + TypeScript + Vite, react-router 6, date-fns. No backend for the POC.
- **Data** lives in the browser's localStorage behind `src/domain/repository.ts`. Every screen goes
  through `useStore()`; swapping in Supabase later means replacing that one folder.
- **Domain layer** (`src/domain/`) is pure and tested: phases and allowed transitions, checklist
  templates with date offsets, derived deadlines and money, fiscal-year totals, seed data.
- **Design system** (`src/design-system/`) is the Jazz Angels staff-portal system: 27 components,
  brand tokens, and `docs/design-system.md`. The mockups this app was built from are in `design/`.
- `docs/SPEC.md` is the product spec.

## Demo data

The seed is written around **September 13, 2026** with ten grants across the phases, two of them
awarded with budgets and expenses, one application overdue. Funder contact names and emails are
invented. Use **Settings → Reset demo data** to start over.

## Deploying

`netlify.toml` builds with `npm run build` and serves `dist/` with an SPA redirect. Any static
host works.
