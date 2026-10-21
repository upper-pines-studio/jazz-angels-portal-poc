# 0009 The backend is Postgres on Supabase, with Supabase sign-in and file storage

**Status:** Decided by the owner, October 2026. How a login is tied to a staff record was left to
the build, which chose the standard Supabase setup below. The email service, the plan and the
region are still open.

## Why

`docs/SCHEMA.md` was written with no product chosen (#22), and decision 0008 settled how the
browser hands a change to "the backend" without naming one. Before anything is built, the
portal needs a database, a way to sign in that the database's row rules can trust, and a place
for file contents, which the browser build does not keep at all (`docs/FEATURES.md`, Known gaps).

## What the owner answered

- **The database is Postgres, on Supabase for now.** The schema is already written for Postgres.
- **Sign-in uses Supabase too.** How a login is tied to a staff record is the build's choice:
  pick a standard setup.
- **File contents live in Supabase as well, for now.** The office already uses SharePoint and
  OneDrive, so a link to a file kept there is welcome later.
- **History** (decision 0004) waits: the owner will share some of the office's spreadsheets, and
  the import is designed from them then.

## Decision

### The database

- One Supabase project holds every table in `docs/SCHEMA.md`, in the `public` schema, with row
  level security switched on for every table and the policies the schema lists. The tables, the
  links, the triggers and the exclusion constraint are written as Supabase migrations kept in
  this repo, so a local Supabase (`supabase start`) and the hosted project are built the same
  way.
- **An apply is one call to one database function.** Each call through Supabase's REST API is its
  own transaction, so the row diff of decision 0008 (inserts, updates and deletes across a
  slice's tables) is sent to a single Postgres function, `apply`, which checks every row for a
  stale write (`checkStale`, ported) and writes all of it, or refuses all of it with the reason
  the screen shows. It runs as the signed-in person (`security invoker`), so every row it writes
  still meets that table's policy. Reading a slice is ordinary selects, also under the policies.
- **The demo stays in the browser.** With `VITE_DEMO` on, and on the published Netlify demo, the
  portal keeps using localStorage. The Supabase repository is used only when the build is given a
  Supabase project's address and publishable key. The secret (service role) key never reaches the
  browser.

### Sign-in, and how a login is tied to a staff record

The standard Supabase setup, shaped to decision 0001's "Sign-ins are by invitation":

- **Supabase Auth keeps the accounts.** Passwords live in Supabase's own users table
  (`auth.users`); the portal never sees or stores one.
- **People sign in with their email and a password they chose.** The username goes: Supabase
  identifies an account by its email, and 0001 already needs an email on each staff record for
  the invitation. Forgotten passwords use Supabase's reset email.
- **`logins` ties an account to a staff record**, one each way: its key is the Supabase user's id
  (`auth_user_id`), and `staff_id` is unique, so a person has one sign-in and a sign-in is one
  person. It also keeps who sent the invitation, when, and when it was accepted.
- **An invitation is sent by a server function, not the browser.** A Supabase Edge Function,
  called with the signed-in person's session, checks the 0001 rules (the sender has "Staff and
  roles", the record is current and has an email, only an Admin invites for an Admin's record),
  then uses Supabase's invite-by-email to create the account and send the link, and inserts the
  `logins` row and the activity line every Admin sees. Only that function holds the secret key.
  The invited person follows the link and chooses their own password; a trigger on `auth.users`
  sets `accepted_at` on their first sign-in.
- **The row rules ask the database who is signed in.** Two functions, `current_staff_id()` and
  `current_role()`, look up the signed-in user's `logins` row and that staff record's `role`, in
  a schema the REST API does not expose. Every policy uses them. They return nothing for a staff
  record that is archived, so archiving someone shuts them out at once, even while a session
  they already had has not expired. The
  role is read from the table on each request, not carried in the sign-in token, so a role
  change takes effect immediately; nothing in a token the person can edit (`user_metadata`)
  decides access.

### Files

- **Contents go in Supabase Storage**, which is part of the same project: a private bucket for
  grant files and one for office document versions, each object keyed by its row's id, as
  `docs/SCHEMA.md` ("Files") already says. The table keeps the file's facts; the bytes are never
  a column. Storage's own access rules are written in Postgres and follow the row: whoever may
  read the row may read its object, and whoever may write the row may add its object.
- **A link to SharePoint or OneDrive already has a place:** a grant's register row
  (`grant_documents`) can hold a `url` instead of a file. Letting a grant file or an office
  document version be a link instead of an upload is left for later.

## Still open

- **The email service.** Supabase's built-in email only reaches the members of the Supabase team
  and sends a few messages an hour, so invitations and password resets to the office need the
  project to send through a real email service (Microsoft 365, which the office has, or a
  sending service). The office chooses which.
- **The plan and the region.** A production project needs a paid plan for daily backups and to
  stay awake, and a region near the office. The portal holds student and guardian data, the most
  protected data in the portal (0001), so the client confirms both.
- **History** (decision 0004), from the office's spreadsheets.

## What it means for the build

- `docs/SCHEMA.md`: `logins` is keyed by `auth_user_id` with a unique `staff_id` and no
  `username`; `staff.email` is required for a staff record that has a login; the files live in
  Supabase Storage; the intro names the product.
- The browser's sign-in screen asks for an email instead of a username once it signs in through
  Supabase. The demo build keeps its fixed logins.
- The work splits into pieces that can each be built and checked on their own:
  1. The Supabase project setup and the migrations for every table, link and constraint.
  2. The row rules: `current_staff_id()`, `current_role()` and each table's policies, with
     tests that sign in as each role.
  3. The triggers in `docs/SCHEMA.md` ("Things to know"), and the `apply` function with the
     stale-write check.
  4. The invitation Edge Function and the accepted-sign-in trigger.
  5. A Supabase `Repository` that loads each slice and sends each change to `apply`.
  6. Sign-in through Supabase in the browser, with email in place of the username.
  7. Storage buckets and their rules, and saving file contents.
