# 0006 Programs, projects and how a grant's money is shared

**Status:** Decided with the director, October 2026, from a prototype (#49). What "General
operating" is was decided after: it becomes Operations (#62, below). Spending by program is still
open (below). Built in four steps: #53 (a grant
names several programs, this decision), #54 (the Programs page), #55 (budgets, projects and
shares in the domain), #56 (the screens).

## Why

The director asked to see each program's budget for the year and the grants paying for it, and to
handle one-off work under a program (a spring showcase, an instrument refresh) that draws money
from several grants. In the director's words, one grant's money is often split across several programs and
projects. Until now a grant named exactly one program, "restricted" meant restricted to that
one, and nothing recorded how a grant's money was divided up.

## Decision

**Program** keeps its meaning: the ongoing programs in core (Studio Sessions, In-School and so
on). Each gets a **budget for each fiscal year**, and grants are put toward that budget.

**Project** is new: one-off work under one program, with a name, start and end dates and a
budget. It sits nested under its program on the Programs page. A project can be archived and
restored (decision 0002): its shares stay in history and stop counting toward a grant's "not yet
given".

**A grant names several programs.** `Grant.program` becomes `Grant.programs`, a list of at least
one. Built in #53.

- For a **restricted** grant, they are the programs its money may go to. A share outside them is
  flagged.
- For an **unrestricted** grant, they are only what it was applied for; its money can go
  anywhere.
- Saved data loads unchanged: `normalise` turns a saved `program` into a list of one.
- A grant matches the grants list's program filter when any of its programs does. Program
  numbers on the Reports tab count across all of them together. A grant that names Operations
  (General operating until #62) still counts every program.

**A grant's money is handed out in shares.** A share is a grant, a program *or* a project, and a
whole-dollar amount. A grant can have any number of shares; what is left shows as "not yet
given". Shares are by grant, not by budget line.

- The type is `GrantShare`, not `Share`. The grants domain already says "shares" for how an
  assigned QuickBooks transaction splits across grants (`usualShares` in `domain/money.ts`).
  In this portal, **a share of a transaction** is a slice of a QuickBooks transaction that one
  grant pays, and **a `GrantShare`** is a slice of a grant's money that a program or project
  gets. They are different things and do not meet.
- A share to a **program** counts toward one fiscal year of that program's budget. It records a
  `fiscalYear`, which defaults to the fiscal year the grant period starts in and can be changed.
- A share to a **project** has no fiscal year. A project shows on the Programs list in every
  fiscal year its dates overlap, with all its funding.
- A project takes its money **straight from grants**, not out of its program's share. A
  program's page lists its projects and their funding next to its own.

**Warnings, but no refusals.** The portal says so and lets the office carry on when:

- a share is outside a restricted grant's programs;
- a project falls outside the grant period;
- a program's year starts after the grant period ends, or ended before it starts;
- more is given out than the grant has.

Pending grants (LOI, Applying, Submitted) can take shares against the amount requested. Those
show as "If awarded", with hatched bars, and count separately from awarded money.

**Where it lives.** A new **Operations** section in the rail, right after Grants, with
**Programs** in it. Programs are managed there: Add program, Edit (name and short name),
Archive, Restore and Show archived move from Settings › Programs (built in #44). Who may change
programs stays as it is: Admin and Director (decision 0001, "Programs"). The list of programs
and projects scrolls in its own column and stays in view while the sheet beside it scrolls.

**Answered after the build** (October 2026, from the questions in #57 to #60):

- Who sees the Programs page follows "Program budgets and projects": everyone but the Teacher.
  The Admin, Director, Office manager and Bookkeeper edit budgets, projects and shares.
- A closed grant's shares keep counting toward their year: they are history.
- A grant with no period yet: a share to a program defaults to the fiscal year it is given in.
  Good for now.
- A share to a program year that ended before the grant period starts is flagged too, the
  mirror of a year that starts after it ends.
- Warnings stay red, as in the prototype, though none of them stops anything.
- The Programs list shows every project; one that does not run in the chosen year is greyed,
  with the years it does run.
- A project that crosses two fiscal years counts its whole budget in each, for now. Splitting
  it between the years, by hand, is wanted later (`docs/ROADMAP.md`).

**What General operating is** (October 2026, a follow-up to #49, built in #62): it becomes
**Operations**, the office's own line, apart from the programs.

- Operations is the office's running costs and unrestricted money: rent, salaries, insurance,
  the office. It is not a program, and there is exactly one. It keeps everything General
  operating had: a budget for each fiscal year, shares from grants, projects under it (an office
  move, a new laptop), grants that name it, hours logged to it, and its rule on a grant's Reports
  tab: a grant on it counts every program's numbers (`coversWholeStudio`).
- Its id stays `general-operating`, so every saved grant, share, budget, project and time entry
  that names it loads unchanged. It is called "Operations", short name "Operations". The id is
  `OPERATIONS_ID` in core, which grants and timesheets share. `normalise` renames a saved
  "General operating" (and puts back one that was archived or renamed before that was refused),
  and gives a saved office without it one.
- On the Programs page it sits apart from the programs: its own entry above the programs list,
  with its own sheet (budget, "Paid for by", projects), and not counted in the "N programs" of
  the page header, nor in Settings.
- It can't be archived or renamed, and Add program never makes a second one: the store refuses
  each, saying why. Who may change programs is unchanged (decision 0001, "Programs"). It is
  there in a new office (decision 0004) as well as in the demo.
- Wherever a program is chosen (Add grant, Edit record, the grants filter, Log hours, Add a
  project, Give to a program or project), Operations is still offered, last, as "Operations".
- Grant titles keep the funder's own words: the Herb Alpert grant is still "General operating
  support 2026".

## What it means for the build

- **#53 (built):** `Grant.programs` everywhere; Add grant, Grant details and Edit award record
  choose one or more programs; the grants list shows them and filters by any; Program numbers
  add them up. In the demo, the Port of Long Beach grant is for In-School and Homeschool.
- **#55 (built, domain only):** program budgets by fiscal year (named "FY27") and `Project`
  in core, with their actions and rules; `GrantShare` with Give, Change and Take back in the
  grants module (`domain/shares.ts`), the totals and the warnings; the manifest's
  `funding` contribution, through which the Programs page asks what pays for a program's year
  or a project. Saved data loads with none of them; the demo seeds the prototype's. Choices
  made there: a grant's money counts once it reaches LOI (as "If awarded") and goes on counting
  when Closed; a program share with no grant period yet defaults to the year it is given in;
  giving again to the same program year or project adds to that share; a restricted grant
  naming Operations (then General operating) is restricted to it like any other program.
- **#56 (built, the screens):** the Programs page lists each program's projects under it with
  what is funded against its budget for a chosen fiscal year; a program's and a project's sheet
  show the budget, the money from awarded grants and if pending grants come in, what is still
  to find, the stacked bar hatched for "If awarded", "Paid for by" (the grants module's panel,
  through its manifest) with Add money from a grant, and, on a program, its projects with Add a
  project. Each grant shows "Where this grant's money goes" under its Award tab, or its first
  tab before an award, with Give to a program or project. Warnings show and never stop anything.
- **Budgets and projects are core nouns** (`Project`, program budgets by fiscal year in
  `src/core`); **`GrantShare` belongs to the grants module** (`domain/types.ts`), as do its
  actions, rules and totals. The Programs page is a core screen; the grants module adds its
  "Paid for by" part through its manifest, so `app/` never reaches inside the module.
- Permissions follow "Award, budget, reports": see the two rows added to decision 0001.
- Money stays whole dollars, dates stay ISO strings, as everywhere.
- Shares are by grant, not by budget line, and one share counts toward one fiscal year. Splitting
  a share across years, program targets and deliverables are not part of this.

## Still open

- **Spending by program or project.** Likely, built later. Either tag each expense, or read a
  QuickBooks class or location from the sync. The schema leaves room for it
  (see [0005](0005-roadmap-items-that-shape-the-schema.md)).
