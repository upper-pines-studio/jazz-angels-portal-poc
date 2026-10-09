# 0006 Programs, projects and how a grant's money is shared

**Status:** Decided with the director, October 2026, from a prototype (#49). What "General
operating" is, and spending by program, are still open (below). Built in four steps: #53 (a grant
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
  numbers on the Reports tab count across all of them together. A grant that names General
  operating still counts every program.

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
- a program's year starts after the grant period ends;
- more is given out than the grant has.

Pending grants (LOI, Applying, Submitted) can take shares against the amount requested. Those
show as "If awarded", with hatched bars, and count separately from awarded money.

**Where it lives.** A new **Operations** section in the rail, right after Grants, with
**Programs** in it. Programs are managed there: Add program, Edit (name and short name),
Archive, Restore and Show archived move from Settings › Programs (built in #44). Who may change
programs stays as it is: Admin and Director (decision 0001, "Programs"). The list of programs
and projects scrolls in its own column and stays in view while the sheet beside it scrolls.

## What it means for the build

- **#53 (built):** `Grant.programs` everywhere; Add grant, Grant details and Edit award record
  choose one or more programs; the grants list shows them and filters by any; Program numbers
  add them up. In the demo, the Port of Long Beach grant is for In-School and Homeschool.
- **Budgets and projects are core nouns** (`Project`, program budgets by fiscal year in
  `src/core`); **`GrantShare` belongs to the grants module** (`domain/types.ts`), as do its
  actions, rules and totals. The Programs page is a core screen; the grants module adds its
  "Paid for by" part through its manifest, so `app/` never reaches inside the module.
- Permissions follow "Award, budget, reports": see the two rows added to decision 0001.
- Money stays whole dollars, dates stay ISO strings, as everywhere.
- Shares are by grant, not by budget line, and one share counts toward one fiscal year. Splitting
  a share across years, program targets and deliverables are not part of this.

## Still open

- **What "General operating" is.** It stays an ordinary program until the client decides. One
  option is to rename it Operations, as the place for unrestricted money that is not tied to any
  program.
- **Spending by program or project.** Likely, built later. Either tag each expense, or read a
  QuickBooks class or location from the sync. The schema leaves room for it
  (see [0005](0005-roadmap-items-that-shape-the-schema.md)).
