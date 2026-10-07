// Signed in as keisha (Office manager), who may edit the award, so Add grant offers "This grant
// is already under way" (decision 0004, #21). The office assistant is not offered it.
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { dialog, field, freshStart } from './support';

const TITLE = 'Music in the Parks 2026';

/** The Switch beside a line of text: the design-system Switch is the row's first label. */
function switchFor(scope: Locator, text: string) {
  return scope
    .getByText(text, { exact: true })
    .locator('xpath=ancestor::div[1]')
    .locator('label')
    .first();
}

test('bring in a grant at Active with its award, a payment received and a report sent', async ({
  page,
}) => {
  await freshStart(page, 'keisha');
  await page.goto('/grants');
  await page.getByRole('button', { name: 'Add grant' }).click();
  const add = dialog(page, 'Add grant');

  // Step 1: funder and program, and where the grant is now.
  await field(add, 'Funder').selectOption({ label: 'Ralph M. Parsons Foundation' });
  await field(add, 'Grant title').fill(TITLE);
  await switchFor(add, 'This grant is already under way').click();
  await expect(add.getByText('Step 1 of 5')).toBeVisible();
  await add.locator('label', { hasText: /^Active$/ }).click();
  await add.getByRole('button', { name: 'Next: Award & dates' }).click();

  // Step 2: the award is required; the dates before it may stay blank.
  await add.getByRole('button', { name: 'Next: Budget' }).click();
  await expect(add.getByText('Enter the amount awarded.')).toBeVisible();
  await field(add, 'Amount awarded').fill('40000');
  await field(add, 'Date awarded').fill('2026-01-20');
  await field(add, 'Grant period starts').fill('2026-02-01');
  await field(add, 'Grant period ends').fill('2027-01-31');
  await add.getByRole('button', { name: 'Next: Budget' }).click();

  // Step 3: one budget line.
  const line = add.locator('.ja-inflight-line').nth(1).locator('input');
  await line.nth(0).fill('Teaching artist stipends');
  await line.nth(1).fill('40000');
  await add.getByRole('button', { name: 'Next: Payments & reports' }).click();

  // Step 4: a payment that has arrived and a report that has been sent.
  await add.getByRole('button', { name: 'Add payment' }).click();
  await field(add, 'Installment').fill('First installment');
  await field(add, 'Amount').fill('20000');
  await field(add, 'Expected').fill('2026-02-01');
  await field(add, 'Received').fill('2026-02-04');
  await add.getByRole('button', { name: 'Add report' }).click();
  await field(add, 'Due date').fill('2026-07-31');
  await field(add, 'Status', 'select').selectOption('submitted');
  await field(add, 'Submitted on').fill('2026-07-28');
  await add.getByRole('button', { name: 'Next: Checklist' }).click();

  // Step 5: only the tasks from Active on.
  await expect(add.getByText('Reconcile expenses monthly')).toBeVisible();
  await expect(add.getByText('Submit application')).toHaveCount(0);
  await add.getByRole('button', { name: 'Bring in grant' }).click();

  // The grant opens at Active with what was brought in.
  await expect(page).toHaveURL(/\/grants\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('$20,000 of $40,000 received')).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}?tab=activity`);
  await expect(page.getByText('Brought into the portal at Active')).toBeVisible();

  // And it is on Budget vs. actual.
  await page.goto('/budget');
  await expect(page.getByText(TITLE).first()).toBeVisible();
});

test('the office assistant is not offered a grant already under way', async ({ page }) => {
  await freshStart(page, 'intern');
  await page.goto('/grants');
  await page.getByRole('button', { name: 'Add grant' }).click();
  const add = dialog(page, 'Add grant');
  await expect(add.getByText("We've already started working on this")).toBeVisible();
  await expect(add.getByText('This grant is already under way')).toHaveCount(0);
});
