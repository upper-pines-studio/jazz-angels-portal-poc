// Operations › Programs: open it from the rail, add a program, edit it, archive it and restore it.
// Gwen (Admin) manages programs; Keisha (Office manager) has no Programs rights and only reads;
// Devon (Teacher) has no "Program budgets and projects" and does not see the page.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart } from './support';

test('an admin opens Programs from the rail, adds a program, archives and restores it', async ({
  page,
}) => {
  await freshStart(page, 'gwen');
  await page.goto('/');
  const main = page.locator('main');

  await page.getByRole('navigation').getByText('Programs', { exact: true }).click();
  await expect(page).toHaveURL(/\/programs\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Programs', level: 1 })).toBeVisible();

  // Add one: it is selected, and its sheet shows the name and short name.
  await page.getByRole('button', { name: 'Add program' }).click();
  const add = dialog(page, 'Add program');
  await field(add, 'Name').fill('Summer Jazz Camp');
  await field(add, 'Short name').fill('Camp');
  await add.getByRole('button', { name: 'Add program' }).click();
  await expect(page).toHaveURL(/\/programs\/p-[^/]+$/);
  const list = page.getByRole('complementary', { name: 'Programs' });
  await expect(list.getByRole('link', { name: /Summer Jazz Camp/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(main.getByRole('heading', { name: 'Summer Jazz Camp', exact: true })).toBeVisible();
  await expect(main.getByText('Camp', { exact: true }).first()).toBeVisible();

  // Edit it.
  await main.getByRole('button', { name: 'Edit' }).click();
  const edit = dialog(page, 'Edit program');
  await field(edit, 'Short name').fill('Summer');
  await edit.getByRole('button', { name: 'Save program' }).click();
  await expect(main.getByText('Summer', { exact: true }).first()).toBeVisible();

  // Archive it: it leaves the list; Show archived brings it back, with Restore.
  await main.getByRole('button', { name: 'Archive' }).click();
  await dialog(page, 'Archive Summer Jazz Camp?').getByRole('button', { name: 'Archive' }).click();
  await expect(list.getByRole('link', { name: /Summer Jazz Camp/ })).toHaveCount(0);
  await list.getByText(/Show archived/).click();
  await list.getByRole('link', { name: /Summer Jazz Camp/ }).click();
  await expect(page).toHaveURL(/archived=1/);
  await main.getByRole('button', { name: 'Restore' }).click();
  await expect(main.getByRole('button', { name: 'Archive' })).toBeVisible();
  await list.getByText(/Show archived/).click();
  await expect(list.getByRole('link', { name: /Summer Jazz Camp/ })).toBeVisible();
});

test('a role without program rights reads the programs and cannot change them', async ({
  page,
}) => {
  await freshStart(page, 'keisha');
  await page.goto('/programs');
  const main = page.locator('main');
  await expect(page).toHaveURL(/\/programs\/[^/]+$/);
  await expect(main.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add program' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Archive' })).toHaveCount(0);
});

test('a Teacher does not see the Programs page', async ({ page }) => {
  await freshStart(page, 'devon');
  await page.goto('/programs');
  await expect(page.getByRole('heading', { name: 'No access', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Programs', { exact: true })).toHaveCount(0);
});

test('Settings points to the Programs page', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Open Programs' }).click();
  await expect(page).toHaveURL(/\/programs\/[^/]+$/);
});
