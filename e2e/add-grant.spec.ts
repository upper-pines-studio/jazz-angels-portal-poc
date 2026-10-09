// Signed in as keisha (Office manager): decision 0001 gives the office manager Edit on the grants
// pipeline, so Add grant stays on screen once roles are enforced (#17).
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart } from './support';

const TITLE = 'Summer combo camp';

test('add a grant in three steps, find it in the table and open it', async ({ page }) => {
  await freshStart(page, 'keisha');
  await page.goto('/grants');
  await expect(page.getByRole('heading', { name: 'Grants' })).toBeVisible();

  await page.getByRole('button', { name: 'Add grant' }).click();
  const add = dialog(page, 'Add grant');
  await expect(add.getByText('Step 1 of 3')).toBeVisible();

  // Step 1: funder, title and programs. The first program is ticked; the grant names two more.
  await field(add, 'Funder').selectOption({ label: 'Herb Alpert Foundation' });
  await field(add, 'Grant title').fill(TITLE);
  const programs = add.getByRole('group', { name: 'Programs' });
  await programs.getByText('In-School Program').click();
  await programs.getByText('Homeschool Program').click();
  await add.getByRole('button', { name: 'Next: Amount & dates' }).click();

  // Step 2: amount and dates.
  await expect(add.getByText('Step 2 of 3')).toBeVisible();
  await field(add, 'Amount requested').fill('12000');
  await field(add, 'Application due').fill('2026-11-02');
  await add.getByRole('button', { name: 'Next: Checklist' }).click();

  // Step 3: checklist, then create.
  await expect(add.getByText('Step 3 of 3')).toBeVisible();
  await add.getByRole('button', { name: 'Create grant' }).click();

  // The new grant opens on its own page.
  await expect(page).toHaveURL(/\/grants\/[^/?]+$/);
  const grantUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(
    page.getByText(
      'Herb Alpert Foundation · Studio Semester Sessions, In-School Program and Homeschool Program',
    ),
  ).toBeVisible();

  // It is in the table, and its row opens the same page.
  await page.getByRole('button', { name: 'All grants' }).click();
  await expect(page).toHaveURL(/\/grants$/);
  await page.getByPlaceholder('Search funders or grants').fill(TITLE);
  const row = page.getByText(TITLE, { exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${grantUrl}$`));
});

test('the grants list shows every program a grant names and filters by any of them', async ({
  page,
}) => {
  await freshStart(page, 'keisha');
  await page.goto('/grants');
  const port = page.getByText('In-School Program expansion', { exact: true });
  await expect(port).toBeVisible();
  // The Port of Long Beach grant is for In-School and Homeschool.
  await expect(page.getByText('In-school and Homeschool', { exact: true })).toBeVisible();

  const filter = page.locator('select').filter({ hasText: 'All programs' });
  await filter.selectOption({ label: 'Homeschool Program' });
  await expect(port).toBeVisible();
  await filter.selectOption({ label: 'In-School Program' });
  await expect(port).toBeVisible();
  await filter.selectOption({ label: 'Jazz Legacy Program' });
  await expect(port).toBeHidden();
});
