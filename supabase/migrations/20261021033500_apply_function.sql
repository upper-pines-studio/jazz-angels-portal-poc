-- apply(slice_id, diff): one change to one slice, written in one transaction or not at all, and
-- refused when it was made on rows someone else has changed since (decision 0008, #124;
-- decision 0009, "An apply is one call to one database function"; #156).
--
-- `diff` is the `RowDiff` the browser builds (`src/core/diff.ts`), unchanged: an array of
-- `{ table, inserts: [row], updates: [{ key, set, was }], deletes: [{ key, was }] }`, parents
-- first, a cleared column as `null`. `slice_id` is `SliceChange.sliceId`: only that slice's
-- tables are accepted.
--
-- 1. Every table, column and key is checked: a table the slice does not write, a column the
--    table does not have, or a key that is not the table's primary key is refused (22023),
--    not ignored.
-- 2. Every row is checked against the row as stored, as `checkStale` does, before anything is
--    written: an update goes ahead when each column it changes still holds `was` or already
--    holds `set` (a row that is gone is refused); a delete when the stored row equals `was`,
--    column by column, or is gone; an insert when its key is free or holds the very same row.
--    Only the columns the diff names are compared: a column no slice writes
--    (`budget_versions.added_at`) is the database's. `null` equals missing; arrays and `jsonb`
--    compare by content; every value is read through its column's type first, so `18:00`
--    equals `18:00:00` and a timestamp equals the same instant written another way.
-- 3. The writes go in `writeOrder`'s order: every table's inserts and updates parents first,
--    then every table's deletes children first. A row that already holds what the diff writes
--    (a resend) is left alone, so the same diff sent twice changes nothing the second time.
--    Each update and delete names, in its `where`, what it expects to find, so a colleague's
--    change committed between the check and the write is refused too.
--
-- A stale row raises SQLSTATE `PT409` (PostgREST answers HTTP 409 with `code: "PT409"`), with
-- the `StaleWriteError` message and, in `detail`, `{"table", "key", "reason"}` as JSON, so the
-- Supabase repository (#159) can tell it from a policy refusal (42501), a trigger's refusal or
-- a constraint, and build a `StaleWriteError` from it. One refusal of any kind aborts the call,
-- and so the whole change: nothing of it is written.
--
-- Everything here is `security invoker`: it runs as the signed-in person, so every select,
-- insert, update and delete meets that table's row policies (#154) and triggers (#155). A row
-- the person may not see is, to them, not there. An update or delete the policy silently skips
-- (a row they may see but not change) is refused as 42501 rather than taken as done.
--
-- The helpers live in `private`, a schema the REST API does not expose (config.toml's
-- `api.schemas`), so only `public.apply` can be called from the browser.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Two column values the same: `null` and missing alike, arrays by content in order, objects by
-- content whatever the key order, a `null` field of an object and a missing one alike
-- (`sameValue` in src/core/diff.ts).
create function private.same_value(a jsonb, b jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_strip_nulls(coalesce(a, 'null'::jsonb)) = jsonb_strip_nulls(coalesce(b, 'null'::jsonb))
$$;

-- Each column `cols` names holds that value in `stored`.
create function private.holds(stored jsonb, cols jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_object_keys(cols) c where not private.same_value(stored -> c, cols -> c)
  )
$$;

-- Each column an update changes holds its old value, or already its new one.
create function private.fresh(stored jsonb, set_to jsonb, was jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_object_keys(set_to) c
     where not (private.same_value(stored -> c, was -> c) or private.same_value(stored -> c, set_to -> c))
  )
$$;

-- A table's primary key columns, in order.
create function private.key_columns(tbl text)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select array_agg(a.attname::text order by k.ord)
    from pg_catalog.pg_index i
    cross join lateral unnest(i.indkey::int2[]) with ordinality as k (attnum, ord)
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = format('public.%I', tbl)::regclass and i.indisprimary
$$;

-- `(t.a, t.b) = (select a, b from jsonb_populate_record(null::public.<tbl>, $<param>))`: the row
-- of `tbl` aliased `t` whose key is the jsonb in parameter `param`.
create function private.key_match(tbl text, param integer)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select format('(%s) = (select %s from jsonb_populate_record(null::public.%I, $%s))',
    string_agg(format('t.%I', c), ', '), string_agg(format('%I', c), ', '), tbl, param)
    from unnest(private.key_columns(tbl)) c
$$;

-- A row's key: its primary key columns, as the diff names an update's or a delete's row.
create function private.key_of(tbl text, row_in jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_object_agg(c, row_in -> c) from unnest(private.key_columns(tbl)) c
$$;

-- The columns of `row` as `tbl` stores them: each value read through its column's type and
-- written back as jsonb, so it compares with `to_jsonb` of a stored row.
create function private.as_stored(tbl text, row_in jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  typed jsonb;
begin
  execute format('select to_jsonb(jsonb_populate_record(null::public.%I, $1))', tbl)
    into typed using row_in;
  return coalesce((select jsonb_object_agg(c, typed -> c) from jsonb_object_keys(row_in) c), '{}'::jsonb);
end;
$$;

-- The row of `tbl` with this key as the caller may see it, or null. `match` is
-- `private.key_match(tbl, 1)`, worked out once per table.
create function private.stored_row(tbl text, match text, key jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  found jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where %s', tbl, match)
    into found using key;
  return found;
end;
$$;

-- Refuse the whole apply: a row is not as the change read it.
create function private.refuse_stale(tbl text, key jsonb, reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT409',
    message = format('The %s row %s changed since it was read (%s).', tbl, key, reason),
    detail = jsonb_build_object('table', tbl, 'key', key, 'reason', reason)::text,
    hint = 'Someone else changed it first: load it again and make the change on top.';
end;
$$;

-- Refuse the whole apply: the row is there, as read, but the caller's policy skipped the write.
create function private.refuse_policy(tbl text, key jsonb, op text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = format('You may not %s the %s row %s.', op, tbl, key);
end;
$$;

create function public.apply(slice_id text, diff jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Each slice's tables, as its `tables.keys` lists them (src/core/tables.ts and
  -- src/modules/<module>/domain/tables.ts; db/apply.test.ts checks they agree).
  slice_tables constant text[] := case slice_id
    when 'core' then array[
      'staff', 'programs', 'program_budgets', 'projects', 'organizations', 'venues',
      'office_documents', 'office_document_versions', 'settings']
    when 'grants' then array[
      'funders', 'grants', 'grant_programs', 'grant_shares', 'tasks', 'grant_documents',
      'payments', 'award_terms', 'reports', 'reminder_plans', 'reminder_plan_recipients',
      'reminder_defaults', 'reminder_default_recipients', 'checklist_templates',
      'checklist_template_items', 'quickbooks_connection', 'qb_accounts', 'qb_classes',
      'transactions', 'budget_versions', 'budget_lines', 'budget_line_amounts',
      'budget_line_accounts', 'expenses', 'split_rules', 'split_rule_parts', 'grant_files',
      'activity']
    when 'teaching' then array[
      'terms', 'ensembles', 'class_meetings', 'students', 'student_private', 'attendance']
    when 'timesheets' then array['time_entries', 'activity']
  end;
  change jsonb;
  tbl text;
  table_columns text[];
  key_columns text[];
  item record;
  bad text;
  stored jsonb;
  row_in jsonb;
  set_to jsonb;
  was jsonb;
  written integer;
  match text;
begin
  if slice_tables is null then
    raise exception using errcode = '22023', message = format('There is no %L slice.', slice_id);
  end if;
  if jsonb_typeof(diff) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'The diff is not a list of tables.';
  end if;

  -- 1. The shape: tables of this slice, columns of their table, keys that are primary keys. --

  for change in select value from jsonb_array_elements(diff) loop
    tbl := change ->> 'table';
    if jsonb_typeof(change) is distinct from 'object' or tbl is null then
      raise exception using errcode = '22023', message = 'A table in the diff has no name.';
    end if;
    if not tbl = any (slice_tables) then
      raise exception using errcode = '22023',
        message = format('The %s slice does not write the %s table.', slice_id, tbl);
    end if;
    if jsonb_typeof(change -> 'inserts') is distinct from 'array'
      or jsonb_typeof(change -> 'updates') is distinct from 'array'
      or jsonb_typeof(change -> 'deletes') is distinct from 'array' then
      raise exception using errcode = '22023',
        message = format('The %s diff needs inserts, updates and deletes lists.', tbl);
    end if;
    select array_agg(a.attname::text) into table_columns
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', tbl)::regclass and a.attnum > 0 and not a.attisdropped;
    key_columns := private.key_columns(tbl);

    -- Every object the diff names: what it is, and whether it must carry the whole key.
    for item in
      select r as obj, 'row' as what, false as is_key from jsonb_array_elements(change -> 'inserts') r
      union all select u -> 'key', 'key', true from jsonb_array_elements(change -> 'updates') u
      union all select u -> 'set', 'set', false from jsonb_array_elements(change -> 'updates') u
      union all select u -> 'was', 'was', false from jsonb_array_elements(change -> 'updates') u
      union all select d -> 'key', 'key', true from jsonb_array_elements(change -> 'deletes') d
      union all select d -> 'was', 'row', false from jsonb_array_elements(change -> 'deletes') d
    loop
      if jsonb_typeof(item.obj) is distinct from 'object' then
        raise exception using errcode = '22023',
          message = format('A %s %s in the diff is not an object.', tbl, item.what);
      end if;
      select c into bad from jsonb_object_keys(item.obj) c where not c = any (table_columns) limit 1;
      if bad is not null then
        raise exception using errcode = '22023',
          message = format('The %s table has no %s column.', tbl, bad);
      end if;
      -- A key names exactly the primary key; a key or a whole row has every key column set.
      if item.is_key
        and array(select jsonb_object_keys(item.obj) order by 1)
            <> array(select unnest(key_columns) order by 1) then
        raise exception using errcode = '22023',
          message = format('A %s key must name %s, and nothing else.', tbl, array_to_string(key_columns, ', '));
      end if;
      if item.what in ('key', 'row')
        and exists (select 1 from unnest(key_columns) c where coalesce(jsonb_typeof(item.obj -> c), 'null') = 'null') then
        raise exception using errcode = '22023',
          message = format('A %s row has no %s.', tbl, array_to_string(key_columns, ', '));
      end if;
    end loop;
    if exists (
      select 1 from jsonb_array_elements(change -> 'updates') u
       where u -> 'set' = '{}'::jsonb
          or array(select jsonb_object_keys(u -> 'set') order by 1)
             <> array(select jsonb_object_keys(u -> 'was') order by 1)
    ) then
      raise exception using errcode = '22023',
        message = format('A %s update must change something, and name the same columns in set and was.', tbl);
    end if;
  end loop;

  -- 2. The stale check, before anything is written: `checkStale`, table by table, its inserts,
  --    then its updates, then its deletes. The first stale row refuses it all. -------------

  for change in select value from jsonb_array_elements(diff) loop
    tbl := change ->> 'table';
    match := private.key_match(tbl, 1);
    for row_in in select value from jsonb_array_elements(change -> 'inserts') loop
      stored := private.stored_row(tbl, match, row_in);
      if stored is not null and not private.holds(stored, private.as_stored(tbl, row_in)) then
        perform private.refuse_stale(tbl, private.key_of(tbl, row_in), 'taken');
      end if;
    end loop;
    for item in select u -> 'key' as key, u -> 'set' as set_to, u -> 'was' as was
                  from jsonb_array_elements(change -> 'updates') u loop
      stored := private.stored_row(tbl, match, item.key);
      if stored is null then
        perform private.refuse_stale(tbl, item.key, 'gone');
      elsif not private.fresh(stored, private.as_stored(tbl, item.set_to), private.as_stored(tbl, item.was)) then
        perform private.refuse_stale(tbl, item.key, 'changed');
      end if;
    end loop;
    for item in select d -> 'key' as key, d -> 'was' as was from jsonb_array_elements(change -> 'deletes') d loop
      stored := private.stored_row(tbl, match, item.key);
      if stored is not null and not private.holds(stored, private.as_stored(tbl, item.was)) then
        perform private.refuse_stale(tbl, item.key, 'changed');
      end if;
    end loop;
  end loop;

  -- 3. The writes, in `writeOrder`'s order. -------------------------------------------------

  for change in select value from jsonb_array_elements(diff) loop
    tbl := change ->> 'table';
    match := private.key_match(tbl, 1);
    -- An insert whose row is already there, the very same, is a resend: left alone.
    for row_in in select value from jsonb_array_elements(change -> 'inserts') loop
      stored := private.stored_row(tbl, match, row_in);
      if stored is null then
        execute format(
          'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
          tbl, (select string_agg(format('%I', c), ', ') from jsonb_object_keys(row_in) c))
          using row_in;
      end if;
    end loop;
    -- An update whose columns already hold their new values is a resend: left alone.
    for item in select u -> 'key' as key, u -> 'set' as set_to, u -> 'was' as was
                  from jsonb_array_elements(change -> 'updates') u loop
      set_to := private.as_stored(tbl, item.set_to);
      was := private.as_stored(tbl, item.was);
      stored := private.stored_row(tbl, match, item.key);
      if stored is null then
        perform private.refuse_stale(tbl, item.key, 'gone');
      elsif not private.holds(stored, set_to) then
        execute format(
          'update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $2))
            where %3$s and private.fresh(to_jsonb(t), $3, $4)',
          tbl, (select string_agg(format('%I', c), ', ') from jsonb_object_keys(item.set_to) c),
          match)
          using item.key, item.set_to, set_to, was;
        get diagnostics written = row_count;
        if written = 0 then
          stored := private.stored_row(tbl, match, item.key);
          if stored is null then
            perform private.refuse_stale(tbl, item.key, 'gone');
          elsif not private.fresh(stored, set_to, was) then
            perform private.refuse_stale(tbl, item.key, 'changed');
          else
            perform private.refuse_policy(tbl, item.key, 'change');
          end if;
        end if;
      end if;
    end loop;
  end loop;

  for change in select value from jsonb_array_elements(diff) with ordinality as d (value, ord)
                 order by ord desc loop
    tbl := change ->> 'table';
    match := private.key_match(tbl, 1);
    -- A delete of a row already gone is a resend: done.
    for item in select d -> 'key' as key, d -> 'was' as was from jsonb_array_elements(change -> 'deletes') d loop
      if private.stored_row(tbl, match, item.key) is not null then
        was := private.as_stored(tbl, item.was);
        execute format('delete from public.%I t where %s and private.holds(to_jsonb(t), $2)',
          tbl, match)
          using item.key, was;
        get diagnostics written = row_count;
        if written = 0 then
          stored := private.stored_row(tbl, match, item.key);
          if stored is not null and not private.holds(stored, was) then
            perform private.refuse_stale(tbl, item.key, 'changed');
          elsif stored is not null then
            perform private.refuse_policy(tbl, item.key, 'delete');
          end if;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

-- Only a signed-in person (and the service role, for tests and scripts) may call it; the
-- helpers are not callable by anyone else either. Supabase grants every new function in
-- `public` to anon, so that grant is taken back.
revoke execute on function public.apply(text, jsonb) from public, anon;
grant execute on function public.apply(text, jsonb) to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.same_value(jsonb, jsonb), private.holds(jsonb, jsonb), private.fresh(jsonb, jsonb, jsonb),
  private.key_columns(text), private.key_of(text, jsonb), private.key_match(text, integer), private.as_stored(text, jsonb),
  private.stored_row(text, text, jsonb), private.refuse_stale(text, jsonb, text),
  private.refuse_policy(text, jsonb, text)
  to authenticated, service_role;
