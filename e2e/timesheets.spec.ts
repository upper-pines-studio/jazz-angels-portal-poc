// Log hours as devon (Teacher): decision 0001 has everyone log only their own hours, and the
// dialog defaults the teacher to whoever is signed in. Approve as keisha (Office manager): the
// office approves, and nobody approves their own hours. Both stay allowed once roles are
// enforced (#17).
//
// Not covered: submitting hours. The Timesheets screen has no Submit control yet (only the
// `submitEntry` action in the domain), so a logged entry stays a draft in the UI. The approve
// check therefore uses Devon's seeded submitted entry for the demo week.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, field, freshStart } from './support';

/** The table row for an activity: the innermost block holding the activity's text. */
function entryRow(page: Page, activity: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(activity, { exact: true }) })
    .last();
}

test('a teacher logs his own hours and they go in as a draft', async ({ page }) => {
  const activity = 'Big Band sectional prep, Main room';
  await freshStart(page, 'devon');
  await page.goto('/timesheets');
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();

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
});

test("the office approves a teacher's submitted hours", async ({ page }) => {
  const activity = 'Big Band rehearsal and setup, Main room'; // Devon's, seeded as submitted
  await freshStart(page, 'keisha');
  await page.goto('/timesheets');
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();

  const row = entryRow(page, activity);
  await expect(row.getByText('Submitted', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Hours approved')).toBeVisible();
  await expect(row.getByText('Approved', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
