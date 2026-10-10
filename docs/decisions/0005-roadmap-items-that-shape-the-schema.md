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
| Funder contact log, calendar and email | One activity log across every module, or one per module; see [One activity log](#one-activity-log) | Likely: one activity log in core for every module |
| Photo releases | Guardian consent stored with the student; part of protecting student data | |
| Spending by program or project | An expense (or a QuickBooks class or location) names a program or project; the schema leaves room for it (see [0006](0006-programs-projects-and-shares.md)) | Likely |

## One activity log

Answered **likely** (#64). The schema has one activity table from day one, shared by every
module. Each row names what it is about with a **subject kind and id** (`grant` and an id,
`funder` and an id, and later `student`, `ensemble`, `time entry`, `program`, `project`), who did
it, when, and the text. A module writes rows about its own records and reads them back by
subject; a page that gathers several subjects, such as a funder's page showing the activity of all
its grants, reads rows for each. Calls, meetings and emails logged by hand become a kind of row
later, with no new table; a calendar feed or email link would point at rows the same way.

**Why the portal does not move the log now.** Today each module's data is saved on its own
(`src/core/live.ts`: one save per slice, rolled back per slice). Only the grants module keeps a
log, as `activity` in its own data, written in the same change as what it describes, so a phase
change and its "Marked submitted" line are saved or rolled back together. A log kept in core
would make every such change two saves that could fail apart, leaving a change with no line or a
line with no change. So the grants log stays where it is, and its rows become rows of the shared
table, subject kind `grant`, when the backend comes (#22), where one transaction can write both.

**Already built on it.** A funder's page shows Recent activity: the activity of its grants,
newest first, each line naming its grant (`funderActivity` in the grants module), archived grants
included (decision 0002).

## Can wait

Additive later, without changing what exists: reusable application text, weighted pipeline,
sign-off before submitting, what a decline taught us, report drafting, reimbursement claims, award
conditions as obligations, closeout, reliance on single funders, board report.
