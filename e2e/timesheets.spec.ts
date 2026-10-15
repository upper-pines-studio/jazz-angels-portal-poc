// Hours from logging to approval, with two logins. Devon (Teacher) logs his own hours, which go
// in as a draft (decision 0001: everyone logs only their own), and submits the week; once
// submitted the entry is the office's and Submit week is gone. Keisha (Office manager) then
// approves it: the office approves, and nobody approves their own hours. Keisha has no drafts
// of her own that week, so she gets no Submit week even though she sees everyone's drafts.
// Until then Devon may recall a submitted entry to a draft, and delete it while it is a draft
// (decision 0002: approved hours are money, so they are never deleted or recalled). Every step
// stays in the entry's history, opened from its status, an approval sent back included (#95).
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
  await expect(row.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

  // The office approves it.
  await switchUser(page, 'keisha');
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit week' })).toHaveCount(0);
  const queued = entryRow(page, activity);
  await expect(queued.getByText('Submitted', { exact: true })).toBeVisible();
  await queued.getByRole('button', { name: 'Approve', exact: true }).click();

  await expect(page.getByText('Hours approved')).toBeVisible();
  await expect(queued.getByText('Approved', { exact: true })).toBeVisible();
  await expect(queued.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

  // Approved, it is Devon's no more to recall or delete.
  await switchUser(page, 'devon');
  const locked = entryRow(page, activity);
  await expect(locked.getByText('Approved', { exact: true })).toBeVisible();
  await expect(locked.getByRole('button', { name: 'Recall' })).toHaveCount(0);
  await expect(locked.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);
});

test('a teacher recalls submitted hours and deletes the draft', async ({ page }) => {
  const activity = 'Combo B sectional, Studio 2';
  await freshStart(page, 'devon');
  await page.goto('/timesheets');

  await page.getByRole('button', { name: 'Log hours' }).click();
  const log = dialog(page, 'Log hours');
  await field(log, 'Activity').fill(activity);
  await field(log, 'Hours').fill('0.75');
  await log.getByRole('button', { name: 'Log hours' }).click();
  const row = entryRow(page, activity);
  await expect(row.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Submit week' }).click();
  await dialog(page, 'Submit the week of Sep 7')
    .getByRole('button', { name: 'Submit hours' })
    .click();
  await expect(row.getByText('Submitted', { exact: true })).toBeVisible();
  // Submitted, it can be recalled but not deleted.
  await expect(row.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);

  // Recall: back to a draft, and Submit week is offered again.
  await row.getByRole('button', { name: 'Recall' }).click();
  await expect(page.getByText('Hours recalled')).toBeVisible();
  await expect(row.getByText('Draft', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Recall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit week' })).toBeVisible();

  // Delete the draft, after a confirmation.
  await row.getByRole('button', { name: 'Delete draft' }).click();
  const confirm = dialog(page, 'Delete this draft?');
  await expect(confirm.getByText(`Sun Sep 13, ${activity}, 0.75 hours.`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete draft' }).click();
  await expect(page.getByText('Draft deleted')).toBeVisible();
  await expect(page.getByText(activity, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit week' })).toHaveCount(0);
});

test('the office sends approved hours back, and the teacher fixes and resubmits them', async ({
  page,
}) => {
  // Devon's Wednesday planning, approved by Barry in the seed.
  const activity = 'Paramount MS planning with the band director';
  const reason = 'The meeting ran 1.50 hours, not 1.25.';
  await freshStart(page, 'keisha');
  await page.goto('/timesheets');

  const row = entryRow(page, activity);
  await expect(row.getByText('Approved', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Send back' }).click();

  // The reason is required.
  const confirm = dialog(page, 'Send these hours back?');
  await expect(confirm.getByText(`Wed Sep 9, Devon Price, ${activity}, 1.25 hours.`)).toBeVisible();
  const send = confirm.getByRole('button', { name: 'Send back' });
  await expect(send).toBeDisabled();
  await field(confirm, 'What needs fixing', 'textarea').fill(reason);
  await send.click();

  await expect(page.getByText('Hours sent back')).toBeVisible();
  await expect(row.getByText('Sent back', { exact: true })).toBeVisible();
  await expect(row.getByText(reason)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Send back' })).toHaveCount(0);

  // Devon sees it, with who sent it back and why, and fixes it.
  await switchUser(page, 'devon');
  await expect(page.getByText('The office sent back 1 entry for you to fix')).toBeVisible();
  const mine = entryRow(page, activity);
  await expect(mine.getByText('Sent back by Keisha Monroe on Sep 13:')).toBeVisible();
  await mine.getByRole('button', { name: 'Edit hours' }).click();
  const edit = dialog(page, 'Edit hours');
  await expect(edit.getByText(reason)).toBeVisible();
  await field(edit, 'Hours').fill('1.50');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Hours changed')).toBeVisible();
  await expect(mine.getByText('1.50', { exact: true })).toBeVisible();

  // Submitting it again clears the note.
  await page.getByRole('button', { name: 'Submit week' }).click();
  await dialog(page, 'Submit the week of Sep 7')
    .getByRole('button', { name: 'Submit hours' })
    .click();
  await expect(mine.getByText('Submitted', { exact: true })).toBeVisible();
  await expect(mine.getByText(reason)).toHaveCount(0);
  await expect(page.getByText('The office sent back 1 entry for you to fix')).toHaveCount(0);

  // The office approves it again.
  await switchUser(page, 'keisha');
  const again = entryRow(page, activity);
  await again.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(again.getByText('Approved', { exact: true })).toBeVisible();

  // The history keeps every step, the first approval too, for the office and for Devon (#95).
  const steps = [
    'Logged by Devon Price, Sep 9',
    'Submitted by Devon Price, Sep 9',
    'Approved by Barry Cogert, Sep 13',
    `Sent back by Keisha Monroe, Sep 13: ${reason}`,
    'Changed by Devon Price, Sep 13: hours 1.25 to 1.50',
    'Submitted again by Devon Price, Sep 13',
    'Approved again by Keisha Monroe, Sep 13',
  ];
  const readHistory = async () => {
    await entryRow(page, activity).getByRole('button', { name: 'Approved, show history' }).click();
    const history = dialog(page, 'History');
    await expect(
      history.getByText(`Wed Sep 9, Devon Price, ${activity}, 1.50 hours.`),
    ).toBeVisible();
    await expect(history.getByRole('listitem')).toHaveText(steps);
    await history.locator('footer').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toHaveCount(0);
  };
  await readHistory();
  await switchUser(page, 'devon');
  await readHistory();
});
