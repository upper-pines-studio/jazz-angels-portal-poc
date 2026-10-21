-- docs/SCHEMA.md, "Diagrams" > "Core: people, programs, partners, office documents, the
-- activity log": staff, logins, programs, program_budgets, projects, organizations, venues,
-- office_documents, office_document_versions, settings, activity.
--
-- Built as the schema says (Conventions): ids are text, money is int dollars, dates are
-- `date`, enums are text with a check listing the type's string union, every column is
-- `not null` unless the diagram marks it `null`, and every foreign key is `on delete restrict`
-- (decision 0002: nothing cascades). Row level security is switched on for every table with
-- no policies yet, so nothing is readable through the API until the policies come (#154).
-- The triggers in "Things to know" (the "by" columns, Operations) come in #155.

-- staff ---------------------------------------------------------------------------------------

create table public.staff (
  id text primary key,
  name text not null,
  title text not null,
  role text not null
    check (role in ('admin', 'director', 'office-manager', 'bookkeeper', 'teacher', 'assistant', 'read-only')),
  teaches boolean not null,
  -- Required once the record has a login (decision 0009); not on the type yet.
  email text,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.staff (archived_by);
-- One current staff record per email (stored trimmed and lower-cased, #152); an archived
-- record keeps its email without holding it.
create unique index staff_email_key on public.staff (email) where archived_at is null;
alter table public.staff enable row level security;

-- logins: a Supabase user tied to one staff record, one each way (decision 0009) -----------------

create table public.logins (
  auth_user_id uuid primary key references auth.users (id) on delete restrict,
  staff_id text not null unique references public.staff (id) on delete restrict,
  invited_by text not null references public.staff (id) on delete restrict,
  invited_at timestamptz not null,
  accepted_at timestamptz
);
create index on public.logins (invited_by);
alter table public.logins enable row level security;

-- programs, their budgets per fiscal year, and projects (decision 0006) -------------------------

create table public.programs (
  id text primary key,
  name text not null,
  short text not null,
  in_school boolean not null,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.programs (archived_by);
alter table public.programs enable row level security;

create table public.program_budgets (
  program_id text not null references public.programs (id) on delete restrict,
  fiscal_year text not null,
  amount integer not null,
  primary key (program_id, fiscal_year)
);
alter table public.program_budgets enable row level security;

create table public.projects (
  id text primary key,
  name text not null,
  program_id text not null references public.programs (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  budget integer not null,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.projects (program_id);
create index on public.projects (archived_by);
alter table public.projects enable row level security;

-- partners: organizations and venues --------------------------------------------------------------

create table public.organizations (
  id text primary key,
  name text not null,
  kind text not null
    check (kind in ('school-district', 'school', 'community', 'government', 'other')),
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.organizations (archived_by);
alter table public.organizations enable row level security;

create table public.venues (
  id text primary key,
  name text not null,
  kind text not null
    check (kind in ('studio', 'school', 'community', 'performance', 'other')),
  organization_id text references public.organizations (id) on delete restrict,
  street text,
  city text,
  state text,
  zip text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict,
  constraint venues_address_all_or_none check (num_nulls(street, city, state, zip) in (0, 4))
);
create index on public.venues (organization_id);
create index on public.venues (archived_by);
alter table public.venues enable row level security;

-- office documents and their insert-only versions (decision 0005, #66, #131) ---------------------

create table public.office_documents (
  id text primary key,
  kind text not null
    check (kind in ('irs-letter', 'financials', 'board-list', 'insurance-certificate', 'w9', 'organization-budget', 'other')),
  name text not null,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.office_documents (archived_by);
alter table public.office_documents enable row level security;

create table public.office_document_versions (
  -- Also the key of the version's object in Storage (#158).
  id text primary key,
  office_document_id text not null references public.office_documents (id) on delete restrict,
  -- 1, 2, 3 per document in the order added; breaks a same-day tie (#131).
  number integer not null,
  name text not null,
  format text not null check (format in ('pdf', 'jpg', 'png', 'heic')),
  size_kb integer not null,
  pages integer,
  added_at date not null,
  added_by text not null references public.staff (id) on delete restrict,
  expires date,
  constraint office_document_versions_number_key unique (office_document_id, number)
);
create index on public.office_document_versions (added_by);
alter table public.office_document_versions enable row level security;

-- settings: one row ----------------------------------------------------------------------------

create table public.settings (
  id integer primary key check (id = 1),
  fiscal_year_start_month integer not null check (fiscal_year_start_month between 1 and 12),
  enabled_modules text[] not null
);
alter table public.settings enable row level security;

-- activity: one log for every module, keyed by its subject (decision 0005, #64, #95) -------------

create table public.activity (
  id text primary key,
  -- No foreign key: the subject can be any kind (SCHEMA.md, "Links across modules").
  subject_kind text not null check (subject_kind in ('grant', 'funder', 'time-entry')),
  subject_id text not null,
  at timestamptz not null,
  who_id text references public.staff (id) on delete restrict,
  -- A name saved before rows carried an id.
  who text,
  text text not null,
  -- A time entry's step.
  kind text
    check (kind in ('logged', 'changed', 'submitted', 'recalled', 'approved', 'sent-back')),
  detail jsonb
);
create index on public.activity (subject_kind, subject_id);
create index on public.activity (who_id);
alter table public.activity enable row level security;
