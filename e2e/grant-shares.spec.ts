// A grant's money shared out to programs and projects (decision 0006). Gwen (Admin) gives part
// of the Herb Alpert grant to the Homeschool Program from the grant's Award tab and finds it on
// the program's sheet; Margaret (Read-only) sees the same money with nothing to change.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart } from './support';

test('give a share from a grant and see it on the program', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/grants/g-herb-alpert-2026');
  const main = page.locator('main');

  // The Award tab carries "Where this grant's money goes": $2,000 of $50,000 not yet given.
  const card = main
    .getByRole('heading', { name: 'Where this grant’s money goes' })
    .locator('xpath=ancestor::div[.//select][1]');
  await expect(card.getByText('not yet given, of $50,000')).toBeVisible();
  await expect(card.getByText('$2,000', { exact: true })).toBeVisible();

  await field(card, 'Give to a program or project', 'select').selectOption({
    label: 'Homeschool Program',
  });
  await expect(field(card, 'Fiscal year', 'select')).toHaveValue('FY27');
  await field(card, 'Amount').fill('1500');
  await card.getByRole('button', { name: 'Give', exact: true }).click();

  await expect(card.getByRole('link', { name: 'Homeschool Program, FY27' })).toBeVisible();
  await expect(card.getByText('$500', { exact: true })).toBeVisible();

  // The share opens the program's sheet for that year, paid for by Herb Alpert.
  await card.getByRole('link', { name: 'Homeschool Program, FY27' }).click();
  await expect(page).toHaveURL(/\/programs\/homeschool\?fy=FY27$/);
  await expect(
    main.getByRole('heading', { name: 'Homeschool Program', exact: true }),
  ).toBeVisible();
  const paid = main.getByText('Paid for by', { exact: true }).locator('xpath=..');
  const row = paid.getByRole('listitem').filter({ hasText: 'Herb Alpert' });
  await expect(row).toContainText('$1,500');
  await expect(row).toContainText('$500 of $50,000 not yet given');
  const awarded = main.getByText('From awarded grants', { exact: true }).locator('xpath=..');
  await expect(awarded).toContainText('$1,500');
  // On the list too: Homeschool's $6,000 is now $5,500 funded ($4,000 of it if awarded).
  const list = page.getByRole('complementary', { name: 'Programs' });
  await expect(list.getByRole('link', { name: /Homeschool Program/ })).toContainText(
    '$5,500 of $6,000 · $500 to find',
  );

  // Take it back from the sheet: the grant has $2,000 to give again.
  await row.getByRole('button', { name: /Take back/ }).click();
  await dialog(page, 'Take back $1,500 from Homeschool Program, FY27?')
    .getByRole('button', { name: 'Take back' })
    .click();
  await expect(paid.getByRole('listitem').filter({ hasText: 'Herb Alpert' })).toHaveCount(0);
});

test('a read-only role sees where the money goes and cannot change it', async ({ page }) => {
  await freshStart(page, 'margaret');
  await page.goto('/grants/g-herb-alpert-2026');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Where this grant’s money goes' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Studio Semester Sessions, FY27' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Give', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);

  await page.goto('/programs/studio-sessions');
  await expect(main.getByText('Paid for by', { exact: true })).toBeVisible();
  await expect(main.getByText('Long Beach CF', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Change budget' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Add a project' })).toHaveCount(0);
});
