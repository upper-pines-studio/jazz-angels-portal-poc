// Grants › a grant's page: "Start next year's" makes next year's grant from this one (#67).
// Gwen (Admin) renews the Herb Alpert grant: the dialog is prefilled, the renewal opens at
// Prospect with the renewal checklist, and both grants and the funder page show the link.
// Walt (Bookkeeper) may not add a grant, so he is not offered it.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart, switchUser } from './support';

const LAST = 'General operating support 2026';
const NEXT = 'General operating support 2027';

test("renew a grant: next year's opens at Prospect, linked both ways", async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto('/grants/g-herb-alpert-2026');
  const main = page.locator('main');

  await page.getByRole('button', { name: "Start next year's" }).click();
  const renew = dialog(page, "Start next year's grant");
  await expect(field(renew, 'Grant title')).toHaveValue(NEXT);
  await expect(field(renew, 'Amount to request')).toHaveValue('50,000');
  await expect(field(renew, 'Application due')).toHaveValue('2027-04-30');
  await expect(field(renew, 'Grant period start')).toHaveValue('2027-07-01');
  await expect(field(renew, 'Grant period end')).toHaveValue('2028-06-30');
  await expect(field(renew, 'Expected decision')).toHaveValue('');
  await renew.getByRole('button', { name: "Start next year's grant" }).click();

  // Next year's grant opens on its own page, at Prospect, linked to last year's.
  await expect(page.getByRole('heading', { level: 1, name: NEXT })).toBeVisible();
  const nextUrl = new URL(page.url()).pathname;
  expect(nextUrl).not.toBe('/grants/g-herb-alpert-2026');
  const header = page.getByRole('banner');
  await expect(header).toContainText(`Renews ${LAST}`);
  await expect(main.getByText('Confirm the funder is renewing this cycle')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start application' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Start next year's" })).toHaveCount(0);

  await page.goto(`${nextUrl}?tab=activity`);
  await expect(main.getByText(`Started as the renewal of ${LAST}`)).toBeVisible();

  // Last year's grant links forward, and is not offered a second renewal.
  await header.getByRole('link', { name: LAST }).click();
  await expect(page).toHaveURL(/\/grants\/g-herb-alpert-2026$/);
  await expect(header).toContainText(`Renewed as ${NEXT}`);
  await expect(header.getByRole('link', { name: NEXT })).toBeVisible();
  await expect(page.getByRole('button', { name: "Start next year's" })).toHaveCount(0);
  await page.goto('/grants/g-herb-alpert-2026?tab=activity');
  await expect(main.getByText(`Renewed as ${NEXT}`)).toBeVisible();

  // The funder's grant history keeps them together, the renewal first.
  await page.goto('/funders/f-herb-alpert');
  await expect(main.getByText(`Renews ${LAST}`)).toBeVisible();
  const top = async (title: string) =>
    (await main.getByText(title, { exact: true }).first().boundingBox())!.y;
  expect(await top(NEXT)).toBeLessThan(await top(`Renews ${LAST}`));
  expect(await top(`Renews ${LAST}`)).toBeLessThan(await top(LAST));

  // Walt, the bookkeeper, may not add a grant: no button on an awarded grant.
  await switchUser(page, 'walt');
  await page.goto('/grants/g-la-county-2026');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: "Start next year's" })).toHaveCount(0);
});
