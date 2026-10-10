// A grant's register uses the office's documents (#68). Gwen (Admin) adds a new version of the
// insurance certificate and of the audited financials on Office › Documents: the Port of Long
// Beach grant, not submitted yet, shows the new certificate; the LA County grant, submitted in
// March 2025, keeps the financials that went in. The intern (Office assistant) links a register
// row to the organization's W-9 and unlinks it again.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, field, freshStart } from './support';

const PORT = '/grants/g-port-of-long-beach-2026?tab=documents';
const LA_COUNTY = '/grants/g-la-county-2026?tab=documents';

async function addVersion(page: Page, documentId: string, name: string, panelName: string) {
  await page.goto(`/documents/${documentId}`);
  const panel = page.getByRole('complementary', { name: panelName });
  await panel.getByRole('button', { name: 'Add version' }).click();
  const add = dialog(page, 'Add version');
  await add.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 /Type /Page '),
  });
  await add.getByRole('button', { name: 'Add version' }).click();
  await expect(panel.getByText(name)).toBeVisible();
}

test('a new version shows on an unsubmitted grant, not on one submitted before it', async ({
  page,
}) => {
  await freshStart(page, 'gwen');
  const main = page.locator('main');

  // Before: the Port's certificate is the one expiring soon; LA County sent last year's financials.
  await page.goto(PORT);
  await expect(main.getByText('Current version, added Oct 1, 2025')).toBeVisible();
  await expect(main.getByText('Expires soon', { exact: true })).toBeVisible();
  await page.goto(LA_COUNTY);
  await expect(main.getByText('Added Nov 18, 2024 · went in on Mar 10, 2025')).toBeVisible();
  await expect(main.getByText('Older version', { exact: true })).toBeVisible();

  await addVersion(
    page,
    'doc-insurance',
    'Certificate of liability insurance 2026-27.pdf',
    'Certificate of liability insurance',
  );
  await addVersion(
    page,
    'doc-financials',
    'Audited financial statements FY26.pdf',
    'Audited financial statements',
  );

  // The Port's certificate and financials rows now show the versions added today, with no warning.
  await page.goto(PORT);
  await expect(main.getByText('Current version, added Sep 13, 2026')).toHaveCount(2);
  await expect(main.getByText('Expires soon', { exact: true })).toHaveCount(0);

  // LA County still shows what went in.
  await page.goto(LA_COUNTY);
  await expect(main.getByText('Added Nov 18, 2024 · went in on Mar 10, 2025')).toBeVisible();

  // The row links to the document on Office › Documents.
  await main.getByRole('link', { name: 'Audited financial statements' }).click();
  await expect(page).toHaveURL(/\/documents\/doc-financials$/);
});

test('an office assistant links a register row to the organization’s copy and unlinks it', async ({
  page,
}) => {
  await freshStart(page, 'intern');
  await page.goto(PORT);
  const main = page.locator('main');

  await main.getByRole('button', { name: 'Add document' }).click();
  const add = dialog(page, 'Add document');
  await field(add, 'Name').fill('Signed W-9');
  await field(add, 'Kind', 'select').selectOption('w9');
  await add.getByRole('button', { name: "Use the organization's" }).click();
  await expect(field(add, 'Link')).toHaveCount(0);
  await expect(field(add, "Organization's copy", 'select')).toHaveValue('doc-w9');
  await add.getByRole('button', { name: 'Save' }).click();

  await expect(main.getByRole('link', { name: 'W-9', exact: true })).toBeVisible();
  await expect(main.getByText('Current version, added Jan 12, 2026')).toBeVisible();

  await main.getByText('Signed W-9', { exact: true }).click();
  const edit = dialog(page, 'Edit document');
  await edit.getByRole('button', { name: 'Use its own link' }).click();
  await field(edit, 'Link').fill('https://drive.example/w9');
  await edit.getByRole('button', { name: 'Save' }).click();

  await expect(main.getByRole('link', { name: 'W-9', exact: true })).toHaveCount(0);
  await expect(main.getByText('Current version, added Jan 12, 2026')).toHaveCount(0);
});
