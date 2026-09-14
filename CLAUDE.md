# Jazz Angels Grants — POC

Grant-management tool for Jazz Angels (youth jazz education nonprofit). React 18 + TypeScript + Vite,
react-router 6, date-fns, vitest. No backend: state lives in localStorage behind `src/domain/repository.ts`.

## Commands
- `npm run dev` — http://localhost:5181
- `npm run build` — typecheck + vite build (Netlify runs this)
- `npm test` — vitest (domain layer only)

## Where things are
- `docs/SPEC.md` — the product spec: phases, domain model, seed data, every screen. Read it before changing behaviour.
- `docs/design-system.md` — brand rules. Read VISUAL FOUNDATIONS and CONTENT FUNDAMENTALS before adding UI.
- `src/design-system/` — the 27 shared components (JSX + `.d.ts`). Import from the barrel: `import { Card, Button } from '../design-system'`. Do not edit these; they are shared with the staff-portal POC.
- `src/domain/` — types, phases, templates, derived data, seed, repository, store. `src/domain/README.md` documents the API.
- `src/app/` — Shell, routes, screens.
- `design/` — the design-canvas artboards (`*.dc.html`), `kit.css`, `canvas.json`. Mockups only; the app is the source of truth once built.

## Conventions
- Style with CSS custom properties from the tokens (`var(--space-4)`, `var(--blue-500)`) and the design-system components. No utility classes, no CSS-in-JS libraries, no new colours.
- Copy: warm, plain, specific. Labels are nouns, buttons are verbs, no emoji.
- Money is integer dollars; dates are ISO strings. Format only at render time with `src/domain/format.ts`.
- Dialog renders `position:absolute`; the scrolling `main` in Shell is `position:relative` so dialogs scope to it.
- Lucide icons come from the CDN tag in `index.html` via the `Icon` component; call `window.lucide.createIcons()` after renders that add icons (App does this in an effect).
