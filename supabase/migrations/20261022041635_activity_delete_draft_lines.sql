-- A draft time entry deletes with its activity lines (#174; docs/SCHEMA.md, "Row-level security").
--
-- Delete draft sends one change: the `time_entries` row and its steps in `activity` (subject kind
-- `time-entry`, src/modules/timesheets/domain/tables.ts). #154 gave `activity` no delete policy,
-- so `apply()` refused the whole change (42501). This policy lets those lines go, and nothing
-- else: a line of a time entry that is the caller's own (not Read-only), still a draft, and never
-- sent back. A grant's, a funder's or a sign-in's line, and the lines of a submitted, approved or
-- sent-back entry, stay. A sent-back entry is a draft again, but its history holds an approval,
-- which is money (decision 0002), so its lines are kept and deleting it is refused.
--
-- `apply` deletes children first (`writeOrder`: `time_entries`, then `activity`), so the lines go
-- while their entry is still there for this policy to read; the entry's own delete policy and
-- trigger then ask the same of the entry. The read policy (#176 changes it) is not touched.

create policy "delete" on public.activity for delete to authenticated
  using (
    subject_kind = 'time-entry'
    and (select private.current_role()) <> 'read-only'
    and exists (
      select 1 from public.time_entries t
       where t.id = activity.subject_id
         and t.staff_id = (select private.current_staff_id())
         and t.status = 'draft'
         and t.sent_back_by is null)
  );
