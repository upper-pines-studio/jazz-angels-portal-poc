# Artboard authoring brief (for design agents)

You are producing static desktop mockups (1440×900) of screens for the Jazz Angels Grants tool,
as `.dc.html` files in `design/`. They are mockups, not the app: plain HTML + CSS, no JavaScript,
no `{{holes}}`, no `data-props`.

## Read first
1. `docs/SPEC.md` — the product: phases, data, exactly what each screen contains, seed data to use.
2. `docs/design-system.md` — brand rules. Sections VISUAL FOUNDATIONS and CONTENT FUNDAMENTALS matter most.
3. `design/kit.css` — the classes you use. They reproduce the real design-system components. **Use them; do not restyle.**
4. `design/shell.snippet.html` — the sidebar + top bar every screen starts with, and inline icons.

## File shape (exactly this)
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
  <style>
    /* paste the ENTIRE contents of design/kit.css here, verbatim */
    /* then any screen-specific rules below it, prefixed with the screen name, e.g. .dash-… */
  </style>
</helmet>
<div class="app"> … shell + screen … </div>
</x-dc>
</body>
</html>
```
- The root is `<div class="app">` at exactly 1440×900. The `.main` area does not scroll in the
  mockup; design the content to fit 900px tall (roughly 760px of usable height under the top
  bar). If a list is long, show the first rows and let the last one cut off under the frame edge.
- The logo is referenced as `<img src="logo.png">` — leave it exactly so.
- Close every element, quote every attribute. Use flex/grid with `gap`, never inline whitespace
  spacing. Kit classes for components; inline `style=""` for one-off layout.
- Icons: inline SVG only (Lucide-style, `viewBox="0 0 24 24"`, stroke 2, round caps). No emoji.
- Fonts: Jost for headings/buttons/big numbers, Archivo for everything else, IBM Plex Mono for
  money, dates in columns, counts. The kit classes already do this.

## Content rules
- Use the seed data from SPEC §3 exactly (funders, grants, amounts, dates). Today is Sep 13, 2026.
- Money: `$25,000` in mono. Dates in columns: `Sep 26` mono; in prose: `Sep 26, 2026`.
- Copy is warm, plain, specific. Labels are nouns, buttons are verbs. No emoji, no exclamation marks,
  no "empower/unlock/impact".
- Gold is rationed: the "Awarded this FY" stat rule and Overdue/Due-soon attention only.
- Cards never nest a shadowed card inside another. A section inside a card is separated by a 1px rule.
- Phase badge tones: prospect neutral · loi olive · applying blue · submitted blue · awarded teal ·
  active teal · reporting gold · closed neutral · declined danger · withdrawn neutral.
- Hover states: show exactly one table row with `class="tr hover"` so the hover style is documented.

## Deliverable
Write only the files you were assigned to `design/<Name>.dc.html`. Do not touch other files.
When done, reply with the file list and any place where you had to deviate from the spec and why.
