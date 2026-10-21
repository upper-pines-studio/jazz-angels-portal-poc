-- Invitations (#157; decision 0001, "Sign-ins are by invitation"; decision 0009, "Sign-in").
--
-- The `invite-staff` Edge Function checks who may invite whom, sends Supabase's invitation email
-- with the secret key, and then calls `public.record_invitation`, which writes the `logins` row
-- and its activity line in one transaction. A trigger on `auth.users` sets `accepted_at` the first
-- time the invited person signs in, and writes a second activity line. Both lines have the subject
-- kind `staff` (the staff record that got the sign-in), and every Admin, and the Director who
-- also has "Staff and roles", reads them; nobody signed in writes them.
--
-- A staff record with a login keeps its email: a login needs one, and changing it is refused
-- while the login exists (the address is the one the person signs in with; changing a signed-in
-- person's email is not built yet).

-- The activity log gets a subject kind for a staff record's sign-in ------------------------------

alter table public.activity drop constraint activity_subject_kind_check;
alter table public.activity add constraint activity_subject_kind_check
  check (subject_kind in ('grant', 'funder', 'time-entry', 'staff'));

-- Read as #154 wrote it, plus a sign-in's lines for "Staff and roles" (who also read `logins`).
-- Still no insert for `staff`: only the invitation and the trigger below write those lines.
drop policy "read" on public.activity;
create policy "read" on public.activity for select to authenticated
  using (
    (subject_kind in ('grant', 'funder')
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only']))
    or (subject_kind = 'time-entry'
      and exists (select 1 from public.time_entries t where t.id = activity.subject_id))
    or (subject_kind = 'staff'
      and (select private.current_role()) = any (array['admin', 'director']))
  );

-- The recent sign-in lines are what the dashboard asks for.
create index activity_at_idx on public.activity (subject_kind, at desc);

-- A login needs its staff record's email, which then stays put ------------------------------------

create function private.login_needs_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.staff s where s.id = new.staff_id and s.email is not null
  ) then
    raise exception 'This person needs an email before they can have a sign-in.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- After, not before: the row rules refuse a write first, so nobody signed in learns more than "no".
create trigger login_needs_email
  after insert or update of staff_id on public.logins
  for each row execute function private.login_needs_email();

create function private.login_keeps_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Security definer only to see `logins`, which most roles may not read.
  if new.email is distinct from old.email
     and exists (select 1 from public.logins l where l.staff_id = new.id) then
    raise exception '%''s email can''t change while they have a sign-in: it is the address they sign in with.',
      old.name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- As every function in `private` (#154): not `anon`, and `authenticated`. A trigger function
-- cannot be called directly anyway; the grant only keeps the schema's one rule.
revoke execute on function private.login_needs_email() from public, anon;
revoke execute on function private.login_keeps_email() from public, anon;
grant execute on function private.login_needs_email() to authenticated;
grant execute on function private.login_keeps_email() to authenticated;

create trigger login_keeps_email
  before update of email on public.staff
  for each row execute function private.login_keeps_email();

-- The invitation's writes, for the Edge Function only ---------------------------------------------
--
-- In `public` so the function reaches it through the REST API, but executable only with the
-- secret key (`service_role`): nobody signed in, and nobody signed out, may call it. The function
-- has already checked the rules; the unique `staff_id` and the triggers above still hold here.

create function public.record_invitation(
  auth_user_id uuid,
  staff_id text,
  invited_by text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  invitee public.staff;
begin
  select * into invitee from public.staff s where s.id = record_invitation.staff_id;
  insert into public.logins (auth_user_id, staff_id, invited_by, invited_at)
    values (record_invitation.auth_user_id, record_invitation.staff_id,
      record_invitation.invited_by, now());
  insert into public.activity (id, subject_kind, subject_id, at, who_id, text, detail)
    values (
      'act-' || gen_random_uuid(),
      'staff',
      record_invitation.staff_id,
      now(),
      record_invitation.invited_by,
      format('Sent %s an invitation to sign in, to %s', invitee.name, invitee.email),
      jsonb_build_object('event', 'invited', 'email', invitee.email)
    );
end;
$$;

revoke execute on function public.record_invitation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_invitation(uuid, text, text) to service_role;

comment on function public.record_invitation(uuid, text, text) is
  'The invite-staff Edge Function''s writes: the logins row and its activity line (#157). service_role only.';

-- The first sign-in accepts the invitation --------------------------------------------------------
--
-- Following the invitation's link signs the person in, which sets `auth.users.last_sign_in_at`.
-- The first time that happens to a user with a login not yet accepted, `accepted_at` is set and
-- the line every Admin sees is written. Later sign-ins change nothing here.

create function private.accept_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login public.logins;
begin
  if new.last_sign_in_at is null
     or new.last_sign_in_at is not distinct from old.last_sign_in_at then
    return new;
  end if;
  update public.logins l
     set accepted_at = new.last_sign_in_at
   where l.auth_user_id = new.id
     and l.accepted_at is null
  returning * into login;
  if found then
    insert into public.activity (id, subject_kind, subject_id, at, who_id, text, detail)
      values (
        'act-' || gen_random_uuid(),
        'staff',
        login.staff_id,
        new.last_sign_in_at,
        login.staff_id,
        format('Accepted the invitation from %s and signed in for the first time',
          (select s.name from public.staff s where s.id = login.invited_by)),
        jsonb_build_object('event', 'accepted', 'invited_by', login.invited_by)
      );
  end if;
  return new;
end;
$$;

revoke execute on function private.accept_invitation() from public, anon;
grant execute on function private.accept_invitation() to authenticated;

create trigger accept_invitation
  after update of last_sign_in_at on auth.users
  for each row execute function private.accept_invitation();
