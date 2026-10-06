// Sign in through the real form. No session is written beforehand: this spec is the one that
// checks the password itself. The demo logins come from the environment (`.env.local`, loaded by
// playwright.config.ts), never from the repo. A role whose password is not set is skipped, not
// failed: some passwords are held by the project owner only.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { freshStart } from './support';

const ROLES = [
  'ADMIN',
  'DIRECTOR',
  'OFFICE_MANAGER',
  'BOOKKEEPER',
  'TEACHER',
  'ASSISTANT',
  'READONLY',
] as const;

const env = (name: string) => process.env[name]?.trim() || undefined;

async function openLogin(page: Page) {
  await freshStart(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('a wrong password shows one plain error and clears the password field', async ({ page }) => {
  // Any demo username will do; without one, a made-up name gets the same answer.
  const username = ROLES.map(r => env(`DEMO_${r}_USERNAME`)).find(Boolean) ?? 'nobody';
  await openLogin(page);

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('That username and password don’t match.')).toHaveCount(1);
  await expect(page.getByLabel('Password')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

for (const role of ROLES) {
  test(`the ${role} login lands on the Dashboard`, async ({ page }) => {
    const username = env(`DEMO_${role}_USERNAME`);
    const password = env(`DEMO_${role}_PASSWORD`);
    test.skip(!username, `DEMO_${role}_USERNAME is not set`);
    test.skip(!password, `DEMO_${role}_PASSWORD is not set`);

    await openLogin(page);
    await page.getByLabel('Username').fill(username!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  });
}
