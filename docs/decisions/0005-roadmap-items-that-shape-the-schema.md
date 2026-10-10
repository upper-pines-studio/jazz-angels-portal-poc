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
| Renewals | A grant points at last year's grant; see [Renewals](#renewals) | Yes: an optional link from a grant to the grant it renews |
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

## Renewals

Answered **yes** (#67). The office raises money mostly from the same funders every year. In the
schema a grant has an optional link to the grant it renews (`renewsGrantId` today, a nullable
foreign key to grants with the backend); a grant with none is not a renewal. A grant is renewed
at most once, so at most one grant points at any other, and a chain of years is followed link by
link. Nothing else changes shape: a renewal is a grant like any other, with its own checklist,
documents and budget lines, copied from last year's when it is started.

**Built on it.** "Start next year's" on an awarded grant makes the renewal at Prospect, prefilled
from this year's (title with the year moved on, this year's award as the ask, last year's dates a
year on), with the renewal checklist and last year's budget lines without the QuickBooks class.
Both grants link each other, and the funder's grant history keeps each grant next to the one it
renews. A link to a grant that is no longer saved is dropped on load.

## Can wait

Additive later, without changing what exists: reusable application text, weighted pipeline,
sign-off before submitting, what a decline taught us, report drafting, reimbursement claims, award
conditions as obligations, closeout, reliance on single funders, board report.
