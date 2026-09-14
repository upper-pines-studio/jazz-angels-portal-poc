# Jazz Angels Design System

> Imported into this repo from the Claude Design project **Jazz Angels Design System**
> (`a3889b9e-8cb1-4447-af94-ba3834ccdeff`) — https://claude.ai/design/p/a3889b9e-8cb1-4447-af94-ba3834ccdeff
> The brand guidance below is the design system's own documentation, carried over as-is.
> The INDEX section at the bottom has been rewritten to match this repo's layout.

Jazz Angels is a Long Beach, California non-profit (501(c)(3), EIN 84-1686341) founded in 2007 by
Barry Cogert and Albert Alva, both professional musicians and teachers. It teaches jazz to young
musicians through ensemble playing, with professional mentors on the bandstand alongside the kids.
The studio is at 3258 E. Willow St., Signal Hill, CA 90755.

Its stated mission, verbatim from the site:

> To use the transformative power of music to develop and enrich young people, while preserving the
> legacy of jazz and global heritage music.

## Products this system covers

1. **Public site** — jazzangels.org. A WordPress/Elementor marketing site: programs, our story,
   leadership, testimonials, media, calendar, donate, enroll. Rebuilt in the source project under
   `ui_kits/website/` — **not imported into this repo** (this repo is the portal POC).
2. **Staff portal** *(does not exist yet — new design work)* — the reason this system was
   commissioned. Internal tooling for grant tracking, class scheduling, teacher time tracking,
   class roll, and other office activities. **This is what this repo builds.**

Programs referenced throughout: Studio Semester Sessions (~70 musicians, 6–8 bands, eight Sundays
per session), Homeschool Programs (charter-approved, non-religious), In-School Programs (200+
middle schoolers in Paramount Unified), the Jazz Legacy Program, Advanced Jazz Workshop, and
Angel of the Month.

## Sources used

| Source | Access | What came from it |
| --- | --- | --- |
| https://jazzangels.org/ | Fetched (text only) | Mission, "Happening now" items, bulletin board, footer, nav |
| https://jazzangels.org/our-story/ | Fetched (text only) | Founding story, "Why Jazz Angels?" bullets, 501(c)(3) language |
| https://jazzangels.org/programs/ | Fetched (text only) | All four program descriptions verbatim |
| `Jazz-Angels-LOGO-300x108-1.png` | Uploaded by the user | **Every colour in this system** — sampled pixel-for-pixel |

**What could not be read.** The site's stylesheets, its images, and its Elementor global kit
settings are all blocked to automated fetching (CORS + hotlink protection), so no font stack,
type scale, spacing, radius or shadow value could be recovered from the live site. The live site
is also Elementor-default-styled rather than designed to a system. Everything below the colour
palette is therefore **new design work built out from the logo**, in the "same brand, tidier"
direction the user chose — not a recreation of jazzangels.org's CSS.

### Font substitution — needs your confirmation

No font files were obtainable. Google Fonts stand-ins were chosen for the "mid-century geometric,
Blue Note record-sleeve" direction the user picked:

- **Jost** — display/headings. A Futura-class geometric sans; the closest free match to the
  mid-century poster lettering the direction calls for.
- **Archivo** — body and UI text. A neutral grotesque that stays legible at 13–14px in dense tables.
- **IBM Plex Mono** — money, hours, dates, IDs.

Replace `src/design-system/tokens/fonts.css` if Jazz Angels licenses real faces.

---

# CONTENT FUNDAMENTALS

**Voice.** Warm, plain, and specific. The organisation talks about kids and instruments, not
"stakeholders" and "impact frameworks". Sentences are ordinary length and end in facts:
"Each session consists of eight Sunday afternoons/evenings and two live public performances."

**We, not I.** Institutional first-person plural throughout: "We arrange the sheet music so it is
challenging but not overwhelming", "We welcome participation from all local schools/districts who
are interested." Direct address to the reader ("you") appears in calls to action and homeschool
instructions.

**Numbers do the bragging.** Rather than adjectives, the site quantifies: 70 musicians a session,
6–8 bands, 200+ in-school students, eight Sundays, two public performances, since 2007. Carry this
into new copy — a number beats a superlative.

**Capitalisation.** Headline case for page titles and program names ("Program Overview", "Studio
Semester Sessions", "Jazz Legacy Program"). Sentence case for body copy, bullets, and buttons
longer than one word. Buttons are one or two words, initial cap: Donate, Enroll, Learn More,
Volunteer.

**Jazz vocabulary is used unapologetically** — charts, solos, transcribed, improvising, mentors,
combos, big band, jam. Do not soften it into "music activities".

**Named people matter.** Founders, mentors, and honorees are named (Barry Cogert, Albert Alva, the
Lance Valt Fund). Funders are always acknowledged in full.

**Legal/trust copy is repeated on every page**: the 501(c)(3) line, the EIN (84-1686341), the
GuideStar seal mention, the Signal Hill address and phone.

**Emoji.** The live site uses them heavily in headings. **This system drops them entirely** — a
deliberate decision by the user. New copy should not add emoji, in headings or in body text. Where
the live site used an emoji for emphasis, use the eyebrow label or a Badge instead.

**Things to avoid:** exclamation stacking, "unlock/empower/transform" grant-speak in
parent-facing copy, and AI-flavoured constructions ("it's not just X, it's Y").

**Portal copy is even plainer than site copy.** Labels are nouns ("Hours", "Ensemble", "Report
due"), buttons are verbs ("Take roll", "Log hours", "Submit roll call"), and empty states say what
will appear and how to make it appear: "Off-site teaching mileage appears here once a teacher
submits it."

---

# VISUAL FOUNDATIONS

**Colour.** Four hues, all sampled from the logo: blue `#00649B`, teal `#437F80`, olive
`#9A9422`, gold `#F4BF4F`. Blue leads — headers, primary buttons, the portal rail, links. Teal is
secondary and carries "good/complete". Olive is the tertiary field colour. Gold is the accent,
rationed hard: donate/enroll actions, the 56×3px rule under section headings, "attention" states,
and eyebrow text on dark blue. Each hue ships as a 50–900 ramp; hover states step one stop darker.

**Neutrals are warm.** `--neutral-25` (#FBFAF7) is the page; cards are pure white on it. Greys
carry a paper tint, never a blue one. Text runs `--text-strong` → `--text-body` → `--text-muted`
→ `--text-faint`.

**Type.** Jost (geometric display) for anything structural — headings, buttons, big numbers, the
sidebar brand — with `-0.015em` tracking so capitals close up. Archivo for body and UI at
1.5–1.65 leading. IBM Plex Mono for any figure that lines up in a column. Eyebrow labels are 12px,
600 weight, uppercase, `0.11em` tracking, usually teal on light or gold on dark. Scale is a 1.25
ratio off 16px, rounded to whole pixels: 11 · 12 · 13 · 14 · 16 · 18 · 21 · 26 · 33 · 41 · 52 · 64.

**Spacing.** 4px grid, `--space-1` through `--space-12` (4→112px). Public sections breathe at
`--section-y` 96px; portal panels sit on 24px gutters. Content maxes at 1200px. Portal chrome:
236px rail, 60px top bar, 48px table rows, 30/38/46px control heights.

**Backgrounds.** Flat colour, full stop. No gradients anywhere. No repeating patterns, no textures,
no grain. Public pages are built by alternating full-bleed flat fields — blue-800, blue-500, gold-300,
neutral-50, white — against each other, never two saturated tones adjacent. `ColorBlock` is the
component for this.

**Imagery.** Flat colour blocks stand in for photography by choice. Where a real photo belongs, the
system leaves a labelled `--neutral-100` slot rather than inventing an image. If Jazz Angels supplies
real performance photography later, treat it warm and unfiltered — no duotone, no heavy grading, no
black-and-white. Nothing in this system is AI-generated imagery, and no SVG illustration was drawn.

**Cards.** White surface, 1px `--border-subtle`, 8px radius, `--shadow-sm`. Optional 3px brand rule
across the top (`accent` prop). Never nest a shadowed card inside another. Header rows are
separated by a 1px rule, not by colour.

**Corner radii.** Restrained: 3px on chips and checkboxes, 5px on controls and buttons, 8px on cards,
12px on dialogs, 18px reserved, pill only for tags, switches, avatars and progress tracks. This brand
is not pill-shaped.

**Shadows.** Warm-tinted (rgba(27,24,21,…)), never blue-black. `xs` on hovering rows and buttons,
`sm` on cards, `md` on tooltips, `lg` on dialogs and toasts only, plus a 1px `inset` on text inputs
so fields read as recessed. There is no glow, no coloured shadow.

**Borders and rules.** 1px warm borders define every surface edge. A 3px rule is the emphasis device —
top of a Card, left of a StatCard or Toast, left of a schedule block — and it is always a brand hue,
never grey. The 56×3px gold rule under a `SectionHeading` is the single most repeated brand mark in
the system.

**Hover.** Buttons darken one ramp step (500 → 600). Secondary buttons fill to `--neutral-50` and
their border darkens. Ghost buttons fill `--blue-50`. Table rows fill `--blue-50`. Links go
`--blue-500` → `--blue-700` and gain an underline. Opacity is never used to signal hover — only
disabled state uses opacity (0.45).

**Press.** `transform: scale(0.985)` plus one more ramp step darker (600 → 700). No shadow change,
no vertical nudge.

**Focus.** A 3px `rgba(0,100,155,.28)` halo (`--focus-ring`), never a removed outline.

**Motion.** Steady swing, no bounce and no spring. Durations 80/140/200/320ms. `--ease-standard`
`cubic-bezier(.2,0,.2,1)` for state changes; `--ease-out` for entrances and progress fills;
`--ease-in` for exits. Colour and shadow transitions run at 140ms; a progress bar fills at 320ms.
Nothing loops, nothing pulses, nothing parallaxes.

**Transparency and blur.** Almost never. Two exceptions: the dialog scrim (`rgba(27,24,21,.44)` with a
2px backdrop blur) and the white-on-blue sidebar item states (`rgba(255,255,255,.06/.12)`). No frosted
panels, no translucent headers — the sticky site header is opaque white with a 1px border.

**Layout rules.** The public header is sticky and opaque. The portal rail and top bar are fixed; only
`main` scrolls. Toasts are fixed bottom-right. Dialogs are absolutely positioned and centred so they
can be framed inside a mock. Enrollment/aside columns are `position: sticky; top: 96px`.

**The logo has one hard constraint.** The wordmark contains all four brand colours, so it only reads
on white or paper. On blue, teal, olive, gold or any photo, set it on a white plate with a 5px radius —
the sidebar and footer both do this automatically. Never recolour it, never place it on a coloured field
directly.

---

# ICONOGRAPHY

**The brand ships no icon set.** jazzangels.org runs Elementor with `e_font_icon_svg` enabled — it
renders Font Awesome glyphs as inline SVG. Those files could not be extracted, and Font Awesome's
set is not a brand asset in any meaningful sense.

**Substitution (flagged):** this system uses **Lucide** from CDN, at 2px stroke with round caps and
joins — the closest free match to the clean geometric line style the type direction implies.

In this repo the CDN tag lives in `index.html`:

```html
<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.min.js"></script>
```

Use the `Icon` component (`src/design-system/components/core/Icon.jsx`), an **intentional addition**
so consumers do not hand-roll SVG. Sizes: 16px inline in table cells and buttons, 18px default in nav
and toolbars, 22px in empty states, 28px as a feature mark on a colour field. Icons take
`currentColor`; they are never multicolour and never filled.

Icons in active use: `layout-dashboard, calendar-days, clipboard-check, users, user-plus, landmark,
clock, plus, check, search, filter, download, printer, bell, settings, chevron-left, chevron-right,
music, music-2, music-4, folder-open, car, facebook, youtube, instagram, mail`.

**Emoji are not used as iconography** (nor anywhere else). Unicode characters appear in exactly two
places, both typographic rather than iconic: the `×` dismiss glyph and the `▾` select caret.

**Assets on hand:** `public/assets/jazz-angels-logo.png` (300×108, transparent) — the only real brand
asset obtainable. There is no SVG logo, no favicon file, no illustration library, and no photography.
**No mark was drawn or reconstructed** for anything missing.

---

# INDEX — as laid out in this repo

## `src/design-system/`
- `styles.css` — the single entry point, imported once by `src/main.jsx`. `@import` lines only.
- `index.js` — barrel export. Import components from here.

## `src/design-system/tokens/`
`fonts.css` (Google Fonts + family vars) · `colors.css` (four ramps, warm neutrals, semantic aliases)
· `typography.css` (scale, weights, tracking, composed roles) · `spacing.css` (4px grid, layout, chrome)
· `shape.css` (radii, borders, shadows, scrim) · `motion.css` (durations, easings) · `base.css`
(element defaults).

## `src/design-system/components/` — 27 components

- **core/** — `Button`, `IconButton`, `Badge`, `Tag`, `Card`, `Icon`
- **forms/** — `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`
- **data/** — `DataTable`, `StatCard`, `ProgressBar`, `Avatar`
- **navigation/** — `Sidebar`, `TopBar`, `Tabs`, `Breadcrumb`
- **feedback/** — `Dialog`, `Toast`, `EmptyState`, `Tooltip`
- **layout/** — `SectionHeading`, `ColorBlock`

Each has a sibling `.d.ts` carrying its props contract.

> The source project's readme heading says "22 primitives" while its own index lists 27. 27 is the
> real count and is what was imported.

### Intentional additions
- **`Icon`** — the brand defines no icon set; a wrapper keeps consumers off hand-rolled SVG.
- **`ColorBlock`** — the chosen imagery strategy is flat colour fields, so the "photo slot" needed a
  first-class component.
- **`SectionHeading`** — encodes the eyebrow + display heading + 56×3px gold rule pattern so it stays
  consistent.

Everything else is the standard primitive set. jazzangels.org is Elementor-built and defines no
component library, so there was no source inventory to mirror.

## `src/screens/` — the staff portal
`Shell` (app frame) · `Dashboard` · `Schedule` · `RollCall` · `Students` · `Grants` · `Timesheets`.
**New design work, not a recreation.** Every screen is composed only from the primitives above and
the tokens. Treat it as a proposal. Data is fabricated but plausible.

## Not imported
The source project also contains `ui_kits/website/` (public site: Home, Programs, header, footer),
21 `guidelines/` specimen cards, and a compiled `_ds_bundle.js`. None of it is needed to run the
portal POC. Pull it from the Claude Design project if the public site comes into scope.
