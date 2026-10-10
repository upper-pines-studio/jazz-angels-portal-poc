// Signed in as gwen (Admin): she may edit students, so she records a photo release (#65). Beatriz
// Pena plays piano in Big Band, which meets on the demo day; her guardian has not been asked yet,
// so her row on the class's Roll call carries the "No photos" marker until the release is Given.
import { expect, test } from '@playwright/test';
import { freshStart } from './support';

const STUDENT = 'Beatriz Pena';
const ROLL = '/roll/e-big-band-f1';

test('record a photo release and see the roll call marker go', async ({ page }) => {
  await freshStart(page, 'gwen');
  await page.goto(ROLL);
  await expect(page.getByRole('heading', { name: 'Big Band' })).toBeVisible();
  const row = page.locator('.ja-roll-row').filter({ hasText: STUDENT });
  await expect(row.getByText('No photos', { exact: true })).toBeVisible();

  // The Students list filters to who has no release; Beatriz is among them.
  await page.goto('/students');
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await page.getByLabel('Photo release').selectOption('no-release');
  await expect(page.getByText('Hana Sato')).toHaveCount(0);
  await page.getByPlaceholder('Search students or guardians').fill('Beatriz');

  // She is the one row left, so her card is open; record the release there.
  await expect(page.getByText(STUDENT)).toHaveCount(2);
  await page.getByText(STUDENT).first().click();
  await page
    .locator('label')
    .filter({ hasText: /^Given$/ })
    .click();
  await expect(page.getByText('Date given', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save release' }).click();
  await expect(page.getByText('Photo release saved')).toBeVisible();
  await expect(page.getByText('Recorded by Gwen Kimura', { exact: true })).toBeVisible();
  await expect(page.getByText('Given · Sep 13, 2026', { exact: true })).toBeVisible();
  // She has left the filtered list; only her card still names her.
  await expect(page.getByText('Everyone here has a release')).toBeVisible();
  await expect(page.getByText(STUDENT, { exact: true })).toHaveCount(1);

  // Back on the roll call the marker is gone; Omar Haddad, whose guardian said no, keeps his.
  await page.goto(ROLL);
  await expect(row).toBeVisible();
  await expect(row.getByText('No photos', { exact: true })).toHaveCount(0);
  const omar = page.locator('.ja-roll-row').filter({ hasText: 'Omar Haddad' });
  await expect(omar.getByText('No photos', { exact: true })).toBeVisible();
});
