# 0005 Roadmap items that shape the schema

**Status:** Open. Needs a yes, no or likely on each item below from the client.

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
| Organization documents | Versioned files with expiry dates that grants point at; shapes file storage | |
| Funder contact log, calendar and email | One activity log across every module, or one per module | |
| Photo releases | Guardian consent stored with the student; part of protecting student data | |
| Spending by program or project | An expense (or a QuickBooks class or location) names a program or project; the schema leaves room for it (see [0006](0006-programs-projects-and-shares.md)) | Likely |

## Can wait

Additive later, without changing what exists: reusable application text, weighted pipeline,
sign-off before submitting, what a decline taught us, report drafting, reimbursement claims, award
conditions as obligations, closeout, reliance on single funders, board report.
