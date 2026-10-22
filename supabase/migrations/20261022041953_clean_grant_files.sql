-- Clean up grant-file objects that no row points to (#175; docs/SCHEMA.md "Buckets and object
-- names", decision 0009).
--
-- A grant file's object can be deleted only while its row exists (#158), and the portal deletes
-- it first when it can (#161). Whatever is left behind with no row (a transaction sent back, an
-- expense removed another way, an upload that landed after its row was deleted) is removed by the
-- `clean-grant-files` Edge Function, once a day, for objects older than its grace period of a day.
--
-- The deleting is the function's, through the Storage API with the secret key, not SQL's:
-- Storage refuses `delete from storage.objects` (storage.protect_delete, "Use the Storage API
-- instead"), and a row removed that way would leave the bytes in the storage backend. So the
-- database only rings the bell: pg_cron runs `jobs.clean_grant_files()`, which posts to the
-- function through pg_net with the project's address and secret key from Vault.
--
-- The Vault secrets `project_url` and `secret_key` are set per project, never in a migration:
-- without them the job does nothing. Hosted, they are set when the project is set up (#162).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The scheduled jobs' own schema: not `private`, whose functions are the row rules' helpers and
-- run for every signed-in person. Nobody but the database's owner (and so pg_cron) uses this one.
create schema jobs;
revoke all on schema jobs from public, anon, authenticated;

-- Post to the clean-up and answer pg_net's request id, or null when the project's address or
-- secret key is not in Vault. pg_net sends it after the transaction commits; its answer lands in
-- net._http_response. Runs as its caller: the cron job's owner, who may read Vault.
create function jobs.clean_grant_files()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key');
begin
  if url is null or key is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(url, '/') || '/functions/v1/clean-grant-files',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function jobs.clean_grant_files() from public, anon, authenticated;

-- Every day at 03:17 UTC, a quiet hour for the office.
select cron.schedule('clean-grant-files', '17 3 * * *', 'select jobs.clean_grant_files()');
