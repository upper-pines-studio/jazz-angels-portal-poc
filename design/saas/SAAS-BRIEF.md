# SaaS mockups — shared brief (for design agents)

Seven static mockups that show how the grants module grows into a grant-tracking product for
small nonprofits: post-award money tracking fed by QuickBooks Online. Jazz Angels is the demo
organization. These are mockups only; nothing in `src/` changes.

The authoring rules are in `design/ARTBOARD-BRIEF.md` and apply in full (file shape, 1440×900,
no JavaScript, kit classes, inline SVG icons, copy rules). Differences for this set:

- Files go in `design/saas/`, not `design/`.
- Paste `design/saas/kit.css` verbatim into the `<style>` block, then screen-specific rules below it
  with a screen prefix.
- Start from `design/saas/shell.snippet.html`. Its rail is different from the portal's: it has a
  **Money** section (Transactions, Budget vs. actual, Spend-down). Keep every rail item, label,
  count and order exactly as in the snippet; only move `active`.
- Look at `design/GrantActive.dc.html` and `design/portal/GrantReports.dc.html` first. They are the
  closest existing artboards and show how a grant detail page, tabs, tables, stats and progress
  bars are built from the kit. Match their density and structure.

## Shared facts (use these exactly, so the seven screens agree)

Today is Sunday, Sep 13, 2026. Fiscal year FY27 runs Jul 1, 2026 to Jun 30, 2027.
Signed in: Barry Cogert, Program Director. Bookkeeper: Denise Moreno, Office Administrator.
QuickBooks Online is connected; last sync "Today, 8:40 am".

### Grants with money

| Grant | Funder | Awarded | Period | Spent | Used | Period elapsed |
|---|---|---|---|---|---|---|
| General operating support 2026 | Herb Alpert Foundation | $50,000 | Jul 1, 2026 – Jun 30, 2027 | $18,240 | 36% | 21% |
| Youth Music Access | Long Beach Community Foundation | $8,500 | Mar 1, 2026 – Feb 28, 2027 | $2,425 | 29% | 54% |
| Organizational Grant Program FY26-27 | Los Angeles County Department of Arts and Culture | $22,000 | Jul 1, 2025 – Jun 30, 2026 | $21,460 | 98% | 100% (ended) |

Totals across the three: awarded $80,500, spent $42,125, remaining $38,375.

### Budget lines

Herb Alpert, General operating support 2026 (unrestricted, program: General operating):

| Line | Planned | Spent | Used | QuickBooks account | QuickBooks class |
|---|---|---|---|---|---|
| Teaching artist stipends | $22,000 | $12,650 | 58% | 6200 Contract instructors | Herb Alpert GOS |
| Sheet music and charts | $3,000 | $680 | 23% | 6410 Program supplies | Herb Alpert GOS |
| Instrument repair | $5,000 | $2,020 | 40% | 6420 Repairs and maintenance | Herb Alpert GOS |
| Venue and performances | $12,000 | $1,800 | 15% | 6500 Facility rental | Herb Alpert GOS |
| Admin and insurance | $8,000 | $1,090 | 14% | 6700 Insurance, 6710 Office | Herb Alpert GOS |

Long Beach Community Foundation, Youth Music Access (restricted, program: In-School Program):

| Line | Planned | Spent | Used |
|---|---|---|---|
| Teaching artist stipends | $4,500 | $1,800 | 40% |
| Sheet music and charts | $800 | $240 | 30% |
| Instrument repair | $1,200 | $385 | 32% |
| Venue and performances | $1,200 | $0 | 0% |
| Admin and insurance | $800 | $0 | 0% |

### Pacing (straight-line: spending so far, carried forward at the same daily rate)

- **Herb Alpert: spending fast.** 36% used with 21% of the period gone. At this rate the award runs
  out around Jan 22, 2027, five months before the period ends. The driver is Teaching artist
  stipends: 58% used, on course to run out around Nov 8, 2026.
- **Long Beach Community Foundation: spending slow.** 29% used with 54% of the period gone. At this
  rate about $4,500 is spent by Feb 28, 2027 and about $4,000 is left unspent. Venue and
  performances and Admin and insurance have no spending yet.
- **LA County: period ended.** $540 unspent. Final report due Sep 30, 2026 (17 days).

Status words to use everywhere: **On track**, **Spending fast**, **Spending slow**, **Period ended**.
Warnings come before a line goes over, never only after.

### Known expenses (Herb Alpert)

Jul 10 Nonprofits Insurance Alliance $1,090 (Admin and insurance, General liability renewal) ·
Jul 18 Signal Hill Music Service $1,240 (Instrument repair, Tenor sax overhaul) ·
Jul 24 Melissa Hasin $1,450 (Teaching artist stipends, July studio sessions) ·
Aug 5 JW Pepper $268 (Sheet music and charts, Big band charts).

Other payees you may use for new, unassigned transactions from QuickBooks: Long Beach Band Repair,
Sam Ash Music, Signal Hill Community Center (room rental), Albert Alva, Devon Price, Renee Cole
(teaching artists), Southern California Edison, Intuit QuickBooks, Staples. A good split example:
studio rent of $2,400 to Signal Hill Properties, shared between Herb Alpert (Venue and
performances) and Long Beach Community Foundation (Venue and performances).
14 transactions are waiting to be assigned.

### Reports owed

| Report | Grant | Due | Status |
|---|---|---|---|
| Final | LA County, Organizational Grant Program | Sep 30, 2026 | Drafting, due soon |
| Interim | Herb Alpert, General operating support | Jan 31, 2027 | Upcoming |
| Final | Long Beach Community Foundation, Youth Music Access | Mar 15, 2027 | Upcoming |
| Final | Herb Alpert, General operating support | Jul 31, 2027 | Upcoming |

## Product rules

- QuickBooks is read-only: the product never writes back. Say so where it helps trust.
- Transactions arrive from QuickBooks; people assign them, they do not retype them.
- Files are uploaded and stored here (award letters, receipts), unlike the POC which links out.
- Do not show pricing, sign-up, or an organization switcher.
- No em dashes in copy. No emoji.

## Deliverable

Write only your assigned file. Check it by rendering a screenshot with headless Chrome at 1440×900
into your scratch folder, look at the image, and fix overflow, clipping, overlap and misalignment
before you finish:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1440,900 --screenshot=<scratch>/<Name>.png "file://<absolute path to your file>"
```

Do not run git. Do not touch other files. Reply with the file written, what the screen shows, and
any decision you made that the brief did not cover.
