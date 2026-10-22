-- The row rules (#154): docs/SCHEMA.md "Row-level security", tested as each role.
--
-- Run by `npm run test:db` through `supabase test db` (pgTAP), after the database is reset from
-- the migrations. Everything runs in one transaction that is rolled back.
--
-- One staff member of each of the seven roles signs in, plus an archived person and a signed-in
-- user with no `logins` row (whose token claims to be an Admin in `user_metadata`, which must
-- not count). The matrix reads and updates one fixture of every table as each of them; the
-- tests after it check the own-rows rules, inserts, deletes and the guardian columns.

begin;

select plan(923);

-- Signing in as someone ---------------------------------------------------------------------------

create schema tests;
grant usage on schema tests to authenticated;

-- The request as PostgREST makes it: the `authenticated` role and the token's claims.
create function tests.sign_in(who text) returns void language plpgsql as $$
declare
  uid uuid := case who
    when 'admin' then '00000000-0000-4000-8000-000000000001'
    when 'director' then '00000000-0000-4000-8000-000000000002'
    when 'office-manager' then '00000000-0000-4000-8000-000000000003'
    when 'bookkeeper' then '00000000-0000-4000-8000-000000000004'
    when 'teacher' then '00000000-0000-4000-8000-000000000005'
    when 'assistant' then '00000000-0000-4000-8000-000000000006'
    when 'read-only' then '00000000-0000-4000-8000-000000000007'
    when 'archived' then '00000000-0000-4000-8000-000000000008'
    when 'no-login' then '00000000-0000-4000-8000-000000000009'
  end;
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated',
    'user_metadata', json_build_object('role', 'admin', 'staff_id', 'admin'),
    'app_metadata', json_build_object('role', 'admin'))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.sign_out() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- The fixture, written as postgres (which bypasses the row rules) -----------------------------------

insert into auth.users (id, email)
select ('00000000-0000-4000-8000-00000000000' || n)::uuid, 'user' || n || '@example.org'
  from generate_series(1, 9) n;

insert into public.staff (id, name, title, role, teaches, email, archived_at) values
  ('admin', 'Ada', 'Admin', 'admin', false, 'user1@example.org', null),
  ('director', 'Barry', 'Director', 'director', true, 'user2@example.org', null),
  ('office-manager', 'Olive', 'Office manager', 'office-manager', false, 'user3@example.org', null),
  ('bookkeeper', 'Bea', 'Bookkeeper', 'bookkeeper', false, 'user4@example.org', null),
  ('teacher', 'Theo', 'Teaching artist', 'teacher', true, 'user5@example.org', null),
  ('assistant', 'Ash', 'Intern', 'assistant', false, 'user6@example.org', null),
  ('read-only', 'Rae', 'Board member', 'read-only', false, 'user7@example.org', null),
  ('archived', 'Arch', 'Former director', 'director', false, 'user8@example.org', '2026-09-01'),
  ('teacher-2', 'Tess', 'Teaching artist', 'teacher', true, null, null);

insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
select ('00000000-0000-4000-8000-00000000000' || n)::uuid, s, 'admin', now(), now()
  from unnest(array['admin', 'director', 'office-manager', 'bookkeeper', 'teacher', 'assistant',
                    'read-only', 'archived']) with ordinality as t(s, n);

insert into public.programs values ('studio', 'Studio', 'Studio', false, null, null);
insert into public.program_budgets values ('studio', 'FY27', 10000);
insert into public.projects values ('p1', 'Spring show', 'studio', '2026-09-01', '2027-06-30', 500, null, null);
insert into public.organizations (id, name, kind) values ('o1', 'Lincoln High', 'school');
insert into public.venues (id, name, kind, organization_id) values ('v1', 'Room 12', 'school', 'o1');
insert into public.office_documents values ('od1', 'w9', 'W-9', null, null);
insert into public.office_document_versions values
  ('odv1', 'od1', 1, 'w9.pdf', 'pdf', 40, 1, '2026-09-01', 'admin', null);
insert into public.settings values (1, 7, array['grants', 'teaching', 'timesheets']);

insert into public.funders (id, name, type) values ('f1', 'Arts Fund', 'foundation');
insert into public.grants (id, funder_id, title, restriction, owner_id, phase, loi_required, created_at)
  values ('g1', 'f1', 'Studio support', 'restricted', 'admin', 'active', false, '2026-08-01');
insert into public.grant_programs values ('g1', 'studio');
insert into public.grant_shares values ('gs1', 'g1', 'program', 'studio', 'FY27', null, 1000);
insert into public.tasks values ('t1', 'g1', 'active', 'Thank-you letter', null, null, false, null, 1);
insert into public.grant_documents values
  ('gd1', 'g1', 'W-9', 'w9', 'final', null, 'od1', '2026-09-01');
insert into public.payments values ('pay1', 'g1', 'First', '2026-10-01', 5000, null, null, null);
insert into public.award_terms values ('at1', 'g1', 'Reach', '200 students', null, 1);
insert into public.grant_targets values ('gt1', 'g1', 'at1', 'Students', 200, 1);
insert into public.reports values ('r1', 'g1', 'final', '2027-07-31', null, 'upcoming');
insert into public.reminder_plans values ('r1', array[30, 7], true);
insert into public.reminder_plan_recipients values ('r1', 'admin');
insert into public.reminder_defaults values (1, array[30, 7], true, 7, 9);
insert into public.reminder_default_recipients values ('director');
insert into public.checklist_templates values ('ct1', 'Foundation', null);
insert into public.checklist_template_items values ('cti1', 'ct1', 'applying', 'Draft', -14, 'applicationDue', 1);

insert into public.qb_accounts values ('6000', 'Program supplies');
insert into public.qb_classes values ('qc1', 'Studio');
insert into public.quickbooks_connection values (1, true, 'Jazz Angels', null);
insert into public.transactions values
  ('qb1', '2026-09-10', 'Music store', 'Reeds', '6000', 'qc1', 120, 'Bill 1047', 'assigned', 'bookkeeper', '2026-09-11');
insert into public.budget_versions (id, grant_id, number, added_by) values ('bv1', 'g1', 1, 'admin');
insert into public.budget_lines values ('bl1', 'g1', 'Supplies', 'qc1');
insert into public.budget_line_amounts values ('bv1', 'bl1', 2000);
insert into public.budget_line_accounts values ('bl1', '6000');
insert into public.expenses values ('ex1', 'g1', 'bl1', '2026-09-10', 'Music store', 120, null, 'qb1', null);
insert into public.split_rules values ('sr1', 'Music store');
insert into public.split_rule_parts values ('sr1', 1, 'g1', 'bl1', 100);
insert into public.grant_files values
  ('file-letter', 'g1', null, 'award-letter', 'letter.pdf', 'pdf', 80, 2, 'admin', '2026-08-02'),
  ('file-receipt', 'g1', 'ex1', 'receipt', 'receipt.pdf', 'pdf', 20, 1, 'bookkeeper', '2026-09-11');

insert into public.terms values ('fall', 'Fall', null, '2026-09-01', '2026-12-15', 12, null, null);
insert into public.ensembles values
  ('e-own', 'Combo A', 'studio', 'v1', '12', 'teacher', 'blue', null, null),
  ('e-other', 'Combo B', 'studio', 'v1', '12', 'teacher-2', 'teal', null, null);
insert into public.class_meetings values
  ('m-own', 'e-own', '2026-10-06', '16:00', '17:30', 'v1', '12', null, null),
  ('m-other', 'e-other', '2026-10-06', '16:00', '17:30', 'v1', '12', null, null);
insert into public.students values
  ('st-own', 'Mia', 'Sax', 1, 'studio', 'e-own', 'enrolled', null, null),
  ('st-other', 'Leo', 'Bass', 2, 'studio', 'e-other', 'enrolled', null, null),
  ('st-wait', 'Ivy', 'Piano', 0, 'studio', null, 'waitlist', null, null);
insert into public.student_private (student_id, guardian_name, guardian_phone, photo_release) values
  ('st-own', 'Guardian Own', '555-0101', 'given'),
  ('st-other', 'Guardian Other', '555-0102', 'not-asked'),
  ('st-wait', 'Guardian Wait', '555-0103', 'not-asked');
insert into public.attendance values
  ('a-own', 'm-own', 'st-own', 'present'),
  ('a-other', 'm-other', 'st-other', 'late');

insert into public.time_entries (id, staff_id, date, program_id, ensemble_id, activity, hours, status, approved_by, approved_at) values
  ('te-teacher-draft', 'teacher', '2026-10-06', 'studio', 'e-own', 'Teaching', 1.5, 'draft', null, null),
  ('te-teacher-submitted', 'teacher', '2026-10-07', 'studio', 'e-own', 'Teaching', 1.5, 'submitted', null, null),
  ('te-teacher-approved', 'teacher', '2026-09-29', 'studio', 'e-own', 'Teaching', 1.5, 'approved', 'director', '2026-10-01'),
  ('te-assistant-draft', 'assistant', '2026-10-06', 'studio', null, 'Data entry', 2, 'draft', null, null),
  ('te-admin-draft', 'admin', '2026-10-06', 'studio', null, 'Setup', 1, 'draft', null, null),
  ('te-bookkeeper-submitted', 'bookkeeper', '2026-10-06', 'studio', null, 'Books', 3, 'submitted', null, null);
insert into public.time_charges values ('tc1', 'te-teacher-approved', 'g1', 1.5, 'bookkeeper', '2026-10-02');

insert into public.activity (id, subject_kind, subject_id, at, who_id, text, kind) values
  ('act-grant', 'grant', 'g1', now(), 'admin', 'Moved to Active', null),
  ('act-funder', 'funder', 'f1', now(), 'admin', 'Called', null),
  ('act-teacher', 'time-entry', 'te-teacher-draft', now(), 'teacher', 'Logged', 'logged'),
  ('act-assistant', 'time-entry', 'te-assistant-draft', now(), 'assistant', 'Logged', 'logged'),
  ('act-signin', 'staff', 'teacher', now(), 'admin', 'Invited a teacher', null);

-- Nothing for anon, no truncate for anyone signed in ---------------------------------------------

select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' $$,
  'anon is granted nothing on any table');
select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
        and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'authenticated may not truncate, reference or trigger');
select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
      where schemaname = 'public' and roles <> '{authenticated}' $$,
  'every policy is to authenticated');
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policies p
                         where p.schemaname = 'public' and p.tablename = c.relname
                           and p.cmd = 'SELECT') $$,
  'every table has a read policy');
select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
      where schemaname = 'public' and cmd = 'UPDATE' and (qual is null or with_check is null) $$,
  'every update policy has both using and with check');
select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
      where schemaname = 'public'
        and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(user_metadata|app_metadata|auth\.jwt)' $$,
  'no policy reads the token');
select is_empty(
  $$ select p.proname from pg_proc p
      where p.pronamespace = 'private'::regnamespace
        and (has_function_privilege('anon', p.oid, 'execute')
             or not has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'the private functions are executable by authenticated only');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');

-- Who is signed in ---------------------------------------------------------------------------------

create function tests.whoami(who text) returns text language plpgsql as $$
declare
  answer text;
begin
  perform tests.sign_in(who);
  answer := coalesce(private.current_staff_id(), 'null') || ' ' || coalesce(private.current_role(), 'null');
  perform tests.sign_out();
  return answer;
end;
$$;

select is(tests.whoami('admin'), 'admin admin', 'an Admin is their staff record and role');
select is(tests.whoami('office-manager'), 'office-manager office-manager', 'an Office manager too');
select is(tests.whoami('teacher'), 'teacher teacher', 'a Teacher too');
select is(tests.whoami('archived'), 'null null', 'an archived person is nobody');
select is(tests.whoami('no-login'), 'null null', 'a user with no login is nobody, whatever their token says');
select is(private.current_role(), null, 'with no user at all, nobody');

-- The matrix: what each person reads and updates, table by table ---------------------------------
--
-- One column per role in decision 0001's order: Admin, Director, Office manager, Bookkeeper,
-- Teacher, Office assistant, Read-only. A = every fixture row, S = some of them, - = none. The
-- update is a no-op on every row (`set key = key`), so a row counts when the policy lets it be
-- changed. The archived person and the user with no login read and update nothing anywhere.

create table tests.expected (tab text primary key, reads text not null, updates text not null);
insert into tests.expected values
  --                             read       update
  ('staff',                      'AAAAAAA', 'AA-----'),
  ('logins',                     'AA-----', '-------'),
  ('programs',                   'AAAAAAA', 'AAA----'),
  ('program_budgets',            'AAAA-AA', 'AAAA---'),
  ('projects',                   'AAAA-AA', 'AAAA---'),
  ('organizations',              'AAAAAAA', 'AAA----'),
  ('venues',                     'AAAAAAA', 'AAA----'),
  ('office_documents',           'AAAA-AA', 'AAAA---'),
  ('office_document_versions',   'AAAA-AA', '-------'),
  ('settings',                   'AAAAAAA', 'A------'),
  ('activity',                   'ASSSSSS', '-------'),
  ('funders',                    'AAAA-AA', 'AAA--A-'),
  ('grants',                     'AAAA-AA', 'AAA--A-'),
  ('grant_programs',             'AAAA-AA', 'AAA--A-'),
  ('tasks',                      'AAAA-AA', 'AAA--A-'),
  ('grant_documents',            'AAAA-AA', 'AAA--A-'),
  ('checklist_templates',        'AAAA-AA', 'AAA--A-'),
  ('checklist_template_items',   'AAAA-AA', 'AAA--A-'),
  ('reminder_plans',             'AAAA-AA', 'AAA--A-'),
  ('reminder_plan_recipients',   'AAAA-AA', 'AAA--A-'),
  ('reminder_defaults',          'AAAA-AA', 'AAA--A-'),
  ('reminder_default_recipients','AAAA-AA', 'AAA--A-'),
  ('payments',                   'AAAA-AA', 'AAAA---'),
  ('award_terms',                'AAAA-AA', 'AAAA---'),
  ('reports',                    'AAAA-AA', 'AAAA---'),
  ('budget_versions',            'AAAA-AA', 'AAAA---'),
  ('budget_lines',               'AAAA-AA', 'AAAA---'),
  ('budget_line_amounts',        'AAAA-AA', 'AAAA---'),
  ('budget_line_accounts',       'AAAA-AA', 'AAAA---'),
  ('expenses',                   'AAAA-AA', 'AAAA---'),
  ('grant_targets',              'AAAA-AA', 'AAAA---'),
  ('grant_shares',               'AAAA-AA', 'AAAA---'),
  ('transactions',               'AAAA--A', 'AAAA---'),
  ('split_rules',                'AAAA--A', 'AAAA---'),
  ('split_rule_parts',           'AAAA--A', 'AAAA---'),
  ('grant_files',                'AAAA-AA', 'AAAS-S-'),
  ('quickbooks_connection',      'AAAA-AA', 'AAAA---'),
  ('qb_accounts',                'AAAA-AA', 'AAAA---'),
  ('qb_classes',                 'AAAA-AA', 'AAAA---'),
  ('terms',                      'AAA-AAA', 'AAA----'),
  ('ensembles',                  'AAA-AAA', 'AAA----'),
  ('class_meetings',             'AAA-AAA', 'AAA-S--'),
  ('students',                   'AAA-SA-', 'AAA----'),
  ('student_private',            'AAA-S--', 'AAA----'),
  ('attendance',                 'AAA-SA-', 'AAA-S--'),
  ('time_entries',               'AAAASS-', 'SSSSSS-'),
  ('time_charges',               'AAAA-AA', 'AAAA---');

create table tests.observed (who text, tab text, reads text, updates text);

create function tests.observe() returns void language plpgsql as $$
declare
  people constant text[] := array['admin', 'director', 'office-manager', 'bookkeeper', 'teacher',
                                  'assistant', 'read-only', 'archived', 'no-login'];
  who text;
  t record;
  total bigint;
  key text;
  n_read bigint;
  n_updated bigint;
begin
  for t in select tab from tests.expected loop
    execute format('select count(*) from public.%I', t.tab) into total;
    select a.attname into key
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = ('public.' || t.tab)::regclass and i.indisprimary;
    foreach who in array people loop
      perform tests.sign_in(who);
      execute format('select count(*) from public.%I', t.tab) into n_read;
      execute format('with u as (update public.%I set %I = %I returning 1) select count(*) from u',
                     t.tab, key, key) into n_updated;
      perform tests.sign_out();
      insert into tests.observed values (who, t.tab,
        case when n_read = 0 then '-' when n_read = total then 'A' else 'S' end,
        case when n_updated = 0 then '-' when n_updated = total then 'A' else 'S' end);
    end loop;
  end loop;
end;
$$;

select tests.observe();

select is((select count(*) from tests.expected), 47::bigint, 'the matrix covers every table');
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname not in (select tab from tests.expected) $$,
  'no table is left out of the matrix');

select is(o.reads,
          case when p.n <= 7 then substr(e.reads, p.n::int, 1) else '-' end,
          format('%s reads %s', o.who, o.tab))
  from tests.observed o
  join tests.expected e using (tab)
  join unnest(array['admin', 'director', 'office-manager', 'bookkeeper', 'teacher', 'assistant',
                    'read-only', 'archived', 'no-login']) with ordinality as p(who, n) using (who)
 order by o.tab, p.n;

select is(o.updates,
          case when p.n <= 7 then substr(e.updates, p.n::int, 1) else '-' end,
          format('%s updates %s', o.who, o.tab))
  from tests.observed o
  join tests.expected e using (tab)
  join unnest(array['admin', 'director', 'office-manager', 'bookkeeper', 'teacher', 'assistant',
                    'read-only', 'archived', 'no-login']) with ordinality as p(who, n) using (who)
 order by o.tab, p.n;

-- Own classes: a Teacher sees only their own classes' students, guardians and attendance ----------

select tests.sign_in('teacher');
select results_eq($$ select id from public.students order by id $$, array['st-own'],
  'a Teacher reads only their own classes'' students');
select results_eq($$ select student_id from public.student_private $$, array['st-own'],
  'a Teacher reads only their own classes'' guardians');
select results_eq($$ select id from public.attendance $$, array['a-own'],
  'a Teacher reads only the attendance at their own classes');
select results_eq($$ select count(*)::int from public.ensembles $$, array[2],
  'a Teacher reads the whole schedule');
select results_eq(
  $$ with u as (update public.class_meetings set roll_submitted_at = now()
                 where id in ('m-own', 'm-other') returning id) select id from u $$,
  array['m-own'], 'a Teacher closes the roll on their own class only');
select lives_ok(
  $$ insert into public.attendance values ('a-own-2', 'm-own', 'st-wait', 'present') $$,
  'a Teacher marks a student at their own class');
select throws_ok(
  $$ insert into public.attendance values ('a-other-2', 'm-other', 'st-own', 'present') $$,
  '42501', null, 'a Teacher may not mark at someone else''s class');
select throws_ok(
  $$ insert into public.students values ('st-new', 'New', 'Drums', 0, 'studio', 'e-own', 'enrolled', null, null) $$,
  '42501', null, 'a Teacher may not add a student');
select tests.sign_out();

-- Guardian columns: nobody without the guardian rule reads them ----------------------------------

select tests.sign_in('assistant');
select results_eq($$ select count(*)::int from public.students $$, array[3],
  'an Office assistant reads every student');
select is_empty($$ select * from public.student_private $$,
  'an Office assistant reads no guardian details');
select tests.sign_out();
select tests.sign_in('bookkeeper');
select is_empty($$ select * from public.students $$, 'a Bookkeeper reads no students');
select is_empty($$ select * from public.student_private $$, 'a Bookkeeper reads no guardian details');
select tests.sign_out();
select tests.sign_in('read-only');
select is_empty($$ select * from public.students $$, 'Read-only reads no student rows');
select is_empty($$ select * from public.attendance $$, 'Read-only reads no attendance rows');
select is_empty($$ select * from public.student_private $$, 'Read-only reads no guardian details');
select tests.sign_out();
select tests.sign_in('office-manager');
select results_eq($$ select count(*)::int from public.student_private $$, array[3],
  'an Office manager reads every guardian');
select lives_ok(
  $$ update public.student_private set guardian_phone = '555-0199' where student_id = 'st-own' $$,
  'an Office manager changes a guardian''s phone');
select tests.sign_out();

-- Inserts and deletes: allowed and refused --------------------------------------------------------

select tests.sign_in('assistant');
select lives_ok(
  $$ insert into public.tasks values ('t2', 'g1', 'active', 'Photos', null, null, false, null, 2) $$,
  'an Office assistant adds a checklist task');
select results_eq($$ with d as (delete from public.tasks where id = 't2' returning 1) select count(*)::int from d $$,
  array[1], 'an Office assistant deletes a checklist task');
select throws_ok(
  $$ insert into public.payments values ('pay2', 'g1', 'Second', '2027-01-01', 5000, null, null, null) $$,
  '42501', null, 'an Office assistant may not add a payment (no money edits)');
select throws_ok(
  $$ insert into public.office_document_versions values ('odv2', 'od1', 2, 'w9.pdf', 'pdf', 40, 1, '2026-10-01', 'assistant', null) $$,
  '42501', null, 'an Office assistant may not add an office document version');
select lives_ok(
  $$ insert into public.grant_files values ('file-agreement', 'g1', null, 'agreement', 'a.pdf', 'pdf', 10, 1, 'assistant', '2026-10-01') $$,
  'an Office assistant uploads a grant''s own file');
select throws_ok(
  $$ insert into public.grant_files values ('file-invoice', 'g1', 'ex1', 'invoice', 'i.pdf', 'pdf', 10, 1, 'assistant', '2026-10-01') $$,
  '42501', null, 'an Office assistant may not upload an expense''s backup');
select lives_ok(
  $$ insert into public.activity (id, subject_kind, subject_id, at, who_id, text) values ('act-a', 'grant', 'g1', now(), 'assistant', 'Checked a task') $$,
  'an Office assistant writes a grant''s activity line');
select tests.sign_out();

select tests.sign_in('bookkeeper');
select lives_ok(
  $$ insert into public.payments values ('pay2', 'g1', 'Second', '2027-01-01', 5000, null, null, null) $$,
  'a Bookkeeper adds a payment');
select lives_ok(
  $$ insert into public.office_document_versions values ('odv2', 'od1', 2, 'w9.pdf', 'pdf', 40, 1, '2026-10-01', 'bookkeeper', null) $$,
  'a Bookkeeper adds an office document version');
select results_eq(
  $$ with d as (delete from public.office_document_versions returning 1) select count(*)::int from d $$,
  array[0], 'nobody deletes an office document version');
select throws_ok(
  $$ insert into public.tasks values ('t3', 'g1', 'active', 'Photos', null, null, false, null, 3) $$,
  '42501', null, 'a Bookkeeper may not add a checklist task (Grants: View)');
select lives_ok(
  $$ insert into public.grant_files values ('file-invoice', 'g1', 'ex1', 'invoice', 'i.pdf', 'pdf', 10, 1, 'bookkeeper', '2026-10-01') $$,
  'a Bookkeeper uploads an expense''s backup');
select throws_ok(
  $$ insert into public.programs values ('p2', 'P2', 'P2', false, null, null) $$,
  '42501', null, 'a Bookkeeper may not add a program');
select tests.sign_out();

select tests.sign_in('read-only');
select throws_ok(
  $$ insert into public.activity (id, subject_kind, subject_id, at, who_id, text) values ('act-r', 'grant', 'g1', now(), 'read-only', 'Looked') $$,
  '42501', null, 'Read-only writes no activity');
select throws_ok(
  $$ insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status) values ('te-ro', 'read-only', '2026-10-06', 'studio', 'Board', 1, 'draft') $$,
  '42501', null, 'Read-only logs no hours');
select tests.sign_out();

select tests.sign_in('director');
select throws_ok(
  $$ insert into public.settings values (2, 7, array['grants']) $$,
  '42501', null, 'a Director may not write the settings');
select lives_ok(
  $$ insert into public.staff (id, name, title, role, teaches) values ('new', 'New', 'Intern', 'assistant', false) $$,
  'a Director adds a staff record');
select results_eq($$ with d as (delete from public.staff where id = 'new' returning 1) select count(*)::int from d $$,
  array[0], 'nobody deletes a staff record (decision 0002)');
select results_eq($$ with d as (delete from public.grants returning 1) select count(*)::int from d $$,
  array[0], 'nobody deletes a grant (decision 0002)');
select throws_ok(
  $$ insert into public.logins (auth_user_id, staff_id, invited_by, invited_at) values ('00000000-0000-4000-8000-000000000009', 'new', 'director', now()) $$,
  '42501', null, 'nobody signed in writes a login (by invitation only)');
select tests.sign_out();

select tests.sign_in('office-manager');
select throws_ok(
  $$ insert into public.quickbooks_connection values (1, true, 'Other', null) on conflict (id) do update set company = 'Other' $$,
  '42501', null, 'an Office manager may not connect QuickBooks');
select tests.sign_out();
select tests.sign_in('admin');
select lives_ok(
  $$ update public.settings set fiscal_year_start_month = 1 $$, 'an Admin changes the settings');
select tests.sign_out();

-- Deleting activity lines (#174): only a draft time entry's, by its own person ----------------------
--
-- Each person deletes every activity line they can, and the delete is undone; the lines that went
-- are the answer. A line for each kind of entry: own drafts (Admin, Teacher, Office assistant),
-- a draft sent back, a submitted and an approved entry, and a Read-only person's draft.

insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status, sent_back_by, sent_back_at, sent_back_reason) values
  ('te-teacher-sent-back', 'teacher', '2026-09-22', 'studio', 'Teaching', 1, 'draft', 'director', '2026-10-02', 'Wrong day'),
  ('te-read-only-draft', 'read-only', '2026-10-06', 'studio', 'Board', 1, 'draft', null, null, null);
insert into public.activity (id, subject_kind, subject_id, at, who_id, text, kind) values
  ('act-admin', 'time-entry', 'te-admin-draft', now(), 'admin', 'Logged', 'logged'),
  ('act-teacher-sent-back', 'time-entry', 'te-teacher-sent-back', now(), 'director', 'Sent back: Wrong day', 'sent-back'),
  ('act-teacher-submitted', 'time-entry', 'te-teacher-submitted', now(), 'teacher', 'Submitted', 'submitted'),
  ('act-teacher-approved', 'time-entry', 'te-teacher-approved', now(), 'director', 'Approved', 'approved'),
  ('act-bookkeeper', 'time-entry', 'te-bookkeeper-submitted', now(), 'bookkeeper', 'Submitted', 'submitted'),
  ('act-read-only', 'time-entry', 'te-read-only-draft', now(), 'read-only', 'Logged', 'logged');

create function tests.activity_deletes(who text) returns text[] language plpgsql as $$
declare
  gone text[];
begin
  perform tests.sign_in(who);
  begin
    with d as (delete from public.activity returning id)
    select coalesce(array_agg(id order by id), '{}') into gone from d;
    raise exception using errcode = 'PT174', message = 'undo';
  exception when sqlstate 'PT174' then
    null;
  end;
  perform tests.sign_out();
  return gone;
end;
$$;

select is(tests.activity_deletes('admin'), array['act-admin'],
  'an Admin deletes only their own draft''s lines');
select is(tests.activity_deletes('director'), '{}'::text[],
  'a Director deletes no activity line, not the lines of hours they approve or send back');
select is(tests.activity_deletes('office-manager'), '{}'::text[],
  'an Office manager deletes no activity line, not a grant''s or a funder''s');
select is(tests.activity_deletes('bookkeeper'), '{}'::text[],
  'a Bookkeeper does not delete their own submitted entry''s lines');
select is(tests.activity_deletes('teacher'), array['act-teacher'],
  'a Teacher deletes their own draft''s lines, not a sent-back, submitted or approved entry''s');
select is(tests.activity_deletes('assistant'), array['act-assistant'],
  'an Office assistant deletes their own draft''s lines, not a grant''s');
select is(tests.activity_deletes('read-only'), '{}'::text[],
  'Read-only deletes no activity line, not even their own draft''s');
select is(tests.activity_deletes('archived'), '{}'::text[],
  'an archived person deletes no activity line');
select is(tests.activity_deletes('no-login'), '{}'::text[],
  'a user with no login deletes no activity line');

delete from public.activity where id in ('act-admin', 'act-teacher-sent-back', 'act-teacher-submitted',
  'act-teacher-approved', 'act-bookkeeper', 'act-read-only');
delete from public.time_entries where id in ('te-teacher-sent-back', 'te-read-only-draft');

-- Own hours ------------------------------------------------------------------------------------------

select tests.sign_in('teacher');
select results_eq($$ select id from public.time_entries order by id $$,
  array['te-teacher-approved', 'te-teacher-draft', 'te-teacher-submitted'],
  'a Teacher reads only their own hours');
select lives_ok(
  $$ insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status) values ('te-new', 'teacher', '2026-10-08', 'studio', 'Teaching', 1, 'draft') $$,
  'a Teacher logs their own hours as a draft');
select throws_ok(
  $$ insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status) values ('te-sub', 'teacher', '2026-10-08', 'studio', 'Teaching', 1, 'submitted') $$,
  '42501', null, 'an entry is logged as a draft');
select throws_ok(
  $$ insert into public.time_entries (id, staff_id, date, program_id, activity, hours, status) values ('te-for', 'assistant', '2026-10-08', 'studio', 'Teaching', 1, 'draft') $$,
  '42501', null, 'nobody logs hours for someone else');
select throws_ok(
  $$ update public.time_entries set status = 'approved' where id = 'te-teacher-submitted' $$,
  '42501', null, 'nobody approves their own hours');
select results_eq(
  $$ with u as (update public.time_entries set hours = 2 where id = 'te-teacher-approved' returning 1) select count(*)::int from u $$,
  array[0], 'nobody changes their own approved entry');
select results_eq(
  $$ with d as (delete from public.time_entries where staff_id = 'teacher' returning id) select id from d order by id $$,
  array['te-new', 'te-teacher-draft'], 'a person deletes their own drafts, and nothing else');
select lives_ok(
  $$ insert into public.activity (id, subject_kind, subject_id, at, who_id, text, kind) values ('act-t', 'time-entry', 'te-teacher-submitted', now(), 'teacher', 'Recalled', 'recalled') $$,
  'a person writes their own entry''s history');
select throws_ok(
  $$ insert into public.activity (id, subject_kind, subject_id, at, who_id, text, kind) values ('act-x', 'time-entry', 'te-assistant-draft', now(), 'teacher', 'Changed', 'changed') $$,
  '42501', null, 'nobody writes the history of an entry they may not read');
select tests.sign_out();

select tests.sign_in('director');
select lives_ok(
  $$ update public.time_entries set status = 'approved', approved_by = 'director', approved_at = '2026-10-08' where id = 'te-teacher-submitted' $$,
  'a Director approves someone else''s hours');
select results_eq(
  $$ with u as (update public.time_entries set status = 'approved' where id = 'te-assistant-draft' returning 1) select count(*)::int from u $$,
  array[0], 'an approver does not touch someone else''s draft');
select tests.sign_out();

-- Shut out at once: archiving someone ends their access while their session lasts ----------------

update public.staff set archived_at = '2026-10-20', archived_by = 'admin' where id = 'teacher';
select tests.sign_in('teacher');
select is_empty($$ select * from public.staff $$, 'an archived Teacher reads nothing, not even staff');
select is_empty($$ select * from public.time_entries $$, 'nor their own hours');
select tests.sign_out();

select * from finish();
rollback;
