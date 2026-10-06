// Signed in as devon (Teacher): decision 0001 lets a teacher take roll for his own classes, and
// Devon leads Big Band, which meets on the demo day (Sunday, September 13). A teacher sees the
// whole schedule, so this keeps passing once roles are enforced (#17).
import { expect, test } from '@playwright/test';
import { freshStart } from './support';

const CLASS = 'Big Band';

test("take roll for today's class, marking one student absent", async ({ page }) => {
  await freshStart(page, 'devon');
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();

  await page.getByRole('button', { name: new RegExp(`^${CLASS}`) }).click();
  await expect(page).toHaveURL(/\/roll\/[^/]+$/);
  const rollUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: CLASS })).toBeVisible();

  // The first student on the roster is marked absent; everyone else stays present.
  const marks = page.getByRole('group', { name: /: mark$/ }).first();
  const student = (await marks.getAttribute('aria-label'))!.replace(/: mark$/, '');
  await marks.getByRole('button', { name: 'Absent' }).click();
  await expect(marks.getByRole('button', { name: 'Absent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('1 absent', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Submit roll call' }).click();
  await expect(page).toHaveURL(/\/schedule$/);

  // Back on the class: submitted, with the absence written down.
  await page.getByRole('button', { name: new RegExp(`^${CLASS}`) }).click();
  await expect(page).toHaveURL(new RegExp(`${rollUrl}$`));
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  await expect(page.getByText('1 absent', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit roll call' })).toHaveCount(0);
  // The innermost block holding the student's name is that student's row.
  const row = page
    .locator('div')
    .filter({ has: page.getByText(student, { exact: true }) })
    .last();
  await expect(row.getByText('Absent', { exact: true })).toBeVisible();
});
