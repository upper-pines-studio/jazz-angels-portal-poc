-- The extensions the schema needs (docs/SCHEMA.md, "Things to know when building it").
--
-- btree_gist lets a gist index compare plain values with `=`, which the sessions
-- exclusion constraint on `terms` needs (decision 0007, #83). Supabase keeps
-- extensions in their own `extensions` schema, out of the REST API.

create extension if not exists btree_gist with schema extensions;
