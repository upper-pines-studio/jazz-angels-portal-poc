// Settings › Staff: an email is optional, refused when it is bad or another person's, and survives a reload.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart } from './support';

test('an admin adds, changes and clears a staff email in Settings', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/settings');

  await page.getByRole('button', { name: 'Add person' }).first().click();
  const add = dialog(page, 'Add person');
  await field(add, 'Name').fill('Dana Whitfield');

  await field(add, 'Email').fill('dana@');
  await add.getByRole('button', { name: 'Add person' }).click();
  await expect(
    add.getByText('Check the email. It should look like name@example.com.'),
  ).toBeVisible();

  await field(add, 'Email').fill('Barry.Cogert@example.org');
  await add.getByRole('button', { name: 'Add person' }).click();
  await expect(add.getByText('Barry Cogert already has that email.')).toBeVisible();

  await field(add, 'Email').fill(' Dana@Example.org ');
  await add.getByRole('button', { name: 'Add person' }).click();

  await page.reload();
  // Dana is the last person on the list.
  await page.getByRole('link', { name: 'Edit' }).last().click();
  const edit = dialog(page, 'Edit person');
  await expect(field(edit, 'Email')).toHaveValue('dana@example.org');
  await field(edit, 'Email').fill('');
  await edit.getByRole('button', { name: 'Save person' }).click();

  await page.reload();
  await page.getByRole('link', { name: 'Edit' }).last().click();
  await expect(field(dialog(page, 'Edit person'), 'Email')).toHaveValue('');
});
