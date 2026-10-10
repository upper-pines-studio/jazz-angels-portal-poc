# 0005 Roadmap items that shape the schema

**Status:** Open. Needs a yes, no or likely on each item below from the client. Answered so far:
organization documents (yes, #66).

The ideas in `docs/ROADMAP.md` are not commitments. Most can be added later as new tables. These
eleven change the shape of tables that exist from day one, or how they link, so each needs a yes,
no or likely before the schema is written. A "likely" is enough: the schema leaves room for it
and the feature is built later.

| Idea | What it changes | Answer |
| --- | --- | --- |
| Budget changes | Budget lines get versions; budget vs. actual measures against the current one | |
| Staff pay charged to grants | A time entry carries a program or a grant; the QuickBooks sync brings in payroll | |
| Payments matched to deposits | The QuickBooks sync brings in deposits as well as expenses | |
| Matching funds and in-kind gifts | An expense that does not come from QuickBooks | |
| Restricted and unrestricted money | How money is grouped into funds or classes | |
| Deliverables | A targets table tied to the grant and its award terms | |
| Renewals | A grant points at last year's grant | |
| Organization documents | Versioned files with expiry dates that grants point at; shapes file storage | **Yes** (#66): an office documents table (kind, name, archive fields), a versions table (the document, the file's name, format, size and pages, added on and by, expires; rows only ever added), file contents in storage keyed by version, and a grant's register row linking to a document, the version it sent read from the grant's submitted date (#68) |
| Funder contact log, calendar and email | One activity log across every module, or one per module | |
| Photo releases | Guardian consent stored with the student; part of protecting student data | |
| Spending by program or project | An expense (or a QuickBooks class or location) names a program or project; the schema leaves room for it (see [0006](0006-programs-projects-and-shares.md)) | Likely |

## Answered

**Organization documents: yes** (October 2026, #66). The papers every funder asks for are kept
once for the office, in core (in code "office documents", since an `Organization` is a partner),
each with versions and an optional expiry. Built in the browser on Office › Documents:

- A document has a kind (IRS determination letter, audit or financials, board list, insurance
  certificate, W-9, organization budget, other), a name and its versions. A version has the
  file's facts (core's `FileFacts`, which a grant's `GrantFile` builds on), when it was added and
  by whom, and an optional expiry. The newest version added is current; older ones stay,
  read-only. Documents are archived, never deleted (decision
  [0002](0002-archive-not-delete.md)).
- Out of date from the current version's expiry day on; Expires soon within 30 days of today (the
  store's today, which follows the demo date); current otherwise, and always with no expiry. The
  dashboard lists the first two to the roles that may open the page ("Office documents" in
  [0001](0001-roles-and-permissions.md)).
- What the schema does: a documents table and a versions table, the version rows only ever
  inserted; the file contents in storage, keyed by the version's id, which the browser build does
  not store (a known gap); and a grant's register row pointing at a document (#68), read as the
  version current at the grant's submitted date (`currentVersion(doc, on)`). The register row
  stores the document, not the version: the version is worked out, so a grant not yet submitted
  follows each new version and one submitted keeps what went in, with nothing to update.
- A save from before office documents loads with none, demo or not, as budgets did (decision
  [0006](0006-programs-projects-and-shares.md)); Reset demo data seeds the six.

## Can wait

Additive later, without changing what exists: reusable application text, weighted pipeline,
sign-off before submitting, what a decline taught us, report drafting, reimbursement claims, award
conditions as obligations, closeout, reliance on single funders, board report.
