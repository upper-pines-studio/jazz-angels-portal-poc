-- docs/SCHEMA.md, "Row-level security" (decision 0001, decision 0009, #154): who is signed in,
-- and each table's read and write policies, table by table as the schema's table has them.
--
-- `private.current_staff_id()` and `private.current_role()` turn the request's Supabase user
-- into their staff id and `staff.role` through `logins`. Both are null when the user has no
-- `logins` row or their staff record is archived, so such a person reads and writes nothing:
-- every policy below needs a role, even "everyone signed in". The role is read from the table
-- on each request, never from the token (nothing in `user_metadata` decides access).
--
-- Every policy is `to authenticated` and calls the two functions as `(select ...)`, so they run
-- once per statement, not once per row. There is one permissive policy per table and command.
-- Rules a policy cannot express, because they need the row before and after (transitions, own
-- role, own approval as a sentence, the closed roll, Operations, the "by" columns, which
-- QuickBooks columns a write may touch), are triggers (#155).

-- Roles: the seven of decision 0001 ------------------------------------------------------------
--   admin, director, office-manager, bookkeeper, teacher, assistant, read-only

-- Who is signed in, in a schema the REST API does not expose -------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Security definer, so that it reads `logins` and `staff` whatever their own policies say
-- (`logins` is readable only by an Admin or a Director), and with an empty search_path. It asks
-- `auth.uid()` itself: it takes no argument, so it only ever answers for the caller.
create function private.current_staff_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.staff_id
    from public.logins l
    join public.staff s on s.id = l.staff_id
   where l.auth_user_id = (select auth.uid())
     and s.archived_at is null
$$;

create function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
    from public.logins l
    join public.staff s on s.id = l.staff_id
   where l.auth_user_id = (select auth.uid())
     and s.archived_at is null
$$;

revoke execute on function private.current_staff_id() from public, anon;
revoke execute on function private.current_role() from public, anon;
grant execute on function private.current_staff_id() to authenticated;
grant execute on function private.current_role() to authenticated;

comment on function private.current_staff_id() is
  'The signed-in person''s staff id through logins; null with no login or an archived record (decision 0009).';
comment on function private.current_role() is
  'The signed-in person''s staff.role through logins; null with no login or an archived record (decision 0009).';

-- Nothing for anon; no truncate (which skips row level security) for anyone signed in -----------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- The tables whose rule is "these roles read, these roles write" ---------------------------------
--
-- A helper for this migration only, dropped at the end: one read policy, and an insert, update
-- (`using` and `with check` alike) and delete policy for the commands listed. Readers null means
-- everyone signed in. Every writer is also a reader (an update needs the row to be readable).

create function private.role_is(roles text[])
returns text
language sql
immutable
as $$
  select case
    when roles is null then '(select private.current_role()) is not null'
    else format('(select private.current_role()) = any (%L::text[])', roles)
  end
$$;

create procedure private.role_policies(
  tab text,
  readers text[],
  writers text[],
  commands text[] default array['insert', 'update', 'delete']
)
language plpgsql
as $$
begin
  execute format('create policy "read" on public.%I for select to authenticated using (%s)',
    tab, private.role_is(readers));
  if 'insert' = any (commands) then
    execute format('create policy "insert" on public.%I for insert to authenticated with check (%s)',
      tab, private.role_is(writers));
  end if;
  if 'update' = any (commands) then
    execute format('create policy "update" on public.%I for update to authenticated using (%s) with check (%s)',
      tab, private.role_is(writers), private.role_is(writers));
  end if;
  if 'delete' = any (commands) then
    execute format('create policy "delete" on public.%I for delete to authenticated using (%s)',
      tab, private.role_is(writers));
  end if;
end;
$$;

do $$
declare
  -- Who reads or writes, by the 0001 row it comes from.
  everyone constant text[] := null;
  staff_and_roles constant text[] := array['admin', 'director'];
  office constant text[] := array['admin', 'director', 'office-manager'];
  money constant text[] := array['admin', 'director', 'office-manager', 'bookkeeper'];
  all_but_teacher constant text[] :=
    array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only'];
  grant_writers constant text[] := array['admin', 'director', 'office-manager', 'assistant'];
  transaction_readers constant text[] :=
    array['admin', 'director', 'office-manager', 'bookkeeper', 'read-only'];
  schedule_readers constant text[] :=
    array['admin', 'director', 'office-manager', 'teacher', 'assistant', 'read-only'];
  -- Archived tables are never deleted (decision 0002); singletons are one row, never deleted.
  no_delete constant text[] := array['insert', 'update'];
  tab text;
begin
  -- Staff and roles. Nobody changes their own role: a trigger (#155).
  call private.role_policies('staff', everyone, staff_and_roles, no_delete);

  -- Programs: add, rename, archive. Operations is never archived, renamed or in-school (#155).
  call private.role_policies('programs', everyone, office, no_delete);

  -- Program budgets and projects.
  call private.role_policies('program_budgets', all_but_teacher, money);
  call private.role_policies('projects', all_but_teacher, money, no_delete);

  -- Partners and venues.
  call private.role_policies('organizations', everyone, office, no_delete);
  call private.role_policies('venues', everyone, office, no_delete);

  -- Office documents; versions are insert-only.
  call private.role_policies('office_documents', all_but_teacher, money, no_delete);
  call private.role_policies('office_document_versions', all_but_teacher, money, array['insert']);

  -- Modules, import, export: the settings row.
  call private.role_policies('settings', everyone, array['admin'], no_delete);

  -- Grants: pipeline, checklist, deadlines. The award amount and a move into Awarded and after
  -- also need "Award, budget, reports" (#155).
  call private.role_policies('funders', all_but_teacher, grant_writers, no_delete);
  call private.role_policies('grants', all_but_teacher, grant_writers, no_delete);
  call private.role_policies('reminder_defaults', all_but_teacher, grant_writers, no_delete);
  foreach tab in array array['grant_programs', 'tasks', 'grant_documents', 'checklist_templates',
    'checklist_template_items', 'reminder_plans', 'reminder_plan_recipients',
    'reminder_default_recipients']
  loop
    call private.role_policies(tab, all_but_teacher, grant_writers);
  end loop;

  -- Award, budget, reports; grant shares; staff pay charged to grants (0001, October 2026).
  foreach tab in array array['payments', 'award_terms', 'reports', 'budget_versions',
    'budget_lines', 'budget_line_amounts', 'budget_line_accounts', 'expenses', 'grant_targets',
    'grant_shares', 'time_charges']
  loop
    call private.role_policies(tab, all_but_teacher, money);
  end loop;

  -- Transactions: assign, split. A transaction comes from QuickBooks and is never deleted; which
  -- of its columns a person may change is a trigger (#155).
  call private.role_policies('transactions', transaction_readers, money, no_delete);
  call private.role_policies('split_rules', transaction_readers, money);
  call private.role_policies('split_rule_parts', transaction_readers, money);

  -- QuickBooks: sync brings the accounts and classes.
  call private.role_policies('qb_accounts', all_but_teacher, money, no_delete);
  call private.role_policies('qb_classes', all_but_teacher, money, no_delete);

  -- Schedule and classes. Sessions and ensembles are archived, never deleted.
  call private.role_policies('terms', schedule_readers, office, no_delete);
  call private.role_policies('ensembles', schedule_readers, office, no_delete);
end;
$$;

drop procedure private.role_policies(text, text[], text[], text[]);
drop function private.role_is(text[]);

-- Staff and roles: logins -------------------------------------------------------------------------
-- Read by an Admin or a Director. Written only by the invitation (#157), with the secret key,
-- so there is no write policy: nobody signed in inserts, changes or deletes a login.

create policy "read" on public.logins for select to authenticated
  using ((select private.current_role()) = any (array['admin', 'director']));

-- QuickBooks: connect (Admin) and sync (the money roles) ------------------------------------------
-- Connecting makes the row; syncing updates `last_synced_at`. Only an Admin changing `connected`
-- or `company` needs the row before and after (#155).

create policy "read" on public.quickbooks_connection for select to authenticated
  using ((select private.current_role()) = any (
    array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only']));
create policy "insert" on public.quickbooks_connection for insert to authenticated
  with check ((select private.current_role()) = 'admin');
create policy "update" on public.quickbooks_connection for update to authenticated
  using ((select private.current_role()) = any (
    array['admin', 'director', 'office-manager', 'bookkeeper']))
  with check ((select private.current_role()) = any (
    array['admin', 'director', 'office-manager', 'bookkeeper']));

-- Grant files: a grant's own files follow "Grants: pipeline", an expense's backup follows
-- "Award, budget, reports". Both are read by everyone but the Teacher. ----------------------------

create policy "read" on public.grant_files for select to authenticated
  using ((select private.current_role()) = any (
    array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only']));
create policy "insert" on public.grant_files for insert to authenticated
  with check (
    (expense_id is null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant']))
    or (expense_id is not null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'bookkeeper']))
  );
create policy "update" on public.grant_files for update to authenticated
  using (
    (expense_id is null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant']))
    or (expense_id is not null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'bookkeeper']))
  )
  with check (
    (expense_id is null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant']))
    or (expense_id is not null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'bookkeeper']))
  );
create policy "delete" on public.grant_files for delete to authenticated
  using (
    (expense_id is null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant']))
    or (expense_id is not null and (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'bookkeeper']))
  );

-- Schedule and classes: meetings. A Teacher closes and reopens the roll on their own classes'
-- meetings; that they change only `roll_submitted_at` is a trigger (#155). ------------------------

create policy "read" on public.class_meetings for select to authenticated
  using ((select private.current_role()) = any (
    array['admin', 'director', 'office-manager', 'teacher', 'assistant', 'read-only']));
create policy "insert" on public.class_meetings for insert to authenticated
  with check ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));
create policy "update" on public.class_meetings for update to authenticated
  using (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and ensemble_id in (
          select e.id from public.ensembles e
           where e.lead_staff_id = (select private.current_staff_id())))
  )
  with check (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and ensemble_id in (
          select e.id from public.ensembles e
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "delete" on public.class_meetings for delete to authenticated
  using ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));

-- Students: names, attendance. A Teacher reads their own classes' students; Read-only gets
-- counts only, never the rows; the Bookkeeper nothing. Archived, never deleted. -------------------

create policy "read" on public.students for select to authenticated
  using (
    (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant'])
    or ((select private.current_role()) = 'teacher'
        and ensemble_id in (
          select e.id from public.ensembles e
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "insert" on public.students for insert to authenticated
  with check ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));
create policy "update" on public.students for update to authenticated
  using ((select private.current_role()) = any (array['admin', 'director', 'office-manager']))
  with check ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));

-- Guardian contact details: the Admin, the Director, the Office manager, and a Teacher for their
-- own classes' students. Never the Office assistant, the Bookkeeper or Read-only. -----------------

create policy "read" on public.student_private for select to authenticated
  using (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and student_id in (
          select s.id from public.students s
            join public.ensembles e on e.id = s.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "insert" on public.student_private for insert to authenticated
  with check ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));
create policy "update" on public.student_private for update to authenticated
  using ((select private.current_role()) = any (array['admin', 'director', 'office-manager']))
  with check ((select private.current_role()) = any (array['admin', 'director', 'office-manager']));

-- Roll call: any class for the Admin, the Director and the Office manager; a Teacher their own
-- classes' meetings. The Office assistant reads. Nothing once the roll is submitted (#155). -------

create policy "read" on public.attendance for select to authenticated
  using (
    (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'assistant'])
    or ((select private.current_role()) = 'teacher'
        and meeting_id in (
          select m.id from public.class_meetings m
            join public.ensembles e on e.id = m.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "insert" on public.attendance for insert to authenticated
  with check (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and meeting_id in (
          select m.id from public.class_meetings m
            join public.ensembles e on e.id = m.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "update" on public.attendance for update to authenticated
  using (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and meeting_id in (
          select m.id from public.class_meetings m
            join public.ensembles e on e.id = m.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  )
  with check (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and meeting_id in (
          select m.id from public.class_meetings m
            join public.ensembles e on e.id = m.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  );
create policy "delete" on public.attendance for delete to authenticated
  using (
    (select private.current_role()) = any (array['admin', 'director', 'office-manager'])
    or ((select private.current_role()) = 'teacher'
        and meeting_id in (
          select m.id from public.class_meetings m
            join public.ensembles e on e.id = m.ensemble_id
           where e.lead_staff_id = (select private.current_staff_id())))
  );

-- Timesheets: own hours for every role but Read-only; every entry for the roles that approve. ----
--
-- Own hours: inserted as a draft; changed while a draft or submitted (change, submit, recall);
-- deleted while a draft; never approved by their own person (the new row may not be approved).
-- Approvers (Admin, Director, Office manager, Bookkeeper) change someone else's submitted or
-- approved entry (approve, send back), never their own through this branch. Which step goes
-- where, and the sentence for an own approval, are triggers (#155).

create policy "read" on public.time_entries for select to authenticated
  using (
    (staff_id = (select private.current_staff_id())
      and (select private.current_role()) <> 'read-only')
    or (select private.current_role()) = any (
      array['admin', 'director', 'office-manager', 'bookkeeper'])
  );
create policy "insert" on public.time_entries for insert to authenticated
  with check (
    staff_id = (select private.current_staff_id())
    and (select private.current_role()) <> 'read-only'
    and status = 'draft'
  );
create policy "update" on public.time_entries for update to authenticated
  using (
    (staff_id = (select private.current_staff_id())
      and (select private.current_role()) <> 'read-only'
      and status in ('draft', 'submitted'))
    or (staff_id <> (select private.current_staff_id())
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper'])
      and status in ('submitted', 'approved'))
  )
  with check (
    (staff_id = (select private.current_staff_id())
      and (select private.current_role()) <> 'read-only'
      and status in ('draft', 'submitted'))
    or (staff_id <> (select private.current_staff_id())
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper']))
  );
create policy "delete" on public.time_entries for delete to authenticated
  using (
    staff_id = (select private.current_staff_id())
    and (select private.current_role()) <> 'read-only'
    and status = 'draft'
  );

-- The activity log: read by whoever may read the subject's row; inserted with the change it
-- records, by whoever may make that change; never updated or deleted. -----------------------------
--
-- A grant's or a funder's line: changes to a grant come from "Grants: pipeline" and from
-- "Award, budget, reports", so everyone who reads grants but Read-only writes one. A time entry's
-- step: whoever may read the entry reads it; its person (not Read-only) or an approver of
-- someone else's entry writes it.

create policy "read" on public.activity for select to authenticated
  using (
    (subject_kind in ('grant', 'funder')
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only']))
    or (subject_kind = 'time-entry'
      and exists (select 1 from public.time_entries t where t.id = activity.subject_id))
  );
create policy "insert" on public.activity for insert to authenticated
  with check (
    (subject_kind in ('grant', 'funder')
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant']))
    or (subject_kind = 'time-entry'
      and exists (
        select 1 from public.time_entries t
         where t.id = activity.subject_id
           and ((t.staff_id = (select private.current_staff_id())
                 and (select private.current_role()) <> 'read-only')
             or (t.staff_id <> (select private.current_staff_id())
                 and (select private.current_role()) = any (
                   array['admin', 'director', 'office-manager', 'bookkeeper'])))))
  );
