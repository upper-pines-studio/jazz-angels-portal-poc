-- The storage rules (#158): docs/SCHEMA.md "Files", tested as each role.
--
-- Run by `npm run test:db` through `supabase test db` (pgTAP), after the database is reset from
-- the migrations. Everything runs in one transaction that is rolled back. The same people and
-- rows as row-rules.test.sql; each attempt is undone as soon as it is measured, so every role
-- meets the same objects.

begin;

select plan(160);

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


-- Tries one statement as the signed-in role and always undoes it: 'refused' when a row rule
-- stops it, else the number of rows it touched.
grant usage on schema tests to anon;
create function tests.attempt(stmt text) returns text language plpgsql as $$
declare
  touched integer;
begin
  -- Storage's own switch for deletes; the row rules still decide which rows go.
  perform set_config('storage.allow_delete_query', 'true', true);
  begin
    execute stmt;
    get diagnostics touched = row_count;
    raise exception 'touched %', touched using errcode = 'P0001';
  exception
    when insufficient_privilege then return 'refused';
    when sqlstate 'P0001' then return split_part(sqlerrm, ' ', 2);
  end;
end;
$$;

-- The fixture, written as postgres (which bypasses the row rules) -----------------------------------
--
-- In place of a new office's starting rows (#177): this fixture holds one of each, its own.

delete from public.checklist_template_items;
delete from public.checklist_templates;
delete from public.settings;
delete from public.reminder_defaults;
delete from public.quickbooks_connection;
delete from public.programs;

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
-- Rows whose objects are not stored yet, and the three stored ones.
insert into public.grant_files values
  ('new-letter', 'g1', null, 'agreement', 'a.pdf', 'pdf', 10, 1, 'admin', '2026-10-01'),
  ('new-receipt', 'g1', 'ex1', 'invoice', 'i.pdf', 'pdf', 10, 1, 'admin', '2026-10-01');
insert into public.office_document_versions values
  ('new-v-bookkeeper', 'od1', 2, 'w9.pdf', 'pdf', 40, 1, '2026-10-01', 'bookkeeper', null),
  ('new-v-admin', 'od1', 3, 'w9.pdf', 'pdf', 40, 1, '2026-10-02', 'admin', null);
insert into storage.objects (bucket_id, name) values
  ('grant-files', 'file-letter'), ('grant-files', 'file-receipt'), ('office-documents', 'odv1');

select tests.sign_in('admin');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'admin: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'admin: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'admin: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), '1', 'admin: adds the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), '1', 'admin: adds the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'admin: replaces the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'admin: deletes the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'admin: replaces the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'admin: deletes the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'admin: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), '1', 'admin: adds the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'admin: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'admin: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'admin: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'admin: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'admin: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'admin: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('director');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'director: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'director: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'director: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), '1', 'director: adds the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), '1', 'director: adds the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'director: replaces the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'director: deletes the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'director: replaces the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'director: deletes the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'director: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'director: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'director: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'director: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'director: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'director: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'director: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'director: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('office-manager');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'office-manager: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'office-manager: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'office-manager: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), '1', 'office-manager: adds the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), '1', 'office-manager: adds the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'office-manager: replaces the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'office-manager: deletes the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'office-manager: replaces the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'office-manager: deletes the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'office-manager: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'office-manager: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'office-manager: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'office-manager: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'office-manager: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'office-manager: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'office-manager: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'office-manager: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('bookkeeper');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'bookkeeper: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'bookkeeper: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'bookkeeper: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'bookkeeper: cannot add the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), '1', 'bookkeeper: adds the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'bookkeeper: cannot replace the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'bookkeeper: cannot delete the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'bookkeeper: replaces the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'bookkeeper: deletes the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), '1', 'bookkeeper: adds the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'bookkeeper: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'bookkeeper: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'bookkeeper: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'bookkeeper: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'bookkeeper: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'bookkeeper: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'bookkeeper: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('teacher');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'teacher: cannot read grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'teacher: cannot read grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'teacher: cannot read office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'teacher: cannot add the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), 'refused', 'teacher: cannot add the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'teacher: cannot replace the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'teacher: cannot delete the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'teacher: cannot replace the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'teacher: cannot delete the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'teacher: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'teacher: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'teacher: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'teacher: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'teacher: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'teacher: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'teacher: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'teacher: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('assistant');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'assistant: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'assistant: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'assistant: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), '1', 'assistant: adds the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), 'refused', 'assistant: cannot add the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'assistant: replaces the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'assistant: deletes the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'assistant: cannot replace the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'assistant: cannot delete the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'assistant: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'assistant: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'assistant: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'assistant: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'assistant: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'assistant: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'assistant: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'assistant: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('read-only');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '1', 'read-only: reads grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '1', 'read-only: reads grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '1', 'read-only: reads office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'read-only: cannot add the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), 'refused', 'read-only: cannot add the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'read-only: cannot replace the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'read-only: cannot delete the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'read-only: cannot replace the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'read-only: cannot delete the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'read-only: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'read-only: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'read-only: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'read-only: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'read-only: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'read-only: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'read-only: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'read-only: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('archived');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'archived: cannot read grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'archived: cannot read grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'archived: cannot read office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'archived: cannot add the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), 'refused', 'archived: cannot add the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'archived: cannot replace the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'archived: cannot delete the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'archived: cannot replace the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'archived: cannot delete the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'archived: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'archived: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'archived: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'archived: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'archived: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'archived: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'archived: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'archived: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('no-login');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'no-login: cannot read grant-files/file-letter');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'no-login: cannot read grant-files/file-receipt');
select is(tests.attempt($$select 1 from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'no-login: cannot read office-documents/odv1');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'no-login: cannot add the object of a grant''s own file');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-receipt')$$), 'refused', 'no-login: cannot add the object of an expense''s backup');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'no-login: cannot replace the object of a grant''s own file');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-letter'$$), '0', 'no-login: cannot delete the object of a grant''s own file');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'no-login: cannot replace the object of an expense''s backup');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'grant-files' and name = 'file-receipt'$$), '0', 'no-login: cannot delete the object of an expense''s backup');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-bookkeeper')$$), 'refused', 'no-login: cannot add the object of a version added by bookkeeper');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'new-v-admin')$$), 'refused', 'no-login: cannot add the object of a version added by admin');
select is(tests.attempt($$update storage.objects set metadata = '{}' where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'no-login: cannot overwrite a version''s object');
select is(tests.attempt($$delete from storage.objects where bucket_id = 'office-documents' and name = 'odv1'$$), '0', 'no-login: cannot delete a version''s object');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'stray')$$), 'refused', 'no-login: cannot add a name with no row');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'file-letter/x.pdf')$$), 'refused', 'no-login: cannot add a folder path');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'odv1')$$), 'refused', 'no-login: cannot add an office version id in the grant bucket');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'file-letter')$$), 'refused', 'no-login: cannot add a grant file id in the office bucket');
select tests.sign_out();
select tests.sign_in('bookkeeper');
insert into public.office_document_versions values ('stamped-v', 'od1', 4, 'w9.pdf', 'pdf', 40, 1, '2026-10-03', 'admin', null);
select is((select added_by from public.office_document_versions where id = 'stamped-v'), 'bookkeeper', 'a money role naming someone else in added_by is recorded as the adder');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'stamped-v')$$), '1', 'so the person who inserted the row may add its object');
select tests.sign_out();
select tests.sign_in('admin');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('office-documents', 'stamped-v')$$), 'refused', 'and the person it named may not');
select tests.sign_out();
select set_config('role', 'anon', true);
select is(tests.attempt($$select 1 from storage.objects where name = 'file-letter'$$), '0', 'the signed-out cannot read');
select is(tests.attempt($$insert into storage.objects (bucket_id, name) values ('grant-files', 'new-letter')$$), 'refused', 'the signed-out cannot add');
select tests.sign_out();
select is_empty($$ select id from storage.buckets where id in ('grant-files', 'office-documents') and public $$, 'neither bucket is public');
select results_eq($$ select count(*)::int from storage.buckets where id in ('grant-files', 'office-documents') and file_size_limit = 26214400 and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] $$, array[2], 'both buckets carry the size limit and the FileFormat types');

select * from finish();
rollback;
