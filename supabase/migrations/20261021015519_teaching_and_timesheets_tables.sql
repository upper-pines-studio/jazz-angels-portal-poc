-- docs/SCHEMA.md, "Diagrams" > "Teaching and timesheets": terms, ensembles, class_meetings,
-- students, student_private, attendance, time_entries, time_charges. Also the sessions
-- exclusion constraint from "Things to know when building it" (decision 0007, #83).
--
-- The same conventions as the core migration: text ids, enums as text checks from the type's
-- string unions, `not null` unless the diagram says `null`, every foreign key `on delete
-- restrict` (decision 0002), row level security on with no policies yet (#154). Hours are
-- numeric(5,2) in quarter-hour steps. The transition and closed-roll triggers come in #155.

-- Sessions (terms): one line per program, null being a line of its own ---------------------------

create table public.terms (
  id text primary key,
  name text not null,
  -- Set when one program's; its line (decision 0007).
  program_id text references public.programs (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  meetings_planned integer not null,
  archived_at date,
  archived_by text references public.staff (id) on delete restrict,
  constraint terms_dates_in_order check (end_date >= start_date),
  -- Two current terms on one line never share a day; an archived term counts toward none.
  constraint terms_no_overlap_on_a_line exclude using gist (
    (coalesce(program_id, '')) with =,
    (daterange(start_date, end_date, '[]')) with &&
  ) where (archived_at is null)
);
create index on public.terms (program_id);
create index on public.terms (archived_by);
alter table public.terms enable row level security;

-- Ensembles and their meetings ----------------------------------------------------------------------

create table public.ensembles (
  id text primary key,
  name text not null,
  program_id text not null references public.programs (id) on delete restrict,
  venue_id text not null references public.venues (id) on delete restrict,
  room text not null,
  -- Whose own classes (decision 0001).
  lead_staff_id text not null references public.staff (id) on delete restrict,
  tone text not null check (tone in ('blue', 'teal', 'olive', 'gold', 'neutral')),
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.ensembles (program_id);
create index on public.ensembles (venue_id);
create index on public.ensembles (lead_staff_id);
create index on public.ensembles (archived_by);
alter table public.ensembles enable row level security;

create table public.class_meetings (
  id text primary key,
  ensemble_id text not null references public.ensembles (id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  -- Copied from the ensemble.
  venue_id text not null references public.venues (id) on delete restrict,
  room text not null,
  -- Set means the roll is closed.
  roll_submitted_at timestamptz,
  notes text
);
create index on public.class_meetings (ensemble_id);
create index on public.class_meetings (venue_id);
alter table public.class_meetings enable row level security;

-- Students, and their guardian columns in a table of their own (decision 0001) ---------------------

create table public.students (
  id text primary key,
  name text not null,
  instrument text not null,
  years_in integer not null,
  program_id text not null references public.programs (id) on delete restrict,
  -- Null while on the waitlist.
  ensemble_id text references public.ensembles (id) on delete restrict,
  status text not null check (status in ('enrolled', 'waitlist', 'alumni')),
  archived_at date,
  archived_by text references public.staff (id) on delete restrict
);
create index on public.students (program_id);
create index on public.students (ensemble_id);
create index on public.students (archived_by);
alter table public.students enable row level security;

create table public.student_private (
  student_id text primary key references public.students (id) on delete restrict,
  guardian_name text not null,
  guardian_phone text,
  guardian_email text,
  guardian_street text,
  guardian_city text,
  guardian_state text,
  guardian_zip text,
  photo_release text not null check (photo_release in ('given', 'not-given', 'not-asked')),
  photo_release_date date,
  photo_release_recorded_by text references public.staff (id) on delete restrict,
  constraint student_private_address_all_or_none
    check (num_nulls(guardian_street, guardian_city, guardian_state, guardian_zip) in (0, 4))
);
create index on public.student_private (photo_release_recorded_by);
alter table public.student_private enable row level security;

create table public.attendance (
  id text primary key,
  meeting_id text not null references public.class_meetings (id) on delete restrict,
  student_id text not null references public.students (id) on delete restrict,
  mark text not null check (mark in ('present', 'late', 'absent')),
  constraint attendance_meeting_student_key unique (meeting_id, student_id)
);
create index on public.attendance (student_id);
alter table public.attendance enable row level security;

-- Timesheets --------------------------------------------------------------------------------------

create table public.time_entries (
  id text primary key,
  staff_id text not null references public.staff (id) on delete restrict,
  date date not null,
  program_id text not null references public.programs (id) on delete restrict,
  ensemble_id text references public.ensembles (id) on delete restrict,
  activity text not null,
  hours numeric(5, 2) not null check (hours * 4 = trunc(hours * 4)),
  status text not null check (status in ('draft', 'submitted', 'approved')),
  -- Never staff_id: refused by a trigger with a sentence the screen can show (#155).
  approved_by text references public.staff (id) on delete restrict,
  approved_at date,
  sent_back_by text references public.staff (id) on delete restrict,
  sent_back_at date,
  -- Set with sent_back_by, cleared on submit.
  sent_back_reason text
);
create index on public.time_entries (staff_id);
create index on public.time_entries (program_id);
create index on public.time_entries (ensemble_id);
create index on public.time_entries (approved_by);
create index on public.time_entries (sent_back_by);
alter table public.time_entries enable row level security;

-- 0005: staff pay charged to grants, one grant per entry for now. Not in the browser build yet.
create table public.time_charges (
  id text primary key,
  time_entry_id text not null unique references public.time_entries (id) on delete restrict,
  grant_id text not null references public.grants (id) on delete restrict,
  -- At most the entry's hours.
  hours numeric(5, 2) not null check (hours * 4 = trunc(hours * 4)),
  charged_by text not null references public.staff (id) on delete restrict,
  charged_at date not null
);
create index on public.time_charges (grant_id);
create index on public.time_charges (charged_by);
alter table public.time_charges enable row level security;
