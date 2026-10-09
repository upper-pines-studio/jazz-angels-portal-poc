# Roadmap: grant management

Ideas for the grants module that are not built and not yet decided. Nothing here is a commitment
or a spec. When a feature is picked up, write its spec, build it, add its row to
`docs/FEATURES.md`, and remove it from this file.

What already exists is in `docs/FEATURES.md`; what is broken or missing in a built feature is in
its Known gaps section, not here.

## Suggested order

1. **Reusable application text and organization documents.** Saves time on every application,
   stands alone, and needs no backend.
2. **Deliverables tracking.** Turns the program numbers already on the Reports tab into "are we
   keeping our promises", and leads straight into report drafting.
3. **Renewals.** Small to build, and it matches how the office raises money: mostly the same
   funders, every year.
4. **Charging staff pay to grants from timesheets.** The most valuable link between modules, but
   it needs real QuickBooks payroll data, so it waits for a backend.

## Before the award

| Idea | What it is | Builds on |
| --- | --- | --- |
| Reusable application text | A searchable library of the answers every application asks for: mission, program descriptions, outcomes, budget explanation, equity statement. Shows when each was last used and which grants it won. | |
| Organization documents | One set of the files every funder asks for (IRS letter, audit, board list, insurance certificate, W-9, current budget), each with an expiry or "out of date" reminder. A grant's document register pulls the current version. | Documents tab |
| Funder contact log | Calls, site visits, meetings with program officers, thank-you notes, concert invitations, recorded on the funder. | Funder detail |
| Renewals | "Start next year's from this one": copy funder, program, budget shape, checklist and narrative, and open the next cycle in the pipeline on its own. | Add grant, Playbook |
| Weighted pipeline | Each ask weighted by its chance of success, giving expected revenue by fiscal year and program, and the gap still to raise. | Pipeline card |
| Sign-off before submitting | Director or board approval for asks above a set amount, recorded on the grant. | Phase changes |
| What a decline taught us | The funder's feedback, whether to reapply, and when. | Phase changes |

## After the award

| Idea | What it is | Builds on |
| --- | --- | --- |
| Deliverables | The targets the award letter promises ("serve 120 students", "8 public performances") and progress toward each, from roll call and timesheets. | Program numbers, award terms |
| Report drafting | A draft that combines the funder's questions, program numbers, budget vs. actual in the funder's format, and student stories and photos. | Reports tab |
| Budget changes | Requests to the funder to move money between lines, their approval, and the budget's version history, so budget vs. actual measures against the current budget. | Budget tab |
| Staff pay charged to grants | A share of teaching-artist pay charged to a grant from hours logged by program, which is also the record of hours funders ask for. | Timesheets, QuickBooks |
| Matching funds and in-kind gifts | The match a funder requires, tracked alongside the grant's own spending. | Budget tab |
| Reimbursement claims | For grants that pay only after a claim: the claims the office submits and what each covers. | Payment schedule |
| Payments matched to deposits | Each expected payment matched to the QuickBooks deposit it arrived as, instead of being marked received by hand. | Payment schedule, QuickBooks |
| Award conditions as obligations | Terms that are recurring duties (credit the funder in concert programs, written approval before equipment over $5,000) become checklist items or warnings on Transactions. | Award terms, Transactions |
| Closeout | Final reconciliation, returning unspent funds, and how long records must be kept. | Phase changes |

## Across the organization

| Idea | What it is | Builds on |
| --- | --- | --- |
| Restricted and unrestricted money | How much restricted money is still unspent and when it is released, in the form the bookkeeper and auditor need. | Budget vs. actual |
| A project's budget split across years | For a project that crosses two fiscal years (the Summer Jazz Intensive runs June to August), the office splits its budget between them by hand, so each year's totals count only its part. Today each year counts the whole budget. | Programs page (decision 0006) |
| Reliance on single funders | Each funder's share of revenue, and which programs depend on one grant. | Funders |
| Board report | A one-page quarterly summary: pipeline, wins, spending pace, reports due. | Dashboard |
| Calendar and email | Deadlines as a calendar feed; funder emails logged on the grant. | Deadlines, Activity tab |
| Photo releases | Guardian consent for student photos used in reports, kept with the student. | Teaching students |
