-- docs/SCHEMA.md, "Diagrams" > "Grants: the pipeline, the award, the register, reminders and the
-- playbook": funders, grants, grant_programs, grant_shares, tasks, grant_documents, payments,
-- award_terms, grant_targets, reports, reminder_plans, reminder_plan_recipients,
-- reminder_defaults, reminder_default_recipients, checklist_templates, checklist_template_items.
--
-- The same conventions as the core migration: text ids, int dollars, enums as text checks
-- from the type's string unions, `not null` unless the diagram says `null`, every foreign key
-- `on delete restrict` (decision 0002), row level security on with no policies yet (#154).

-- funders ---------------------------------------------------------------------------------------

create table public.funders (
  id text primary key,
  name text not null,
  type text not null
    check (type in ('foundation', 'government', 'corporate', 'individual', 'other')),
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  cycle_notes text,
  notes text,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.funders (archived_by);
alter table public.funders enable row level security;

-- grants ----------------------------------------------------------------------------------------

create table public.grants (
  id text primary key,
  funder_id text not null references public.funders (id) on delete restrict,
  title text not null,
  restriction text not null check (restriction in ('restricted', 'unrestricted')),
  owner_id text not null references public.staff (id) on delete restrict,
  phase text not null
    check (phase in ('prospect', 'loi', 'applying', 'submitted', 'awarded', 'active', 'reporting', 'closed', 'declined', 'withdrawn')),
  loi_required boolean not null,
  -- Every amount, date and the notes are nullable: a grant brought in later may have only
  -- some of them (decision 0004).
  amount_requested integer,
  amount_awarded integer,
  start_by date,
  loi_due date,
  application_due date,
  submitted date,
  decision_expected date,
  decided date,
  period_start date,
  period_end date,
  notes text,
  created_at date not null,
  -- Set on a grant that arrived mid-life (decision 0004): both or neither.
  brought_in_phase text
    check (brought_in_phase in ('prospect', 'loi', 'applying', 'submitted', 'awarded', 'active', 'reporting', 'closed', 'declined', 'withdrawn')),
  brought_in_on date,
  -- A grant is renewed at most once (decision 0005, #67).
  renews_grant_id text unique references public.grants (id) on delete restrict,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict,
  constraint grants_brought_in_both_or_neither
    check ((brought_in_phase is null) = (brought_in_on is null))
);
create index on public.grants (funder_id);
create index on public.grants (owner_id);
create index on public.grants (archived_by);
alter table public.grants enable row level security;

-- A grant's programs: one or more per grant ("at least one" is checked on write), no order;
-- read sorted by program name (#131).
create table public.grant_programs (
  grant_id text not null references public.grants (id) on delete restrict,
  program_id text not null references public.programs (id) on delete restrict,
  primary key (grant_id, program_id)
);
create index on public.grant_programs (program_id);
alter table public.grant_programs enable row level security;

-- Part of a grant given to a program's budget for a fiscal year, or to a project (decision
-- 0006): exactly one of the two.
create table public.grant_shares (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  target_kind text not null check (target_kind in ('program', 'project')),
  program_id text references public.programs (id) on delete restrict,
  fiscal_year text,
  project_id text references public.projects (id) on delete restrict,
  amount integer not null check (amount > 0),
  constraint grant_shares_one_target check (
    (target_kind = 'program' and program_id is not null and fiscal_year is not null and project_id is null)
    or (target_kind = 'project' and project_id is not null and program_id is null and fiscal_year is null)
  )
);
create index on public.grant_shares (grant_id);
create index on public.grant_shares (program_id, fiscal_year);
create index on public.grant_shares (project_id);
alter table public.grant_shares enable row level security;

-- The checklist ---------------------------------------------------------------------------------

create table public.tasks (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  phase text not null
    check (phase in ('prospect', 'loi', 'applying', 'submitted', 'awarded', 'active', 'reporting', 'closed', 'declined', 'withdrawn')),
  title text not null,
  due_date date,
  assignee_id text references public.staff (id) on delete restrict,
  done boolean not null,
  done_at date,
  sort_order integer not null
);
create index on public.tasks (grant_id);
create index on public.tasks (assignee_id);
alter table public.tasks enable row level security;

-- The document register: a link out or an office document, never a file -------------------------

create table public.grant_documents (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  name text not null,
  kind text not null
    check (kind in ('narrative', 'budget', 'irs-letter', 'board-list', 'financials', 'insurance-certificate', 'w9', 'organization-budget', 'award-letter', 'agreement', 'report', 'other')),
  status text not null check (status in ('needed', 'drafting', 'final', 'submitted')),
  url text,
  office_document_id text references public.office_documents (id) on delete restrict,
  updated_at date not null
);
create index on public.grant_documents (grant_id);
create index on public.grant_documents (office_document_id);
alter table public.grant_documents enable row level security;

-- The award: payments, terms, deliverables -------------------------------------------------------

create table public.payments (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  label text not null,
  expected_date date not null,
  amount integer not null,
  received_date date,
  source_page integer,
  -- 0005: the deposit it arrived as; a foreign key once the sync brings a deposits table.
  deposit_id text
);
create index on public.payments (grant_id);
alter table public.payments enable row level security;

create table public.award_terms (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  label text not null,
  text text not null,
  page integer,
  sort_order integer not null
);
create index on public.award_terms (grant_id);
alter table public.award_terms enable row level security;

-- 0005: deliverables. Not in the browser build yet.
create table public.grant_targets (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  award_term_id text references public.award_terms (id) on delete restrict,
  label text not null,
  target integer not null,
  sort_order integer not null
);
create index on public.grant_targets (grant_id);
create index on public.grant_targets (award_term_id);
alter table public.grant_targets enable row level security;

-- Reports and their reminders ---------------------------------------------------------------------

create table public.reports (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  kind text not null check (kind in ('interim', 'final')),
  due_date date not null,
  submitted_date date,
  status text not null check (status in ('upcoming', 'drafting', 'submitted', 'accepted'))
);
create index on public.reports (grant_id);
alter table public.reports enable row level security;

create table public.reminder_plans (
  report_id text primary key references public.reports (id) on delete restrict,
  -- Days before due.
  offsets integer[] not null,
  keep_reminding boolean not null
);
alter table public.reminder_plans enable row level security;

create table public.reminder_plan_recipients (
  report_id text not null references public.reminder_plans (report_id) on delete restrict,
  staff_id text not null references public.staff (id) on delete restrict,
  primary key (report_id, staff_id)
);
create index on public.reminder_plan_recipients (staff_id);
alter table public.reminder_plan_recipients enable row level security;

-- One row.
create table public.reminder_defaults (
  id integer primary key check (id = 1),
  offsets integer[] not null,
  keep_reminding boolean not null,
  repeat_every_days integer not null,
  send_hour integer not null check (send_hour between 0 and 23)
);
alter table public.reminder_defaults enable row level security;

create table public.reminder_default_recipients (
  staff_id text primary key references public.staff (id) on delete restrict
);
alter table public.reminder_default_recipients enable row level security;

-- The playbook ------------------------------------------------------------------------------------

create table public.checklist_templates (
  id text primary key,
  name text not null,
  description text
);
alter table public.checklist_templates enable row level security;

create table public.checklist_template_items (
  id text primary key,
  template_id text not null references public.checklist_templates (id) on delete restrict,
  phase text not null
    check (phase in ('prospect', 'loi', 'applying', 'submitted', 'awarded', 'active', 'reporting', 'closed', 'declined', 'withdrawn')),
  title text not null,
  -- Negative is before the anchor.
  offset_days integer not null,
  -- A grant date, as the type names it (`DateAnchor`, the keys of `GrantDates`).
  anchor text not null
    check (anchor in ('startBy', 'loiDue', 'applicationDue', 'submitted', 'decisionExpected', 'decided', 'periodStart', 'periodEnd')),
  sort_order integer not null
);
create index on public.checklist_template_items (template_id);
alter table public.checklist_template_items enable row level security;
