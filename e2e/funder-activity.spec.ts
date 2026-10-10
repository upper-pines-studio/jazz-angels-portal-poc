// Funders › a funder's page: Recent activity lists what has happened on its grants, newest
// first, each line naming its grant and linking to that grant's Activity tab.
// Gwen (Admin) adds a note on the Herb Alpert grant and finds it at the top of the funder's page.
import { expect, test } from '@playwright/test';
import { freshStart } from './support';

test("a note on a grant shows first in its funder's Recent activity", async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/grants/g-herb-alpert-2026?tab=activity');
  const main = page.locator('main');

  await main.getByPlaceholder(/Add a note/).fill('Called Maria about the renewal timeline');
  await main.getByRole('button', { name: 'Add note' }).click();
  await expect(main.getByText('Called Maria about the renewal timeline')).toBeVisible();

  await page.goto('/funders/f-herb-alpert');
  await expect(main.getByText('Recent activity', { exact: true })).toBeVisible();
  const first = main.getByText('Called Maria about the renewal timeline');
  await expect(first).toBeVisible();
  // The seeded rows follow, the oldest ("Grant added") last.
  await expect(main.getByText('Grant added', { exact: true })).toBeVisible();
  const grantLinks = main.getByRole('link', { name: 'General operating support 2026' });
  await expect(grantLinks).toHaveCount(8);

  await grantLinks.first().click();
  await expect(page).toHaveURL(/\/grants\/g-herb-alpert-2026\?tab=activity$/);
  await expect(main.getByText('Called Maria about the renewal timeline')).toBeVisible();
});
