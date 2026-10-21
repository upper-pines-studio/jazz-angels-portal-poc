-- Storage for file contents (#158; docs/SCHEMA.md "Files", decision 0009).
--
-- Two private buckets. An object's name is the id of the row it belongs to, with no folder and
-- no extension: `grant-files/<grant_files.id>` and `office-documents/<office_document_versions.id>`.
-- The row is written first, then its object.
--
-- The rules on storage.objects follow the rows by asking the row tables, so the caller's own
-- row policies (#154) answer. A policy's subquery runs as the caller, so a row the caller may
-- not read is not there to find.
--   * read an object: its row is visible to the caller (the table's select policy).
--   * add, replace or delete a grant file's object: `select ... for update` on its row. That
--     takes the rows the caller may both select and update, so the update policy's rule
--     (a grant's own file, or an expense's backup) decides, and no role is named here.
--   * an office document version is insert-only, so its object is added once, by the person who
--     added the row, and never replaced or deleted: there is no update or delete policy.
-- The bucket's size and format limits are checked by Storage before these rules.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('grant-files', 'grant-files', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('office-documents', 'office-documents', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- grant-files -----------------------------------------------------------------------------------

create policy "grant files: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'grant-files'
    and exists (select 1 from public.grant_files f where f.id = storage.objects.name)
  );

-- Upsert needs insert, select and update together, so replacing is allowed by all three.
create policy "grant files: add" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'grant-files'
    and exists (select 1 from public.grant_files f where f.id = storage.objects.name for update)
  );

create policy "grant files: replace" on storage.objects for update to authenticated
  using (
    bucket_id = 'grant-files'
    and exists (select 1 from public.grant_files f where f.id = storage.objects.name for update)
  )
  with check (
    bucket_id = 'grant-files'
    and exists (select 1 from public.grant_files f where f.id = storage.objects.name for update)
  );

create policy "grant files: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'grant-files'
    and exists (select 1 from public.grant_files f where f.id = storage.objects.name for update)
  );

-- office-documents ------------------------------------------------------------------------------

create policy "office documents: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'office-documents'
    and exists (
      select 1 from public.office_document_versions v where v.id = storage.objects.name)
  );

-- Only the person who added the version's row may add its object; the row's insert policy has
-- already limited that to the money roles. No update or delete policy: a version never changes.
create policy "office documents: add" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'office-documents'
    and exists (
      select 1 from public.office_document_versions v
       where v.id = storage.objects.name
         and v.added_by = (select private.current_staff_id()))
  );
