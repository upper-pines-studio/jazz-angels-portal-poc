// Office › Documents (decision 0005): the papers every funder asks for, kept once with versions
// and expiry. Gwen (Admin) adds a new version of the insurance certificate, which expires soon in
// the demo, and sees the new date; the older version stays. The intern (Office assistant) sees
// the documents but cannot add a version; Devon (Teacher) does not see the page.
import { expect, test } from '@playwright/test';
import { dialog, freshStart } from './support';

test('an admin adds a new version and the document shows its new date', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/');
  const main = page.locator('main');

  // The dashboard warns about the certificate before anything changes.
  const attention = main.getByText('Certificate of liability insurance');
  await expect(attention).toBeVisible();
  await expect(main.getByText('Expires soon', { exact: true })).toBeVisible();

  await page.getByRole('navigation').getByText('Documents', { exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByText('6 documents · 1 to renew')).toBeVisible();

  await main.getByText('Certificate of liability insurance', { exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/doc-insurance$/);
  const panel = page.getByRole('complementary', { name: 'Certificate of liability insurance' });
  await expect(panel.getByText('Expires Oct 1, 2026, in 18 days').first()).toBeVisible();

  await panel.getByRole('button', { name: 'Add version' }).click();
  const add = dialog(page, 'Add version');
  await add.locator('input[type=file]').setInputFiles({
    name: 'Certificate of liability insurance 2026-27.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 /Type /Page '),
  });
  await add.locator('input[type=date]').fill('2027-10-01');
  await add.getByRole('button', { name: 'Add version' }).click();

  // The new version is current, with its date; the old one is an earlier version.
  await expect(panel.getByText('Expires Oct 1, 2027').first()).toBeVisible();
  await expect(panel.getByText('Certificate of liability insurance 2026-27.pdf')).toBeVisible();
  await expect(panel.getByText('Certificate of liability insurance 2025-26.pdf')).toBeVisible();
  await expect(panel.getByText('Added by Gwen Kimura on Sep 13, 2026')).toBeVisible();
  await expect(page.getByText('6 documents', { exact: true })).toBeVisible();

  // And the dashboard no longer lists it.
  await page.getByRole('navigation').getByText('Dashboard', { exact: true }).click();
  await expect(main.getByText('Certificate of liability insurance')).toHaveCount(0);
});

test('an admin adds a document, archives it and restores it', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/documents');
  const main = page.locator('main');

  await page.getByRole('button', { name: 'Add document' }).click();
  const add = dialog(page, 'Add document');
  await add.locator('select').selectOption('other');
  await add.locator('input:not([type=file]):not([type=date])').fill('Letter of support');
  await add.locator('input[type=file]').setInputFiles({
    name: 'Letter of support.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  });
  await add.getByRole('button', { name: 'Add document' }).click();
  await expect(page).toHaveURL(/\/documents\/doc-/);
  const panel = page.getByRole('complementary', { name: 'Letter of support' });
  await expect(panel.getByText('Never expires').first()).toBeVisible();

  await panel.getByRole('button', { name: 'Archive' }).click();
  await dialog(page, 'Archive Letter of support?').getByRole('button', { name: 'Archive' }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(main.getByText('Letter of support', { exact: true })).toHaveCount(0);

  await main.getByText('Show archived (1)').click();
  await main.getByText('Letter of support', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Letter of support' }).getByRole('button', {
      name: 'Add version',
    }),
  ).toBeVisible();
});

test('an office assistant reads the documents but cannot add a version', async ({ page }) => {
  await freshStart(page, 'intern');
  await page.goto('/documents/doc-insurance');
  const panel = page.getByRole('complementary', { name: 'Certificate of liability insurance' });
  await expect(panel.getByText('Current version')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add version' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add document' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Open' }).first()).toBeVisible();
});

test('a teacher has no Documents in the rail and no access to the page', async ({ page }) => {
  await freshStart(page, 'devon');
  await page.goto('/');
  await expect(page.getByRole('navigation').getByText('Timesheets')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Documents', { exact: true })).toHaveCount(0);
  await page.goto('/documents');
  await expect(page.getByText('You do not have access to this')).toBeVisible();
});
