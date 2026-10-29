-- A new office's starting rows (#177; decision 0004, decision 0009).
--
-- What `empty()` gives a new office in the browser, but for the staff: the five programs and
-- Operations (decision 0006), the settings, the reminder defaults, the QuickBooks connection (not
-- connected) and the default playbook. Without them the first change that points at a program
-- fails its foreign key. Written out from `makeCoreEmpty()` and the grants slice's `makeEmpty()`
-- (`db/startingRows.test.ts` checks they still match: change one, and a new migration changes
-- the other).
--
-- The staff are not here: the browser's empty office keeps the demo's sign-in people, and a real
-- office starts with its first Admin, whose name and email belong to the office, not the repo.
-- `setup.add_first_admin` makes their record and login once they have been invited (#162).

insert into public.programs (id, name, short, in_school) values
  ('studio-sessions', 'Studio Semester Sessions', 'Studio', false),
  ('in-school', 'In-School Program', 'In-school', true),
  ('homeschool', 'Homeschool Program', 'Homeschool', false),
  ('jazz-legacy', 'Jazz Legacy Program', 'Jazz Legacy', false),
  ('advanced-workshop', 'Advanced Jazz Workshop', 'Workshop', false),
  ('general-operating', 'Operations', 'Operations', false);

insert into public.settings (id, fiscal_year_start_month, enabled_modules) values
  (1, 7, array['grants', 'teaching', 'timesheets']);

insert into public.reminder_defaults (id, offsets, keep_reminding, repeat_every_days, send_hour) values
  (1, array[30, 14, 3], false, 3, 8);

insert into public.checklist_templates (id, name, description) values
  ('tpl-foundation-standard', 'Foundation grant — standard', 'The default path for a private foundation proposal, LOI through close-out.'),
  ('tpl-government', 'Government grant', 'City, county, state and federal funders — portal registration and extra compliance.'),
  ('tpl-corporate-sponsorship', 'Corporate sponsorship', 'Short path for company sponsorships — pitch, invoice, acknowledgement.'),
  ('tpl-renewal', 'Renewal (returning funder)', 'A funder we already have a relationship with — refresh last year rather than start over.');

insert into public.checklist_template_items (id, template_id, phase, title, offset_days, anchor, sort_order) values
  ('tpl-foundation-standard-i1', 'tpl-foundation-standard', 'prospect', 'Confirm eligibility and fit', 0, 'startBy', 1),
  ('tpl-foundation-standard-i2', 'tpl-foundation-standard', 'prospect', 'Read last year''s 990 / funder priorities', 2, 'startBy', 2),
  ('tpl-foundation-standard-i3', 'tpl-foundation-standard', 'prospect', 'Add funder contact', 3, 'startBy', 3),
  ('tpl-foundation-standard-i4', 'tpl-foundation-standard', 'loi', 'Draft LOI', -14, 'loiDue', 4),
  ('tpl-foundation-standard-i5', 'tpl-foundation-standard', 'loi', 'Board chair review', -5, 'loiDue', 5),
  ('tpl-foundation-standard-i6', 'tpl-foundation-standard', 'loi', 'Submit LOI', 0, 'loiDue', 6),
  ('tpl-foundation-standard-i7', 'tpl-foundation-standard', 'applying', 'Confirm attachments list with funder', -45, 'applicationDue', 7),
  ('tpl-foundation-standard-i8', 'tpl-foundation-standard', 'applying', 'Update program narrative', -30, 'applicationDue', 8),
  ('tpl-foundation-standard-i9', 'tpl-foundation-standard', 'applying', 'Build project budget', -21, 'applicationDue', 9),
  ('tpl-foundation-standard-i10', 'tpl-foundation-standard', 'applying', 'Gather IRS determination letter and board list', -21, 'applicationDue', 10),
  ('tpl-foundation-standard-i11', 'tpl-foundation-standard', 'applying', 'Update financial statements', -14, 'applicationDue', 11),
  ('tpl-foundation-standard-i12', 'tpl-foundation-standard', 'applying', 'Director review', -7, 'applicationDue', 12),
  ('tpl-foundation-standard-i13', 'tpl-foundation-standard', 'applying', 'Submit application', 0, 'applicationDue', 13),
  ('tpl-foundation-standard-i14', 'tpl-foundation-standard', 'submitted', 'Send thank-you / confirmation note', 3, 'submitted', 14),
  ('tpl-foundation-standard-i15', 'tpl-foundation-standard', 'submitted', 'Follow up if no decision', 14, 'decisionExpected', 15),
  ('tpl-foundation-standard-i16', 'tpl-foundation-standard', 'awarded', 'Send acknowledgement letter', 7, 'decided', 16),
  ('tpl-foundation-standard-i17', 'tpl-foundation-standard', 'awarded', 'Countersign grant agreement', 14, 'decided', 17),
  ('tpl-foundation-standard-i18', 'tpl-foundation-standard', 'awarded', 'Set up budget lines', 14, 'decided', 18),
  ('tpl-foundation-standard-i19', 'tpl-foundation-standard', 'awarded', 'Schedule reports', 14, 'decided', 19),
  ('tpl-foundation-standard-i20', 'tpl-foundation-standard', 'active', 'Reconcile expenses monthly', 30, 'periodStart', 20),
  ('tpl-foundation-standard-i21', 'tpl-foundation-standard', 'reporting', 'Collect attendance and outcomes data', 30, 'periodEnd', 21),
  ('tpl-foundation-standard-i22', 'tpl-foundation-standard', 'reporting', 'Draft interim/final report', 60, 'periodEnd', 22),
  ('tpl-foundation-standard-i23', 'tpl-foundation-standard', 'reporting', 'Submit report', 90, 'periodEnd', 23),
  ('tpl-foundation-standard-i24', 'tpl-foundation-standard', 'closed', 'File final acknowledgement', 120, 'periodEnd', 24),
  ('tpl-foundation-standard-i25', 'tpl-foundation-standard', 'closed', 'Archive folder', 150, 'periodEnd', 25),
  ('tpl-government-i1', 'tpl-government', 'prospect', 'Confirm eligibility and fit', 0, 'startBy', 1),
  ('tpl-government-i2', 'tpl-government', 'prospect', 'Read the guidelines and scoring rubric', 2, 'startBy', 2),
  ('tpl-government-i3', 'tpl-government', 'prospect', 'Register in the funder portal', 5, 'startBy', 3),
  ('tpl-government-i4', 'tpl-government', 'prospect', 'Add funder contact', 5, 'startBy', 4),
  ('tpl-government-i5', 'tpl-government', 'applying', 'Confirm attachments list with funder', -45, 'applicationDue', 5),
  ('tpl-government-i6', 'tpl-government', 'applying', 'Get DUNS/UEI and SAM.gov confirmation', -35, 'applicationDue', 6),
  ('tpl-government-i7', 'tpl-government', 'applying', 'Update program narrative', -30, 'applicationDue', 7),
  ('tpl-government-i8', 'tpl-government', 'applying', 'Build project budget', -21, 'applicationDue', 8),
  ('tpl-government-i9', 'tpl-government', 'applying', 'Gather IRS determination letter and board list', -21, 'applicationDue', 9),
  ('tpl-government-i10', 'tpl-government', 'applying', 'Board resolution authorising the application', -21, 'applicationDue', 10),
  ('tpl-government-i11', 'tpl-government', 'applying', 'Update financial statements', -14, 'applicationDue', 11),
  ('tpl-government-i12', 'tpl-government', 'applying', 'Director review', -7, 'applicationDue', 12),
  ('tpl-government-i13', 'tpl-government', 'applying', 'Submit application in the portal', 0, 'applicationDue', 13),
  ('tpl-government-i14', 'tpl-government', 'submitted', 'Save the portal confirmation number', 1, 'submitted', 14),
  ('tpl-government-i15', 'tpl-government', 'submitted', 'Follow up if no decision', 14, 'decisionExpected', 15),
  ('tpl-government-i16', 'tpl-government', 'awarded', 'Send acknowledgement letter', 7, 'decided', 16),
  ('tpl-government-i17', 'tpl-government', 'awarded', 'Countersign grant agreement', 14, 'decided', 17),
  ('tpl-government-i18', 'tpl-government', 'awarded', 'Set up budget lines', 14, 'decided', 18),
  ('tpl-government-i19', 'tpl-government', 'awarded', 'Schedule quarterly reports', 14, 'decided', 19),
  ('tpl-government-i20', 'tpl-government', 'active', 'Reconcile expenses monthly', 30, 'periodStart', 20),
  ('tpl-government-i21', 'tpl-government', 'active', 'File quarterly report', 90, 'periodStart', 21),
  ('tpl-government-i22', 'tpl-government', 'active', 'File quarterly report', 180, 'periodStart', 22),
  ('tpl-government-i23', 'tpl-government', 'active', 'File quarterly report', 270, 'periodStart', 23),
  ('tpl-government-i24', 'tpl-government', 'reporting', 'Collect attendance and outcomes data', 30, 'periodEnd', 24),
  ('tpl-government-i25', 'tpl-government', 'reporting', 'Draft final report', 60, 'periodEnd', 25),
  ('tpl-government-i26', 'tpl-government', 'reporting', 'Submit report in the portal', 90, 'periodEnd', 26),
  ('tpl-government-i27', 'tpl-government', 'closed', 'File final acknowledgement', 120, 'periodEnd', 27),
  ('tpl-government-i28', 'tpl-government', 'closed', 'Archive folder', 150, 'periodEnd', 28),
  ('tpl-corporate-sponsorship-i1', 'tpl-corporate-sponsorship', 'prospect', 'Confirm sponsorship levels and deadline', 0, 'startBy', 1),
  ('tpl-corporate-sponsorship-i2', 'tpl-corporate-sponsorship', 'applying', 'Build the pitch deck', -21, 'applicationDue', 2),
  ('tpl-corporate-sponsorship-i3', 'tpl-corporate-sponsorship', 'applying', 'Submit sponsorship request', 0, 'applicationDue', 3),
  ('tpl-corporate-sponsorship-i4', 'tpl-corporate-sponsorship', 'awarded', 'Send the sponsorship invoice', 7, 'decided', 4),
  ('tpl-corporate-sponsorship-i5', 'tpl-corporate-sponsorship', 'active', 'Deliver logo and acknowledgement package', 14, 'periodStart', 5),
  ('tpl-corporate-sponsorship-i6', 'tpl-corporate-sponsorship', 'reporting', 'Send thank-you with photos', 14, 'periodEnd', 6),
  ('tpl-renewal-i1', 'tpl-renewal', 'prospect', 'Confirm the funder is renewing this cycle', 0, 'startBy', 1),
  ('tpl-renewal-i2', 'tpl-renewal', 'prospect', 'Pull last year''s report and outcomes', 2, 'startBy', 2),
  ('tpl-renewal-i3', 'tpl-renewal', 'applying', 'Update the narrative with this year''s numbers', -21, 'applicationDue', 3),
  ('tpl-renewal-i4', 'tpl-renewal', 'applying', 'Refresh the project budget', -14, 'applicationDue', 4),
  ('tpl-renewal-i5', 'tpl-renewal', 'applying', 'Director review', -7, 'applicationDue', 5),
  ('tpl-renewal-i6', 'tpl-renewal', 'applying', 'Submit renewal application', 0, 'applicationDue', 6),
  ('tpl-renewal-i7', 'tpl-renewal', 'submitted', 'Send thank-you / confirmation note', 3, 'submitted', 7),
  ('tpl-renewal-i8', 'tpl-renewal', 'awarded', 'Countersign grant agreement', 14, 'decided', 8),
  ('tpl-renewal-i9', 'tpl-renewal', 'awarded', 'Schedule reports', 14, 'decided', 9),
  ('tpl-renewal-i10', 'tpl-renewal', 'active', 'Reconcile expenses monthly', 30, 'periodStart', 10),
  ('tpl-renewal-i11', 'tpl-renewal', 'reporting', 'Draft report', 60, 'periodEnd', 11),
  ('tpl-renewal-i12', 'tpl-renewal', 'reporting', 'Submit report', 90, 'periodEnd', 12);

insert into public.quickbooks_connection (id, connected) values
  (1, false);

-- The first Admin --------------------------------------------------------------------------------
--
-- Everyone else is invited from Settings by someone with "Staff and roles" (#157), so the first
-- person needs another way in. Invite them from the Supabase dashboard (Authentication, Invite
-- user), then, in its SQL editor:
--
--   select setup.add_first_admin('them@example.org', 'Their Name', 'Their title');
--
-- It makes their staff record (an Admin who does not teach) and their login, invited by
-- themself, and answers the record's id. Refused once the office has any login, so it cannot add
-- a second Admin behind Settings' back. It lives in its own schema, not `private`, whose
-- functions are the row rules' helpers that every signed-in person runs: only the database's
-- owner may use this one.

create schema setup;
revoke all on schema setup from public, anon, authenticated, service_role;

create function setup.add_first_admin(email text, name text, title text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  account auth.users;
  new_id text := 's-' || replace(gen_random_uuid()::text, '-', '');
begin
  if exists (select 1 from public.logins) then
    raise exception using errcode = 'check_violation',
      message = 'The office already has a sign-in. Invite everyone else from Settings.';
  end if;
  select * into account from auth.users u
   where lower(u.email) = lower(trim(add_first_admin.email));
  if not found then
    raise exception using errcode = 'no_data_found',
      message = format('Nobody is invited as %s yet. Invite them from Authentication first.',
        trim(add_first_admin.email));
  end if;
  insert into public.staff (id, name, title, role, teaches, email)
    values (new_id, trim(add_first_admin.name), trim(add_first_admin.title), 'admin', false,
      lower(account.email));
  insert into public.logins (auth_user_id, staff_id, invited_by, invited_at, accepted_at)
    values (account.id, new_id, new_id, coalesce(account.invited_at, now()),
      account.last_sign_in_at);
  return new_id;
end;
$$;

revoke execute on function setup.add_first_admin(text, text, text)
  from public, anon, authenticated, service_role;

comment on function setup.add_first_admin(text, text, text) is
  'The first Admin''s staff record and login, after their invitation (#177). Owner only.';
