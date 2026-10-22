-- Only an Admin reads the sign-in activity lines (#176).
--
-- The lines with subject kind `staff` (an invitation sent, an invitation accepted) show only on an
-- Admin's dashboard, but the "read" policy from the invitations migration also let a Director read
-- them. Decided in review of #157: only an Admin does. A Director still reads `logins` and still
-- invites (decision 0001); only these lines change. The grant, funder and time-entry parts are as
-- they were.
drop policy "read" on public.activity;
create policy "read" on public.activity for select to authenticated
  using (
    (subject_kind in ('grant', 'funder')
      and (select private.current_role()) = any (
        array['admin', 'director', 'office-manager', 'bookkeeper', 'assistant', 'read-only']))
    or (subject_kind = 'time-entry'
      and exists (select 1 from public.time_entries t where t.id = activity.subject_id))
    or (subject_kind = 'staff'
      and (select private.current_role()) = 'admin')
  );
