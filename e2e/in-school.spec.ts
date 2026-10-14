// In-school is the program's own flag, not its id (#79). Gwen (Admin) adds a program taught in
// schools; Devon (Teacher) logs hours on it, and Timesheets' "In-school hours" counts them
// alongside the In-School Program's.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart, switchUser } from './support';

test('a new program marked in-school counts in In-school hours', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/programs');
  const main = page.locator('main');

  await page.getByRole('button', { name: 'Add program' }).first().click();
  const add = dialog(page, 'Add program');
  await field(add, 'Name').fill('School Residencies');
  await add.getByText('Taught in schools').click();
  await add.getByRole('button', { name: 'Add program' }).click();
  await expect(
    main.getByRole('heading', { name: 'School Residencies', exact: true }),
  ).toBeVisible();
  await expect(main.getByText('In-school', { exact: true }).locator('xpath=..')).toContainText(
    'Yes',
  );

  // Devon's own in-school hours this month: the In-School Program's 3.25, then 2 more.
  await switchUser(page, 'devon');
  await page.goto('/timesheets');
  await expect(main).toContainText(/In-school hours\s*3\.25/);

  await page.getByRole('button', { name: 'Log hours' }).click();
  const log = dialog(page, 'Log hours');
  await field(log, 'Program', 'select').selectOption({ label: 'School Residencies' });
  await field(log, 'Activity').fill('Residency week 1');
  await field(log, 'Hours').fill('2');
  await log.getByRole('button', { name: 'Log hours' }).click();

  await expect(page.getByText('Hours logged')).toBeVisible();
  await expect(main).toContainText(/In-school hours\s*5\.25/);
});
