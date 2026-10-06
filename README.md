# Jazz Angels Portal — proof of concept

One staff portal for the Jazz Angels office, built as a platform: a shared core (people, programs,
the fiscal year) and one module per workflow. Three modules are in: **Grants**, **Teaching** and
**Timesheets**. They share the same nouns, so a grant report can quote the roll call and the hours
the office has already recorded, and nobody retypes a number.

**Design:** [Design canvas for this iteration](https://claude.ai/artifact/2dBXGnNtFYmKhinLZBqox5).
Its artboards live in `design/portal/`; the original grants canvas is in `design/`. Mockups only,
the app is the source of truth once built.

```bash
npm install
npm run dev      # http://localhost:5181 (PORT=5190 npm run dev for another port)
npm test         # core and domain-layer tests
npm run build    # typecheck + production build (what Netlify runs)
```

## What it does

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Composed from every enabled module: their stats, one merged Attention list, and their panels. Core writes the date and fiscal year; each module adds its own words to the subtitle. |
| **Grants** · All grants | Every grant in one table, filtered by phase, owner and program. **Add grant** is a 3-step onboarding: funder and program, amounts and dates, the checklist it will follow. |
| **Grants** · Grant detail | The phase stepper (Prospect to Closed), the checklist and the document register. After award it becomes a record of the money: **Award** (amount, period, payment schedule, the terms with the award-letter page each came from), **Budget** (lines mapped to QuickBooks accounts and a class), **Expenses** (with the receipts and backup behind each), **Reports** with **Program numbers** from Teaching and Timesheets, and the files stored with the grant. Phase changes are recorded with the date. |
| **Grants** · Deadlines | Every date across every grant as a list by month or a calendar. Filtered to reports it shows what is owed to funders and who gets reminded; each report has its own reminder schedule, recipients and email preview. |
| **Money** · Transactions | What QuickBooks sent, waiting for a grant and a budget line. Accept a suggestion, choose a line, set it aside as not grant-funded, or split one transaction across grants and keep the split as a rule. |
| **Money** · Budget vs. actual | Every grant and budget line, budgeted against spent, with a tick where an even pace would be today. Warns before a line runs out. Exports to a spreadsheet and to print. |
| **Money** · Spend-down | Whether each grant will be spent by its end date at today's rate: the chart, the figures, and what to do about it. |
| **Grants** · Funders | The funder directory and each funder's grant history. |
| **Grants** · Playbook | The checklist templates. Each step has a timing rule such as "21 days before application due", so due dates are computed when a grant is added. |
| **Teaching** · Schedule | The week grid of classes and the term view. A block opens that meeting's roll call. |
| **Teaching** · Roll call | The roster with Present / Late / Absent, rehearsal notes, and the ensemble's attendance trend. Submitting closes it; it reopens for edits. |
| **Teaching** · Students | The roster by program plus the waitlist, with each student's contact, ensemble and attendance. |
| **Timesheets** | Teaching-artist hours by week, with approvals, **Log hours**, and hours by program for the month. |
| **Settings** | Staff (and who teaches), programs, fiscal year, which modules are on, the QuickBooks connection, the default report reminders, export / import / reset. |

QuickBooks is mocked: the demo data stands in for the feed, **Sync now** brings in the transactions
that are waiting, and nothing is ever written back. Files are described in the store; the bytes of a
file added in a session are held in memory until the page reloads. Reminder emails are previewed,
not sent.

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
- **Domain layers** (`src/modules/*/domain/`) are pure and tested: grants has phases and allowed
  transitions, checklist templates with date offsets, deadlines and money; teaching has the term,
  the schedule and attendance; timesheets has weeks, months and hours by program. A module reads
  another only through its `index.ts`.
- **Design system** (`src/design-system/`) is the Jazz Angels staff-portal system: 27 components,
  brand tokens, and `docs/design-system.md`.
- `docs/PLATFORM.md` is the platform spec; `docs/SPEC.md` is the grants product spec.
- `src/core/README.md` and `src/modules/README.md` say how to add a module: one folder, one line.

## Signing in

The portal asks for a username and password before it shows anything else. There are two
accounts, `barry` and `intern`; the passwords are not in this repo — the project owner holds
them. This is POC-grade protection: the check runs client-side and keeps casual visitors out of a
published demo, not real security. A real login needs a backend.

**Changing a password.** Compute the new hash and paste it into the matching entry of `USERS` in
`src/core/auth.ts`:

```bash
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('USERNAME:NEWPASSWORD').digest('hex'))"
```

## Demo data

The seed is written around **Sunday, September 13, 2026**, the first day of the Fall session: ten
grants across the phases with one application overdue, eight ensembles and 45 students with last
spring's attendance behind them, and five weeks of timesheets with two entries awaiting approval.
People, funders and students are invented. Use **Settings → Reset demo data** to start over.

## Deploying

`netlify.toml` builds with `npm run build` and serves `dist/` with an SPA redirect. Any static
host works.
