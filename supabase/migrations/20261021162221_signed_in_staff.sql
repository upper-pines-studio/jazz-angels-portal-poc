-- Who has signed in (#160; decision 0009, "Sign-in, and how a login is tied to a staff record").
--
-- After Supabase Auth accepts an email and password, the portal has to know which staff record
-- that account is, and whether it may go on: decision 0001 refuses a sign-in with no staff record
-- and one whose record is archived, each with its own sentence. `logins` is readable only by an
-- Admin or a Director (#154), and `private.current_staff_id()` returns nothing in both refused
-- cases, so neither tells the two apart. This function does, for the caller only.
--
-- It returns one row, the caller's `staff_id` and whether that record is archived, or no row when
-- the account has no `logins` row. It takes no argument and asks `auth.uid()` itself, so it never
-- answers for anyone else, and it says nothing about the record beyond its id. Security definer
-- to read `logins` and `staff` whatever their policies say; an empty search_path.

create function public.signed_in_staff()
returns table (staff_id text, archived boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.staff_id, s.archived_at is not null
    from public.logins l
    join public.staff s on s.id = l.staff_id
   where l.auth_user_id = (select auth.uid())
$$;

revoke execute on function public.signed_in_staff() from public, anon;
grant execute on function public.signed_in_staff() to authenticated;

comment on function public.signed_in_staff() is
  'The caller''s staff_id through logins and whether that record is archived; no row with no login (#160).';
