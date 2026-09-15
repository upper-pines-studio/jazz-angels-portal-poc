---
name: Jazz Angels Portal
description: Mid-century geometric, Blue Note record-sleeve design system for the Jazz Angels staff portal — flat colour, warm paper neutrals, restrained radii, gold rationed to attention.
colors:
  blue-50: "#eaf4fa"
  blue-200: "#95c7e2"
  blue-300: "#5aa6cf"
  blue-400: "#2483b8"
  blue-500: "#00649b"
  blue-600: "#005382"
  blue-700: "#004067"
  blue-800: "#002e4b"
  teal-50: "#eef4f4"
  teal-500: "#437f80"
  teal-600: "#376869"
  teal-700: "#2a5152"
  olive-50: "#f6f5e6"
  olive-500: "#9a9422"
  olive-700: "#635f16"
  gold-50: "#fdf6e6"
  gold-300: "#f4bf4f"
  gold-400: "#e2a92f"
  gold-500: "#c68f1c"
  gold-600: "#a17316"
  gold-700: "#7b5711"
  neutral-0: "#ffffff"
  neutral-25: "#fbfaf7"
  neutral-50: "#f5f3ee"
  neutral-100: "#ebe8e1"
  neutral-200: "#dcd8ce"
  neutral-300: "#c3beb2"
  neutral-400: "#9d9789"
  neutral-500: "#7b7568"
  neutral-600: "#5d5850"
  neutral-700: "#453f39"
  neutral-800: "#2e2a26"
  neutral-900: "#1b1815"
  danger-500: "#a83a2c"
  danger-600: "#8c2f23"
typography:
  display: {fontFamily: "Jost, Futura, 'Century Gothic', system-ui, sans-serif", fontSize: "52px", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em"}
  headline: {fontFamily: "Jost, Futura, 'Century Gothic', system-ui, sans-serif", fontSize: "41px", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.015em"}
  title: {fontFamily: "Jost, Futura, 'Century Gothic', system-ui, sans-serif", fontSize: "21px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.015em"}
  subtitle: {fontFamily: "Archivo, system-ui, -apple-system, 'Helvetica Neue', sans-serif", fontSize: "18px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.015em"}
  body: {fontFamily: "Archivo, system-ui, -apple-system, 'Helvetica Neue', sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.65, letterSpacing: "normal"}
  label: {fontFamily: "Archivo, system-ui, -apple-system, 'Helvetica Neue', sans-serif", fontSize: "14px", fontWeight: 500, lineHeight: 1.3, letterSpacing: "normal"}
  eyebrow: {fontFamily: "Jost, Futura, 'Century Gothic', system-ui, sans-serif", fontSize: "12px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "0.11em"}
  numeric: {fontFamily: "IBM Plex Mono, ui-monospace, 'SFMono-Regular', Menlo, monospace", fontSize: "14px", fontWeight: 500, lineHeight: 1.3, letterSpacing: "normal"}
rounded:
  none: "0"
  xs: "3px"
  sm: "5px"
  md: "8px"
  lg: "12px"
  xl: "18px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "32px"
  space-8: "40px"
  space-9: "48px"
  space-10: "64px"
  control-h-sm: "30px"
  control-h: "38px"
  control-h-lg: "46px"
  row-h: "48px"
  topbar-h: "60px"
  sidebar-w: "236px"
  sidebar-w-collapsed: "64px"
  gutter: "24px"
  container-max: "1200px"
components:
  button-primary: {backgroundColor: "{colors.blue-500}", textColor: "{colors.neutral-0}", rounded: "{rounded.sm}", height: "{spacing.control-h}", padding: "0 20px"}
  button-primary-hover: {backgroundColor: "{colors.blue-600}"}
  button-secondary: {backgroundColor: "{colors.neutral-0}", textColor: "{colors.blue-600}", rounded: "{rounded.sm}", height: "{spacing.control-h}", padding: "0 20px"}
  button-accent: {backgroundColor: "{colors.gold-300}", textColor: "{colors.neutral-900}"}
  button-ghost: {backgroundColor: "transparent", textColor: "{colors.blue-600}"}
  button-danger: {backgroundColor: "{colors.danger-500}", textColor: "{colors.neutral-0}"}
  card: {backgroundColor: "{colors.neutral-0}", rounded: "{rounded.md}", padding: "24px"}
  stat-card: {backgroundColor: "{colors.neutral-0}", rounded: "{rounded.md}", padding: "20px"}
  input: {backgroundColor: "{colors.neutral-0}", textColor: "{colors.neutral-900}", rounded: "{rounded.sm}", height: "{spacing.control-h}", padding: "0 12px"}
  badge-neutral: {backgroundColor: "{colors.neutral-100}", textColor: "{colors.neutral-700}", rounded: "{rounded.xs}", padding: "5px 8px"}
  dialog: {backgroundColor: "{colors.neutral-0}", rounded: "{rounded.lg}", width: "480px"}
  toast: {backgroundColor: "{colors.neutral-0}", rounded: "{rounded.md}", width: "280-400px"}
  sidebar: {backgroundColor: "{colors.blue-800}", textColor: "{colors.neutral-0}", width: "{spacing.sidebar-w}"}
  table-header: {backgroundColor: "{colors.neutral-50}", textColor: "{colors.neutral-500}"}
  table-row-hover: {backgroundColor: "{colors.blue-50}"}
  tabs-active: {textColor: "{colors.neutral-900}"}
---

# Design System: Jazz Angels Portal

## Overview

**Creative North Star: "Blue Note record sleeve, tidied up for the office."**

Jazz Angels teaches jazz to Long Beach middle- and high-schoolers through ensemble playing; the
portal is the small office's internal tool for running it — grants, class schedule, roll call,
timesheets. Every hue in the system was sampled pixel-for-pixel from the organisation's logo: blue
`#00649B`, teal `#437F80`, olive `#9A9422`, gold `#F4BF4F`. The visual direction built from that
palette is mid-century geometric — Jost for anything structural, flat colour fields instead of
photography, warm paper neutrals instead of cold grey, restrained radii instead of pill-everything.
Three words describe it: **steady, practical, musical.**

The system rejects generic SaaS admin chrome — gradient hero metrics, identical icon-card grids,
glassmorphism — and nonprofit "impact dashboard" clichés — donut charts, superlatives,
"unlock/empower/transform" language. Nobody using this portal is an operations professional, so
density lives only where people work (tables, rosters) and air lives where people read (dashboard,
detail pages).

**Key Characteristics:**
- Flat colour only — no gradients, no textures, no photography (labelled neutral-100 slots stand in)
- Warm-tinted everything: neutrals, shadows, focus rings — never blue-grey, never blue-black
- Gold is rationed hard: attention states and the "Awarded this FY" rule, nothing else
- A 3px brand-hued rule is the one repeated emphasis device
- Restrained radii (3–18px); pill shapes exist only for tags, switches, avatars, progress
- Numbers do the bragging — IBM Plex Mono for anything that lines up in a column

## Colors

Four hues, each a 50–900 ramp, plus a warm neutral scale from white to near-black. Hover states
step one ramp stop darker; press steps one more.

### Primary
- **Blue** (`{colors.blue-500}` `#00649b`): the lead colour — primary buttons, links, the portal
  rail (`{colors.blue-800}` `#002e4b`), table-row hover (`{colors.blue-50}`), focus rings.

### Secondary
- **Teal** (`{colors.teal-500}` `#437f80`): "good / complete" — success states and secondary
  accents; the `success-500` semantic alias resolves to this same hex.

### Tertiary
- **Olive** (`{colors.olive-500}` `#9a9422`): the tertiary field colour, used for flat colour-block
  backgrounds and one of the four avatar-initial tones.

### Neutral
- **Neutral-25** (`#fbfaf7`): `--surface-page`, the app background — paper-tinted, never pure white.
- **Neutral-0** (`#ffffff`): `--surface-card`, every card and control surface.
- **Neutral-50** (`#f5f3ee`): `--surface-sunken`, table headers and dialog footers.
- **Neutral-100 → 300**: borders, from `--border-subtle` (100) through `--border-default` (200) to
  `--border-strong` (300).
- **Neutral-400 → 700**: text, from `--text-faint` (400) through `--text-muted` (500) to
  `--text-body` (700).
- **Neutral-900** (`#1b1815`): `--text-strong`, headings and primary text.

### Accent
- **Gold** (`{colors.gold-300}` `#f4bf4f`): rationed hard — donate/enroll-class actions, the 3px
  rule under a `SectionHeading`, attention/warning states, eyebrow text on the dark blue rail.
  `danger-500` (`#a83a2c`) and `danger-600` (`#8c2f23`) sit outside the brand ramps, reserved
  solely for destructive actions and errors.

### Named Rules
**The Gold Rationing Rule.** Gold appears only on attention states and the "Awarded this FY" rule.
If everything is gold, nothing is.

**The Warm Neutral Rule.** Every grey carries a paper tint (`#fbfaf7` → `#1b1815`). Cold blue-grey
enterprise neutrals are never used.

**The One Voice Rule.** A Badge, a table row, a stat, a dialog look the same regardless of which
module (grants, teaching, timesheets) renders them.

## Typography

**Display Font:** Jost (Futura, Century Gothic, system-ui fallback) — a Google Fonts stand-in for
the Futura-class geometric sans of mid-century jazz record sleeves; a licensed real face would
replace `src/design-system/tokens/fonts.css`.
**Body Font:** Archivo (system-ui, -apple-system, Helvetica Neue fallback) — a neutral grotesque
legible at 13–14px in dense tables.
**Label/Mono Font:** IBM Plex Mono (ui-monospace, SFMono-Regular, Menlo fallback) — money, hours,
dates, IDs.

**Character:** Geometric and a little formal at display sizes (tight `-0.015em` tracking closes up
Jost's capitals), plain at body sizes.

### Hierarchy
- **Display** (700, 52px, 1.05): reserved for hero numbers; not yet used in the built screens.
- **Headline** (700, 41px, 1.2): `h1`, page-level headings.
- **Title** (600, 21px, 1.2): `h3`, section headings; the Dialog title uses its own 20px/1.25
  variant of the same role.
- **Subtitle** (600, 18px, 1.2, Archivo not Jost): `h4`, Card headers — the one heading level that
  drops to the body font.
- **Body** (400, 16px, 1.65): paragraph text, 65–75ch reads best. A 14px/1.5 `body-sm` variant is
  the default UI copy size for table cells, hints and card subtitles.
- **Label** (500, 14px, 1.3): form field labels and button copy (buttons additionally set Jost,
  `0.04em` tracking, and a tight 1 line-height).
- **Eyebrow** (600, 12px, 1.2, `0.11em` tracking, uppercase): section kickers, sidebar section
  headers — teal on light surfaces, gold on the dark blue rail.
- **Numeric** (500, 14px, 1.3, IBM Plex Mono): dollars, hours, IDs, table figures.

Raw scale: a 1.25 ratio off 16px, rounded to whole pixels — 11 · 12 · 13 · 14 · 16 · 18 · 21 · 26 ·
33 · 41 · 52 · 64.

### Named Rules
**The Numbers-Over-Adjectives Rule.** Counts, dollars, hours and dates render in mono type
(`numeric`) wherever they line up in a column. A number in the wrong font reads as broken.

## Elevation

Mostly flat: cards and controls sit on 1px warm borders, not shadow stacks. A small shadow
vocabulary is reserved for surfaces that lift off the page. Every shadow is warm-tinted
(`rgba(27,24,21,…)`); none are blue-black, none glow, none carry colour.

### Shadow Vocabulary
- **xs** (`0 1px 2px rgba(27,24,21,.06)`): resting buttons, hovering table rows.
- **sm** (`0 1px 3px rgba(27,24,21,.07), 0 1px 2px rgba(27,24,21,.04)`): cards and stat cards at
  rest.
- **md** (`0 4px 12px rgba(27,24,21,.08)`): tooltips.
- **lg** (`0 12px 28px rgba(27,24,21,.11)`): dialogs and toasts only — the deepest shadow, used
  sparingly so it still reads as "floating."
- **inset** (`inset 0 1px 2px rgba(27,24,21,.07)`): text inputs at rest, so fields read recessed.
- **ring-brand** (`0 0 0 1px {colors.blue-200}`): a hairline brand ring, distinct from focus.

Focus is its own token, not a shadow step: a 3px halo, `0 0 0 3px rgba(0,100,155,.28)`
(`--focus-ring`), applied via `:focus-visible` on every interactive element. It is never removed,
only ever added on top of whatever border/shadow already exists.

Two places use transparency/blur, and only two: the Dialog scrim (`rgba(27,24,21,.44)` with a 2px
backdrop blur) and the white-on-blue sidebar item states (`rgba(255,255,255,.06 / .12)` for
hover/active).

Motion is a steady swing, never a bounce or spring: durations 80ms (instant) / 140ms (fast, colour
and shadow transitions) / 200ms (base) / 320ms (slow, progress-bar fills). Easing is
`cubic-bezier(.2,0,.2,1)` for state changes, `cubic-bezier(.16,1,.3,1)` for entrances and progress
fills, `cubic-bezier(.5,0,1,1)` for exits. Press scales to `0.985` with one extra ramp step of
colour darkening — no vertical nudge, no shadow change.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; shadow only appears as a response to
elevation (card, dialog, toast, tooltip) or state (hover on a row or button), never as decoration.

## Components

### Buttons
- **Shape:** `{rounded.sm}` (5px) on every size.
- **Sizes:** sm (30px, 0 12px padding, 12px type) · md (38px, 0 20px padding, 14px type, default) ·
  lg (46px, 0 32px padding, 16px type).
- **Primary:** `{colors.blue-500}` background, white text, `shadow-xs` at rest, darkens to
  `{colors.blue-600}` on hover, `{colors.blue-700}` + `scale(0.985)` on press.
- **Secondary:** white background, `{colors.blue-600}` text, `border-default` border; hover fills
  `{colors.neutral-50}`, border steps to `border-strong`.
- **Accent:** `{colors.gold-300}` background, near-black text — donate/enroll-class actions only.
- **Ghost:** transparent, `{colors.blue-600}` text; hover fills `{colors.blue-50}`.
- **Danger:** `{colors.danger-500}` background, white text; hover steps to `danger-600`.
- **Link:** transparent, no fixed height, underlined `--text-link`, hover goes
  `--text-link-hover` and keeps the underline.
- **Disabled:** every variant drops to `opacity: .45` and `cursor: not-allowed` — the only place
  opacity signals anything.

### Chips / Tags
- **Tag:** white background, `border-default` 1px border, fully pill-shaped (`{rounded.pill}`),
  `4px 12px` padding, a 7px coloured dot ahead of the label.
- **Badge** (compact, non-removable): `{rounded.xs}` (3px, not pill), uppercase 11px semibold type,
  one of seven tone pairs (neutral/blue/teal/olive/gold/danger/solid) — a tinted 50-level
  background with matching 700-level text, `5px 8px` padding.

### Cards / Containers
- **Corner Style:** `{rounded.md}` (8px).
- **Background:** `{colors.neutral-0}` on the `neutral-25` page — white on warm paper, never
  grey-on-grey.
- **Shadow Strategy:** `shadow-sm` at rest (see Elevation); an optional 3px accent rule
  (`--rule-accent-width`, always a brand hue) can run across the top.
- **Border:** 1px `border-subtle`, plus a 1px rule under the header when a title/action row exists.
- **Internal Padding:** `{space-6}` (24px) default; StatCard uses `{space-5}` (20px).
- Never nest a shadowed card inside another — header rows separate by a 1px rule, not colour.

### Inputs / Fields
- **Style:** white background (`neutral-50` disabled), `border-default` stroke, `{rounded.sm}`
  (5px), `shadow-inset` at rest, 38px tall, `0 12px` padding.
- **Focus:** border shifts to `{colors.blue-400}` (`--border-focus`); the inset shadow is replaced
  entirely by the 3px `--focus-ring` halo.
- **Error / Disabled:** invalid swaps the border to `{colors.danger-500}`; disabled drops the
  background to `neutral-50`.

### Navigation
- **Sidebar:** fixed 236px rail (64px collapsed), `{colors.blue-800}` background, white text.
  Section labels use the `eyebrow` role in `--text-on-dark-muted`. Items are 38px tall,
  `{rounded.sm}`, transparent at rest, `rgba(255,255,255,.06)` hover, `rgba(255,255,255,.12)` +
  semibold white active; item counts render gold-300 in mono type.
- **Top bar:** 60px, white background, 1px `border-default` bottom rule, `title`-role heading
  (tightened to 21px/1.2) plus an optional muted subtitle.
- **Tabs:** flush-bottom underline — active tab gets a 2px `{colors.blue-500}` bottom border and
  semibold `text-strong` label; inactive tabs are regular-weight `text-muted`.

### Signature Component: SectionHeading
Encodes the brand's most repeated mark: an eyebrow label over a display heading, underscored by a
56×3px gold rule (`{colors.gold-300}`). It is the one place gold is expected on any screen that
uses it, and nowhere else on that screen.

## Do's and Don'ts

### Do:
- **Do** ration gold to attention states and the "Awarded this FY" rule — if everything is gold,
  nothing is.
- **Do** use the 3px brand-hued rule (`--rule-accent-width`) as the emphasis device — top of a
  Card, left of a StatCard or Toast — always a brand hue, never grey.
- **Do** keep every neutral warm-tinted, from `{colors.neutral-25}` (#fbfaf7) page background to
  `{colors.neutral-900}` (#1b1815) strong text.
- **Do** reserve pill radius (`{rounded.pill}`, 999px) for tags, switches, avatars and progress
  tracks only.
- **Do** keep a visible 3px focus ring (`--focus-ring`, `0 0 0 3px rgba(0,100,155,.28)`) on every
  focusable control; never remove it or replace it with `outline: none` alone.
- **Do** set numbers — dollars, hours, dates, IDs — in mono type (`numeric` role).
- **Do** write labels as nouns and buttons as verbs; empty states say what will appear and how to
  make it appear.

### Don't:
- **Don't** use gradients anywhere. Backgrounds are flat colour, full stop.
- **Don't** use emoji, anywhere, in headings or body copy.
- **Don't** nest a shadowed card inside another shadowed card.
- **Don't** use pill shapes outside tags, switches, avatars and progress tracks — this brand is not
  pill-shaped, and nothing here should feel bouncy or spring-loaded.
- **Don't** reach for cold blue-grey enterprise neutrals. Every grey in this system is paper-warm.
- **Don't** build generic SaaS admin chrome: gradient hero metrics, identical icon-card grids,
  glassmorphism.
- **Don't** build nonprofit "impact dashboard" clichés: donut charts, superlatives, "unlock /
  empower / transform" language, exclamation stacking, or "it's not just X, it's Y" constructions.
- **Don't** use opacity to signal anything but a disabled control (0.45) — hover and press use
  colour steps and `scale(0.985)`, never fade.
- **Don't** use em dashes in copy.
- **Don't** recolour the Jazz Angels wordmark or place it on a coloured field — set it on a white
  plate with a 5px radius on any dark or coloured surface.

The layout bends at three breakpoints (max-width): **1100px** drops the four-across stat grid to
two columns (one at **480px**); **900px** turns the sidebar into an overlay drawer and stacks
two-column screens; **640px** goes single-column, with filters, tab strips and toast placement
adjusted for a one-handed phone at the bandstand.
