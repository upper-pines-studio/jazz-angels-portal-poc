# 0007 Sessions for one program never overlap, and each program has its own current session

**Status:** Decided with the client, October 2026 (#83).

## Why

A session either belongs to one program (`Term.programId`) or spans them all, as the studio
sessions do. Until now sessions could overlap, and the current session was the earliest one today
fell in, one for the whole studio. A lot hangs off the current session: the schedule's heading
and the week of the term, the session card and its weeks, each ensemble's classes on the term
view, and the attendance the roster quotes. An in-school term that runs on the school's calendar
would have taken over the studio's weeks, or been hidden behind them.

## What the client answered

- **Two sessions of the same program never run at once.** An overlap is refused, and the
  database backs it.
- **Each program has its own current session.** The programs are separate lines whose
  calendars don't line up, so in-school classes follow their term and studio classes follow
  theirs.

## Decision

- **A session's line** is its program, or "all programs" for a session with none.
- **Two current sessions on the same line may not overlap.** Both ends count: a session that
  starts the day another ends overlaps it. Sessions on different lines may overlap. Adding a
  session, changing one (its dates or its program) and restoring an archived one are each
  refused when they would overlap, and the refusal names the session it clashes with and its
  dates. An archived session counts toward no overlap (decision 0002).
- **The current session for a class on a day** is the session of its ensemble's program that
  the day falls in, or between sessions the next one on that line. A program follows its own
  line once it has a current (not archived) session of its own; until then, and for a program
  that never has one, it follows the sessions for all programs. A student's attendance "this
  session" reads the same way, from the student's program.
- **What asks without a class or a program says which line it means.** With one line in use
  nothing changes on screen. With more than one, each heading names its line: "All programs:
  Fall 2026 session", "In-school: Fall term".

## Refined from the issue, and why

The issue reads "if that program has none, the all-programs session the day falls in". This
takes "none" as **no sessions of its own at all**, not "none today". A program on its own
calendar is between its own terms during its breaks; borrowing the studio's session then would
put its classes in the studio's weeks ("week 5 of 8") for a few weeks and back again. So a
program with sessions of its own stays on its line: between them it shows the next one, and once
its last one is over it has no current session until the office adds the next. Archiving every
one of its sessions puts it back on the line for all programs.

## What it means for the build

- `termForProgram(state, programId, date)` replaces `termForDate`; `termForEnsemble` reads an
  ensemble's program; `currentSessions(state, date)` gives each line's current or next session,
  all programs first. `termClash` and `restoreTermRefusal` are the store's checks and the
  dialog's.
- The Add session and Edit session dialogs ask which program a session is for, All programs
  first.
- The roll calls due are each class on its own date, as before: no session decides whether a
  roll call is due, so they do not move.
- The dashboard's attendance, which covers every program, falls back to the last finished
  session for all programs, not one program's term.
- In the database: an exclusion constraint on the date range per line, with "all programs" as
  one value (`docs/SCHEMA.md`, "Things to know").
