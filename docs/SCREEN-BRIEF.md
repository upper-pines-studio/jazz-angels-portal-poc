# Screen-building brief (for implementation agents)

You are implementing screens of the Jazz Angels Grants POC: React 18 + TypeScript + Vite + react-router 6.
Working directory: /Users/nhuttran/Projects/jazz-angels/ja-portal-poc

## Read first, in this order
1. `CLAUDE.md` — conventions.
2. `docs/SPEC.md` — the product. Your screens' sections are named in your task.
3. `src/domain/README.md` — the data API. Import ONLY from `'../../domain'`. Do not edit `src/domain/`; if you need something it lacks, work around it in your screen and report it.
4. `src/app/Shell.tsx` (`usePageHeader`), `src/app/ToastHost.tsx` (`useToast`), `src/app/components/badges.tsx` (PhaseBadge, DeadlineStatusBadge, DeadlineKindBadge, deadlineKindColor, OwnerAvatar, Eyebrow, KV).
5. The design mockups for your screens: `design/<Name>.dc.html` — these are the visual spec (structure, spacing, copy). Reproduce them with the design-system components, not by copying their CSS.
6. `src/design-system/index.d.ts` and the `.d.ts` next to each component you use — props are typed; `docs/design-system.md` VISUAL FOUNDATIONS for rules.

## Rules
- Use the design-system components (`Card, DataTable, Badge, Button, Icon, Tabs, Input, Select, Textarea, Field, Checkbox, Switch, ProgressBar, StatCard, Dialog, EmptyState, Avatar, Tooltip, IconButton, Tag`). Style layout glue with inline `style={{}}` using tokens (`var(--space-4)`, `var(--blue-500)`, `var(--type-body-sm)`). No new colours, no CSS files, no utility classes, no new npm packages.
- Every screen: `export default function X()`, calls `usePageHeader({ title, subtitle, crumbs?, actions? })` once. Navigation via `useNavigate()` / `useParams()` from react-router-dom.
- Money via `money()`, dates via `dateShort/dateLong/dateRange`, never `toLocaleDateString`.
- `DataTable` rows need an `id`; pass `onRowClick` for navigation. Column `render` gets the row.
- `Input`/`Select`/`Textarea` are controlled with `value` + `onChange(e)`; `Checkbox`/`Switch` use `onChange(next: boolean)`.
- Dialogs: `<Dialog open onClose title description footer>`; the design-system Dialog is absolutely positioned inside `main` (already `position:relative`).
- Icons: `<Icon name="plus" size={15}/>` (Lucide names). Do not add emoji.
- Copy: warm, plain, specific. Labels are nouns, buttons are verbs. Empty states say what will appear and how to make it appear.
- After changes, toast a confirmation with `useToast()` (e.g. `toast({ title: 'Grant added', message: 'Ralph M. Parsons Foundation · Jazz Legacy Program' })`).
- Keep each screen file under ~400 lines; split sub-components into `src/app/screens/<name>/` if needed.

## Verify before you finish
- `npx tsc --noEmit` must be clean for your files.
- Run the app on YOUR assigned port: `npx vite --port <port>` (background), open your routes in the browser (Playwright MCP tools are available), screenshot, compare against the design mockup, fix what differs, and check the console for errors. Kill your vite process when done. Do not use port 5181.
- Do not touch files outside the ones you were assigned (plus your own sub-folder). Do not run git.

Reply with: the files you wrote, what you verified in the browser, and anything the domain layer lacks.
