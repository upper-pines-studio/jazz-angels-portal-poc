# Jazz Angels Portal — POC

Staff portal for Jazz Angels (youth jazz education nonprofit): a shared core plus one module per
office workflow (grants, teaching, timesheets). React 18 + TypeScript + Vite, react-router 6,
date-fns, vitest. No backend: state lives in localStorage behind `src/core/repository.ts`, one key
per module.

## Commands
- `npm run dev` — http://localhost:5181; set `PORT` to use another (`PORT=5190 npm run dev`, or `PORT=` in `.env.local`) so worktrees run side by side
- `npm run build` — typecheck + vite build (Netlify runs this)
- `npm test` — vitest (core and module domain layers only)
- `npm run test:e2e` — Playwright smoke tests in `e2e/`, headless; starts the dev server on `PORT` (`PORT=5207 npm run test:e2e`). Needs `npx playwright install chromium` once. The sign-in spec reads `DEMO_<ROLE>_USERNAME`/`DEMO_<ROLE>_PASSWORD` (from `.env.local`) and skips a role whose password is unset
- `npm run lint` — ESLint over `src/` (the module boundaries, localStorage only in core, no bare `new Date()` in screens), then `prettier --check`
- `npm run format` — Prettier over the TypeScript in `src/` and the root config files; run it before `npm run lint`
- Stop hook (`.claude/settings.json` → `.claude/hooks/check.sh`) — runs `npm run typecheck` and `npm run lint` when an agent stops; a failure is shown to the agent to fix before it finishes

## Where things are
- `docs/FEATURES.md` — the feature map: every feature, its route, its status, the files that own it, and the known gaps. Read it to find where to work. Update its row when you add, move or finish a feature.
- `docs/ROADMAP.md` — grant-management ideas that are not built or decided. When one is built, its row moves to `docs/FEATURES.md`.
- `docs/decisions/` — choices made with the client before the backend: roles, archiving, switch-over. Follow them; edit the file when one changes.
- `docs/PLATFORM.md` — the platform spec: architecture, the modules, the core screens. Read it before changing structure.
- `docs/SPEC.md` — the product spec for the grants module: phases, domain model, seed data, every screen.
- `docs/design-system.md` — brand rules. Read VISUAL FOUNDATIONS and CONTENT FUNDAMENTALS before adding UI.
- `src/design-system/` — the 27 shared components (JSX + `.d.ts`). Import from the barrel: `import { Card, Button } from '../design-system'`. Do not edit these; they are shared with the staff-portal POC.
- `src/core/` — the shared nouns (staff, programs, fiscal year, settings), the store, the repository, formatting. `src/core/README.md` documents the API.
- `src/modules/` — one folder per workflow: `grants/`, `teaching/`, `timesheets/`, plus `index.ts`, the registry. `src/modules/README.md` says how to add one.
- `src/app/` — App, Shell, the core screens (Dashboard, Partners with its detail pages, Settings), shared app components.
- `design/` — the design-canvas artboards (`*.dc.html`), `kit.css`, `canvas.json`. Mockups only; the app is the source of truth once built. `design/saas/` holds the seven money screens and `SAAS-BRIEF.md`, the facts the seed reproduces.

## Conventions
- Style with CSS custom properties from the tokens (`var(--space-4)`, `var(--blue-500)`) and the design-system components. No utility classes, no CSS-in-JS libraries, no new colours.
- Copy: warm, plain, specific. Labels are nouns, buttons are verbs, no emoji.
- Money is integer dollars; dates are ISO strings. Format only at render time with `src/core/format.ts`.
- A module's screens import from their own `domain/` and from `core`; a module reaches another module only through its `index.ts`. Core never imports from `modules/`, except that `app/` reads the registry.
- QuickBooks is read-only: people assign its transactions, nothing is written back. An assigned transaction's parts are the `Expense` rows carrying its `transactionId`.
- A page with a docked right-hand panel uses `WithPanel` and `SidePanel` from `src/app/components/SidePanel.tsx`.
- Dialog renders `position:absolute`; the scrolling `main` in Shell is `position:relative` so dialogs scope to it.
- Lucide icons come from the CDN tag in `index.html` via the `Icon` component; call `window.lucide.createIcons()` after renders that add icons (App does this in an effect).
