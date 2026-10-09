// Hours from logging to approval, with two logins. Devon (Teacher) logs his own hours, which go
// in as a draft (decision 0001: everyone logs only their own), and submits the week; once
// submitted the entry is the office's and Submit week is gone. Keisha (Office manager) then
// approves it: the office approves, and nobody approves their own hours. Keisha has no drafts
// of her own that week, so she gets no Submit week even though she sees everyone's drafts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, field, freshStart, switchUser } from './support';

/** The table row for an activity: the innermost block holding the activity's text. */
function entryRow(page: Page, activity: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(activity, { exact: true }) })
    .last();
}

test('a teacher logs and submits his hours, and the office approves them', async ({ page }) => {
  const activity = 'Big Band sectional prep, Main room';
  await freshStart(page, 'devon');
  await page.goto('/timesheets');
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  // Devon's only entry this week is already submitted: nothing of his to submit yet.
  await expect(page.getByRole('button', { name: 'Submit week' })).toHaveCount(0);

  // Log: the dialog names the signed-in teacher, and the entry goes in as a draft.
  await page.getByRole('button', { name: 'Log hours' }).click();
  const log = dialog(page, 'Log hours');
  await expect(field(log, 'Teacher').locator('option:checked')).toHaveText('Devon Price');
  await field(log, 'Activity').fill(activity);
  await field(log, 'Hours').fill('1.50');
  await log.getByRole('button', { name: 'Log hours' }).click();

  await expect(page.getByText('Hours logged')).toBeVisible();
  const row = entryRow(page, activity);
  await expect(row.getByText('Devon Price')).toBeVisible();
  await expect(row.getByText('1.50')).toBeVisible();
  await expect(row.getByText('Draft', { exact: true })).toBeVisible();

  // Submit the week: one draft, 1.50 hours, to the office.
  await page.getByRole('button', { name: 'Submit week' }).click();
  const submit = dialog(page, 'Submit the week of Sep 7');
  await expect(submit.getByText('Your 1 draft entry, 1.50 hours')).toBeVisible();
  await submit.getByRole('button', { name: 'Submit hours' }).click();

  await expect(page.getByText('Hours submitted')).toBeVisible();
  await expect(row.getByText('Submitted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit week' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // The office approves it.
  await switchUser(page, 'keisha');
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit week' })).toHaveCount(0);
  const queued = entryRow(page, activity);
  await expect(queued.getByText('Submitted', { exact: true })).toBeVisible();
  await queued.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Hours approved')).toBeVisible();
  await expect(queued.getByText('Approved', { exact: true })).toBeVisible();
  await expect(queued.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
