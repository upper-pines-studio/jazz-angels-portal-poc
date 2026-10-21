-- docs/SCHEMA.md, "Things to know when building it" > "Triggers for what a row policy cannot
-- express" (#155). A policy sees the old row or the new one, never both, so these rules are
-- `before` triggers:
--
--   - the "by" columns ("Who did it") and `budget_versions.added_at` ("When"), set from the
--     signed-in person and today whatever the change sent;
--   - a time entry's transitions, and never approving or sending back one's own;
--   - a report deleted only before it is sent, a payment only before it is received;
--   - the closed roll: no attendance row inserted, changed or deleted once its meeting's
--     roll is submitted;
--   - Operations (`general-operating`) never archived, renamed or made in-school;
--   - what #154's policies leave to a trigger because they need the old row: nobody changes
--     their own role or archives themself; only an Admin connects QuickBooks; a Teacher changes
--     only the roll (and its notes) on a meeting; nobody signed in changes a transaction's
--     QuickBooks columns; whoever approves hours changes nothing of what was worked.
--
-- Each refusal raises the sentence the store refuses with today (the slices' `*_REFUSAL`
-- constants, `refusalMessage` for a role), so the Supabase repository can show the database's
-- message as it is. Who may not do it (one's own hours or role, a role's refusal) is errcode
-- `insufficient_privilege` (42501), as a row policy's refusal is; what the row's state does not
-- allow is `check_violation` (23514).
--
-- Same-event triggers on a table fire in name order: the stamps are named `a_stamp_*` and the
-- rules `b_*`, so a rule sees the "by" columns as the database set them (an approval's
-- `approved_by` is the signed-in person's id before "Nobody approves their own hours" is
-- checked).
--
-- Every function here is `security definer` with an empty `search_path`: a trigger reads
-- `logins`, `staff` and `class_meetings` whatever the signed-in person's own policies (#154)
-- let them read. They live in `private`, which the API does not expose. Like #154's two
-- functions each is executable by `authenticated` only; a trigger function cannot be called
-- except as a trigger.

-- Who is signed in: `private.current_staff_id()` and `private.current_role()`, from #154's row
-- rules migration (null with no login or an archived record).

-- "You can't do that as a Teacher.": what the store says when a role may not make a change
-- (`refusalMessage` in src/core/permissions.ts, with ROLE_LABELS from src/core/roles.ts).
create or replace function private.role_refusal(role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'admin' then 'You can''t do that as an Admin.'
    when 'director' then 'You can''t do that as a Director.'
    when 'office-manager' then 'You can''t do that as an Office manager.'
    when 'bookkeeper' then 'You can''t do that as a Bookkeeper.'
    when 'teacher' then 'You can''t do that as a Teacher.'
    when 'assistant' then 'You can''t do that as an Office assistant.'
    when 'read-only' then 'You can''t do that as a Read-only user.'
    else 'You can''t do that.'
  end
$$;
revoke execute on function private.role_refusal(text) from public, anon;
grant execute on function private.role_refusal(text) to authenticated;

-- The "by" columns -------------------------------------------------------------------------------

-- One trigger per "by" column: `tg_argv[0]` is the column, the rest its companions, the
-- columns that record the act it names (`archived_at` for `archived_by`). The value sent for
-- the column itself is never read. On insert it is the signed-in person when a companion is
-- set, null when none is. On update it is the signed-in person when a companion changes, null
-- when every companion is cleared (a restore, a send back), and stays as stored otherwise, so
-- an edit to another column, or a "by" column sent alone, never moves the credit.
--
-- With nobody signed in (`auth.uid()` null: the service role, the switch-over load, the
-- QuickBooks sync, a migration) the row is written as sent. Those connections bypass the row
-- policies already, and the switch-over brings in who did what before the portal existed.
create or replace function private.stamp_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text := tg_argv[0];
  companions text[] := tg_argv[1:];
  n jsonb := to_jsonb(new);
  o jsonb;
  me jsonb;
  cleared boolean;
  moved boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  me := coalesce(to_jsonb(private.current_staff_id()), 'null'::jsonb);

  if tg_op = 'INSERT' then
    if exists (select 1 from unnest(companions) c where n ->> c is not null) then
      n := jsonb_set(n, array[col], me);
    else
      n := jsonb_set(n, array[col], 'null'::jsonb);
    end if;
  else
    o := to_jsonb(old);
    cleared := not exists (select 1 from unnest(companions) c where n ->> c is not null);
    moved := exists (select 1 from unnest(companions) c where (n -> c) is distinct from (o -> c));
    if cleared then
      n := jsonb_set(n, array[col], 'null'::jsonb);
    elsif moved then
      n := jsonb_set(n, array[col], me);
    else
      n := jsonb_set(n, array[col], o -> col);
    end if;
  end if;

  new := jsonb_populate_record(new, n);
  return new;
end;
$$;
revoke execute on function private.stamp_by() from public, anon;
grant execute on function private.stamp_by() to authenticated;

-- "When": a budget version is added today, whatever the insert sent, and keeps that date.
create or replace function private.stamp_added_today()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.added_at := current_date;
  else
    new.added_at := old.added_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.stamp_added_today() from public, anon;
grant execute on function private.stamp_added_today() to authenticated;

-- `archived_by` on every archivable table (decision 0002).
do $$
declare
  t text;
begin
  foreach t in array array[
    'staff', 'programs', 'projects', 'organizations', 'venues', 'office_documents',
    'funders', 'grants', 'terms', 'ensembles', 'students'
  ] loop
    execute format(
      'create trigger a_stamp_archived_by before insert or update on public.%I
         for each row execute function private.stamp_by(%L, %L)',
      t, 'archived_by', 'archived_at'
    );
  end loop;
end;
$$;

create trigger a_stamp_invited_by before insert or update on public.logins
  for each row execute function private.stamp_by('invited_by', 'invited_at');

create trigger a_stamp_added_by before insert or update on public.office_document_versions
  for each row execute function private.stamp_by('added_by', 'added_at');

-- Named so the date is set before `added_by` reads it: "added_at" sorts before "added_by".
create trigger a_stamp_added_at before insert or update on public.budget_versions
  for each row execute function private.stamp_added_today();
create trigger a_stamp_added_by before insert or update on public.budget_versions
  for each row execute function private.stamp_by('added_by', 'added_at');

create trigger a_stamp_who_id before insert or update on public.activity
  for each row execute function private.stamp_by('who_id', 'at');

create trigger a_stamp_assigned_by before insert or update on public.transactions
  for each row execute function private.stamp_by('assigned_by', 'assigned_at');

create trigger a_stamp_uploaded_by before insert or update on public.grant_files
  for each row execute function private.stamp_by('uploaded_by', 'uploaded_at');

create trigger a_stamp_photo_release_recorded_by before insert or update on public.student_private
  for each row execute function
    private.stamp_by('photo_release_recorded_by', 'photo_release', 'photo_release_date');

create trigger a_stamp_charged_by before insert or update on public.time_charges
  for each row execute function private.stamp_by('charged_by', 'charged_at');

-- A time entry's two: who approved it, and who sent it back. `sent_back_by` moves with
-- `sent_back_at` only, so resubmitting (which clears the reason) keeps who sent it back.
create trigger a_stamp_approved_by before insert or update on public.time_entries
  for each row execute function private.stamp_by('approved_by', 'approved_at');
create trigger a_stamp_sent_back_by before insert or update on public.time_entries
  for each row execute function private.stamp_by('sent_back_by', 'sent_back_at');

-- Time entries: transitions, and never one's own approval -----------------------------------------

-- The store's sentences (src/modules/timesheets/domain/derive.ts). Approving a draft has none
-- there, because no screen offers the move.
create or replace function private.time_entry_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_hours constant text := 'Nobody approves their own hours.';
  own_send_back constant text := 'Nobody sends back their own hours.';
  draft_only_delete constant text :=
    'Only a draft can be deleted. Recall a submitted entry first; approved hours stay on the record.';
  approved_stays constant text :=
    'These hours are approved, so they stay as they are. If something is wrong, the office can send them back to you.';
  draft_only_change constant text :=
    'Only a draft can be changed. Recall a submitted entry first; approved hours are sent back by the office to fix.';
  send_back_approved_only constant text :=
    'Only approved hours are sent back. Hours still waiting are approved, or recalled by their person.';
  send_back_reason constant text := 'Say what needs fixing, so they know what to change.';
  approve_submitted_only constant text :=
    'Only submitted hours are approved. Their person submits a draft first.';
  worked_changed boolean;
  -- Who is acting, when someone is signed in; with nobody signed in, the row's own columns.
  actor text := case when (select auth.uid()) is not null then private.current_staff_id() end;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = 'check_violation', message = draft_only_delete;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- That new hours start as a draft is #154's insert policy; the switch-over, with nobody
    -- signed in, brings in hours already submitted or approved.
    if new.approved_by = new.staff_id then
      raise exception using errcode = 'insufficient_privilege', message = own_hours;
    end if;
    return new;
  end if;

  -- The same row sent again (a retry) changes nothing, so nothing is refused.
  if new is not distinct from old then
    return new;
  end if;

  if new.approved_by is distinct from old.approved_by and new.approved_by = new.staff_id then
    raise exception using errcode = 'insufficient_privilege', message = own_hours;
  end if;
  if new.sent_back_by is distinct from old.sent_back_by and new.sent_back_by = new.staff_id then
    raise exception using errcode = 'insufficient_privilege', message = own_send_back;
  end if;

  -- What was worked: who, when, on what and for how long. Only a draft changes it.
  worked_changed := (new.staff_id, new.date, new.program_id, new.ensemble_id, new.activity, new.hours)
    is distinct from
    (old.staff_id, old.date, old.program_id, old.ensemble_id, old.activity, old.hours);
  -- Whoever approves someone's hours changes only the approval or the send back (decision 0001:
  -- each person logs their own). The store's sentence for a change it does not allow.
  if worked_changed and actor is not null and actor <> old.staff_id then
    raise exception using errcode = 'insufficient_privilege',
      message = private.role_refusal(private.current_role());
  end if;
  if worked_changed and old.status <> 'draft' then
    raise exception using errcode = 'check_violation', message = draft_only_change;
  end if;

  case old.status
    when 'draft' then
      if new.status = 'approved' then
        raise exception using errcode = 'check_violation', message = approve_submitted_only;
      end if;
    when 'submitted' then
      -- Back to draft is a recall by its person; a send back is only for approved hours.
      if new.status = 'draft' and new.sent_back_by is distinct from old.sent_back_by then
        raise exception using errcode = 'check_violation', message = send_back_approved_only;
      end if;
      -- An approval: by the signed-in person, never on their own hours.
      if new.status = 'approved' then
        if actor is not null then
          new.approved_by := actor;
        end if;
        if new.approved_by = new.staff_id then
          raise exception using errcode = 'insufficient_privilege', message = own_hours;
        end if;
      end if;
    when 'approved' then
      if new.status = 'submitted' then
        raise exception using errcode = 'check_violation', message = approved_stays;
      elsif new.status = 'draft' then
        -- A send back records when and why; back to draft without either is a recall.
        if new.sent_back_at is not distinct from old.sent_back_at
           and new.sent_back_reason is not distinct from old.sent_back_reason then
          raise exception using errcode = 'check_violation', message = approved_stays;
        end if;
        -- By the signed-in person, never on their own hours, with a reason.
        if actor is not null then
          new.sent_back_by := actor;
        end if;
        if new.sent_back_by is null then
          raise exception using errcode = 'check_violation', message = approved_stays;
        end if;
        if new.sent_back_by = new.staff_id then
          raise exception using errcode = 'insufficient_privilege', message = own_send_back;
        end if;
        if nullif(btrim(new.sent_back_reason), '') is null then
          raise exception using errcode = 'check_violation', message = send_back_reason;
        end if;
      else
        -- Still approved, with something else changed.
        raise exception using errcode = 'check_violation', message = approved_stays;
      end if;
    else
      null;
  end case;

  return new;
end;
$$;
revoke execute on function private.time_entry_rules() from public, anon;
grant execute on function private.time_entry_rules() to authenticated;

create trigger b_time_entry_rules before insert or update or delete on public.time_entries
  for each row execute function private.time_entry_rules();

-- Reports and payments: what has happened stays (decision 0002) -----------------------------------

-- src/modules/grants/domain/slice.ts: REPORT_SENT_REFUSAL, and `isReportOpen` for "sent".
create or replace function private.report_delete_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.submitted_date is not null or old.status in ('submitted', 'accepted') then
    raise exception using errcode = 'check_violation', message =
      'A report that has been sent stays on the record. Set its status back first if it was marked by mistake.';
  end if;
  return old;
end;
$$;
revoke execute on function private.report_delete_rule() from public, anon;
grant execute on function private.report_delete_rule() to authenticated;

create trigger b_report_delete_rule before delete on public.reports
  for each row execute function private.report_delete_rule();

-- src/modules/grants/domain/slice.ts: PAYMENT_RECEIVED_REFUSAL.
create or replace function private.payment_delete_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.received_date is not null then
    raise exception using errcode = 'check_violation', message =
      'A payment that has arrived stays on the record. Clear its received date first if it was entered by mistake.';
  end if;
  return old;
end;
$$;
revoke execute on function private.payment_delete_rule() from public, anon;
grant execute on function private.payment_delete_rule() to authenticated;

create trigger b_payment_delete_rule before delete on public.payments
  for each row execute function private.payment_delete_rule();

-- The closed roll ------------------------------------------------------------------------------

-- A mark is written only while its meeting's roll is open: the old meeting's and the new one's
-- on a change. The store has no sentence (`setMark` does nothing on a closed roll); this one is
-- its comment's.
--
-- Submit roll call is one change: the last marks and the closed roll together, saved or not at
-- all (`submitRollCall`). `apply` (#156) writes parents first, so the meeting is closed before
-- its marks are written. A roll closed in this same transaction is therefore still open to
-- marks until the transaction ends: `private.note_roll_closed` keeps the ids of the meetings
-- closed (or added already closed) in it, in a setting local to the transaction (rolled back
-- with a savepoint, gone at commit). A roll closed by an earlier change takes no marks. The
-- setting is only a way to let more marks in during the closing change: the REST API cannot
-- set it, since nothing it exposes calls `set_config`.
create or replace function private.note_roll_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.roll_submitted_at is null
     or (tg_op = 'UPDATE' and old.roll_submitted_at is not null) then
    return null;
  end if;
  perform set_config(
    'ja.rolls_closed_now',
    (coalesce(nullif(current_setting('ja.rolls_closed_now', true), ''), '[]')::jsonb
      || to_jsonb(new.id))::text,
    true
  );
  return null;
end;
$$;
revoke execute on function private.note_roll_closed() from public, anon;
grant execute on function private.note_roll_closed() to authenticated;

create trigger note_roll_closed after insert or update of roll_submitted_at
  on public.class_meetings
  for each row execute function private.note_roll_closed();

create or replace function private.attendance_roll_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_now jsonb :=
    coalesce(nullif(current_setting('ja.rolls_closed_now', true), ''), '[]')::jsonb;
begin
  if exists (
    select 1
      from public.class_meetings m
     where m.roll_submitted_at is not null
       and not closed_now ? m.id
       and m.id in (
         case when tg_op <> 'INSERT' then old.meeting_id end,
         case when tg_op <> 'DELETE' then new.meeting_id end
       )
  ) then
    raise exception using errcode = 'check_violation', message =
      'This roll call has been submitted. Reopen it before changing a mark.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.attendance_roll_rule() from public, anon;
grant execute on function private.attendance_roll_rule() to authenticated;

create trigger b_attendance_roll_rule before insert or update or delete on public.attendance
  for each row execute function private.attendance_roll_rule();

-- Operations ---------------------------------------------------------------------------------

-- src/core/derive.ts: OPERATIONS_ARCHIVE_REFUSAL, OPERATIONS_RENAME_REFUSAL (name or short),
-- OPERATIONS_IN_SCHOOL_REFUSAL (decision 0006). Checked in the store's order: in-school first.
create or replace function private.operations_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> 'general-operating' then
    return new;
  end if;
  if new.in_school then
    raise exception using errcode = 'check_violation', message =
      'Operations can''t be in-school. It is the office''s running costs, not a program.';
  end if;
  if new.archived_at is not null then
    raise exception using errcode = 'check_violation', message =
      'Operations can''t be archived. It is the office''s running costs, not a program.';
  end if;
  if tg_op = 'UPDATE' and (new.name, new.short) is distinct from (old.name, old.short) then
    raise exception using errcode = 'check_violation', message = 'Operations can''t be renamed.';
  end if;
  return new;
end;
$$;
revoke execute on function private.operations_rule() from public, anon;
grant execute on function private.operations_rule() to authenticated;

create trigger b_operations_rule before insert or update on public.programs
  for each row execute function private.operations_rule();

-- Staff: nobody changes their own role or archives themself ------------------------------------

-- src/core/permissions.ts OWN_ROLE_REFUSAL, and `mayArchiveStaff` in src/core/store.tsx.
create or replace function private.staff_self_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id is distinct from private.current_staff_id() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception using errcode = 'insufficient_privilege', message =
      'You can''t change your own role. Ask someone else who manages staff.';
  end if;
  if old.archived_at is null and new.archived_at is not null then
    raise exception using errcode = 'insufficient_privilege', message =
      'You can''t archive yourself. Ask someone else who manages staff.';
  end if;
  return new;
end;
$$;
revoke execute on function private.staff_self_rule() from public, anon;
grant execute on function private.staff_self_rule() to authenticated;

create trigger b_staff_self_rule before update on public.staff
  for each row execute function private.staff_self_rule();

-- QuickBooks: only an Admin connects -----------------------------------------------------------

-- "QuickBooks: connect" is the Admin's alone (decision 0001); "QuickBooks: sync", which updates
-- `last_synced_at`, is any money role's, and #154's policy lets those through.
create or replace function private.quickbooks_connect_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role text := private.current_role();
begin
  if (select auth.uid()) is null or role = 'admin' then
    return new;
  end if;
  if tg_op = 'INSERT'
     or (new.connected, new.company) is distinct from (old.connected, old.company) then
    raise exception using errcode = 'insufficient_privilege', message = private.role_refusal(role);
  end if;
  return new;
end;
$$;
revoke execute on function private.quickbooks_connect_rule() from public, anon;
grant execute on function private.quickbooks_connect_rule() to authenticated;

create trigger b_quickbooks_connect_rule before insert or update on public.quickbooks_connection
  for each row execute function private.quickbooks_connect_rule();

-- Transactions: QuickBooks' columns are QuickBooks' -----------------------------------------------

-- People change only a transaction's status and who assigned it (SCHEMA.md, "The QuickBooks
-- columns are read-only"); the sync, with nobody signed in, writes the rest. The store has no
-- sentence: no screen offers the change.
create or replace function private.transaction_columns_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.id, new.date, new.payee, new.memo, new.account_code, new.class_id, new.amount, new.ref)
       is distinct from
       (old.id, old.date, old.payee, old.memo, old.account_code, old.class_id, old.amount, old.ref)
  then
    raise exception using errcode = 'check_violation', message =
      'This transaction comes from QuickBooks. Change its details there.';
  end if;
  return new;
end;
$$;
revoke execute on function private.transaction_columns_rule() from public, anon;
grant execute on function private.transaction_columns_rule() to authenticated;

create trigger b_transaction_columns_rule before update on public.transactions
  for each row execute function private.transaction_columns_rule();

-- Meetings: a Teacher takes the roll, the office keeps the schedule ------------------------------

-- A Teacher may update their own classes' meetings (#154) to submit or reopen the roll, and
-- Submit roll call saves the meeting's notes with it (`submitRollCall`). Anything else about a
-- meeting is "Schedule and classes", which a Teacher views.
create or replace function private.meeting_teacher_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_role() is distinct from 'teacher' then
    return new;
  end if;
  if (new.id, new.ensemble_id, new.date, new.start_time, new.end_time, new.venue_id, new.room)
     is distinct from
     (old.id, old.ensemble_id, old.date, old.start_time, old.end_time, old.venue_id, old.room)
  then
    raise exception using errcode = 'insufficient_privilege', message = private.role_refusal('teacher');
  end if;
  return new;
end;
$$;
revoke execute on function private.meeting_teacher_rule() from public, anon;
grant execute on function private.meeting_teacher_rule() to authenticated;

create trigger b_meeting_teacher_rule before update on public.class_meetings
  for each row execute function private.meeting_teacher_rule();
