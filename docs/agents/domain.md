# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/decisions/`**: this repo's decision records (what other repos call ADRs). Read the ones that touch the area you're about to work in. `docs/decisions/README.md` lists them.

If `GLOSSARY.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms actually get resolved.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md          ← once the first term is settled
├── docs/decisions/
│   ├── README.md          ← the full list, one row per decision
│   ├── 0001-….md
│   ├── …
│   └── NNNN-….md
└── src/
```

## Recording a decision

This repo's ADRs are its decisions: they go in `docs/decisions/`, never in `docs/adr/`, even when a skill (such as `/domain-modeling`) says `docs/adr/` or offers its own ADR format.

A new decision goes in `docs/decisions/` with the next number, one past the highest-numbered file there (the last row of `docs/decisions/README.md`), in the format the existing ones use (a title, a **Status:** line, then why and what was decided), and gets a row in `docs/decisions/README.md`. When a decision changes, edit its file rather than adding a new one.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing decision, surface it explicitly rather than silently overriding:

> _Contradicts 0006 (programs, projects and shares), but worth reopening because…_
