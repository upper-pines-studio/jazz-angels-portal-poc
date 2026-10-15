// Sessions per program (decision 0007, #83). Keisha (Office manager) adds an in-school term that
// runs right across the studio's Fall 2026 session: both are current, each heading names its line,
// and Paramount MS follows its own term. A second session for all programs on the same weeks is
// refused, naming the one it clashes with. Today is the demo date, Sunday, September 13, 2026.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart } from './support';

test('an in-school term runs beside the studio session, and an overlap is refused', async ({
  page,
}) => {
  await freshStart(page, 'keisha');
  await page.goto('/schedule?view=term');
  const main = page.locator('main');

  await main.getByRole('button', { name: 'Add session' }).click();
  const add = dialog(page, 'Add session');
  await field(add, 'Name').fill('Fall in-school term');
  await field(add, 'Program', 'select').selectOption({ label: 'In-School Program' });
  await field(add, 'Starts').fill('2026-08-31');
  await field(add, 'Ends').fill('2026-12-18');
  await add.getByRole('button', { name: 'Add session' }).click();

  // Each line's session has its card, named for its line.
  await expect(
    main.getByRole('heading', { name: 'All programs: Fall 2026 session' }),
  ).toBeVisible();
  await expect(main.getByRole('heading', { name: 'In-school: Fall in-school term' })).toBeVisible();
  await expect(page.getByText('In-school: Fall in-school term · week 2 of 16')).toBeVisible();

  // The card numbers its dots by the session's calendar, as the heading does: Thu Sep 17 is week 3.
  await expect(main.getByText(/\d+ of 16 weeks on the schedule/)).toBeVisible();
  await expect(
    main.locator('.ja-term-dot').filter({ hasText: 'Sep 17' }).getByText('Week 3', { exact: true }),
  ).toBeVisible();

  // Another session for all programs on the studio's weeks is refused under the dates.
  await main.getByRole('button', { name: 'Add session' }).click();
  const clash = dialog(page, 'Add session');
  await field(clash, 'Name').fill('Autumn intensive');
  await field(clash, 'Starts').fill('2026-10-01');
  await field(clash, 'Ends').fill('2026-10-31');
  await expect(clash).toContainText(
    'The dates overlap Fall 2026 session (Sep 13 – Nov 8, 2026), another session for all programs.',
  );
  await clash.getByRole('button', { name: 'Add session' }).click();
  await expect(clash).toBeVisible();
  await clash.getByRole('button', { name: 'Cancel' }).click();
  await expect(main.getByText('Autumn intensive')).toHaveCount(0);

  // The week grid carries a badge for each line.
  await page.goto('/schedule');
  await expect(
    page.getByText('All programs: Fall 2026 session · week 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('In-school: Fall in-school term · week 2', { exact: true }),
  ).toBeVisible();
});
