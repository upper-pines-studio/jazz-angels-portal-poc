// Signed in as keisha (Office manager), who may edit the award and assign transactions, so the
// Expenses tab offers Send back to Transactions (decision 0001).
import { expect, test } from '@playwright/test';
import { dialog, freshStart } from './support';

// The seeded Herb Alpert expense with two backup files and a backup note.
const GRANT = 'g-herb-alpert-2026';
const EXPENSE = 'ex-ha-2';
const PAYEE = 'Signal Hill Music Service';

test('send back from the Expenses tab asks first, and Undo puts the backup back', async ({
  page,
}) => {
  await freshStart(page, 'keisha');
  await page.goto(`/grants/${GRANT}?tab=expenses&expense=${EXPENSE}`);
  const detail = page.locator('#expense-detail');
  const row = page.locator(`[data-expense="${EXPENSE}"]`);
  await expect(detail.getByRole('heading', { name: PAYEE })).toBeVisible();
  await expect(row).toContainText('2 files');

  // The confirm says what goes, and that QuickBooks is not touched.
  await detail.getByRole('button', { name: 'Send back to Transactions' }).click();
  const confirm = dialog(page, 'Send back to assign?');
  await expect(confirm).toContainText(
    `This takes the expense from ${PAYEE} off the budget and deletes its 2 backup files and its backup note.`,
  );
  await expect(confirm).toContainText('QuickBooks is not changed.');
  await confirm.getByRole('button', { name: 'Send back', exact: true }).click();

  // It has left the grant's list (the store changed, not just the toast), and the toast,
  // which goes after 4 seconds, offers Undo. Nothing navigates before Undo is pressed.
  await expect(row).toHaveCount(0);
  const toast = page.locator('.ja-toasts');
  const undo = toast.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await expect(toast).toContainText('Its backup was removed.');
  await undo.click();
  await expect(toast).toContainText('Put back as it was');

  // Back as it was: the same expense, its two files and its note.
  await expect(row).toContainText('2 files');
  await row.click();
  await expect(detail.getByText('Receipt, Signal Hill Music Service.jpg')).toBeVisible();
  await expect(detail.getByText('Invoice 3318, tenor sax overhaul.pdf')).toBeVisible();
  await expect(detail.getByRole('textbox')).toHaveValue(/^Quote approved by Barry on Jul 12\./);
});
