// Signed in as keisha (Office manager): decision 0001 lets the office manager assign and split
// transactions, so the line picker stays on screen once roles are enforced (#17).
import { expect, test } from '@playwright/test';
import { freshStart } from './support';

// A seeded to-assign transaction whose account fits two grants, so no suggestion is waiting and
// the row shows the grant-and-line picker.
const PAYEE = 'Renee Cole';
const AMOUNT = '$540';
const MEMO = 'In-school residency, week 2';
const LINE = 'Teaching artist stipends';
const FUNDER = 'Herb Alpert';

test('assign a transaction to a grant and budget line', async ({ page }) => {
  await freshStart(page, 'keisha');
  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  const picker = page.getByRole('combobox', {
    name: `Grant and budget line for ${PAYEE}, ${AMOUNT}`,
  });
  await picker.selectOption({ label: `${LINE} · ${FUNDER}` });

  // It leaves the To assign tab…
  await expect(page.getByText('Assigned', { exact: true }).first()).toBeVisible();
  await expect(picker).toHaveCount(0);

  // …and shows on the Assigned tab with its line and grant.
  await page.getByRole('button', { name: /^Assigned/ }).click();
  await expect(page).toHaveURL(/tab=assigned/);
  await page.getByRole('textbox', { name: 'Search payee or memo' }).fill(MEMO);
  const table = page.getByRole('table', { name: 'Transactions' });
  await expect(table.getByText(PAYEE, { exact: true })).toBeVisible();
  await expect(table.getByText(LINE, { exact: true })).toBeVisible();
  await expect(table.getByText(new RegExp(`^${FUNDER}`))).toBeVisible();

  // That grant's Expenses tab lists it.
  await page.getByRole('button', { name: `More for ${PAYEE}, ${AMOUNT}` }).click();
  await page.getByRole('menuitem', { name: 'See in grant' }).click();
  await expect(page).toHaveURL(/\/grants\/[^/?]+\?tab=expenses/);
  const main = page.getByRole('main');
  await expect(main.getByText(PAYEE, { exact: true }).first()).toBeVisible();
  await expect(main.getByText(MEMO).first()).toBeVisible();
});
