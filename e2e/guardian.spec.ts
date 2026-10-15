// Signed in as gwen (Admin): she gives Devon Ellis's guardian (one the demo leaves blank) an email and an address on the
// Guardian card, and imports two students with an email and an address column, one with an email
// that is not one (#82). Then intern (Office assistant), who may not see guardian contacts, sees
// neither the email nor the address, nor the card.
import { expect, test } from '@playwright/test';
import { dialog, field, freshStart, switchUser } from './support';

const STUDENT = 'Devon Ellis';

test('a guardian email and address: entered, imported, and kept from the assistant', async ({
  page,
}) => {
  await freshStart(page, 'gwen');
  await page.goto('/students');
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await page.getByPlaceholder('Search students or guardians').fill(STUDENT);
  await page.getByText(STUDENT).first().click();
  await expect(page.getByText('Who we call about this student')).toBeVisible();

  // A malformed email and half an address are refused with what is wrong.
  await field(page, 'Guardian email').fill('angela at example');
  await field(page, 'Guardian address').fill('1520 E 7th St');
  await page.getByRole('button', { name: 'Save guardian' }).click();
  await expect(
    page.getByText('Check the email. It should look like name@example.com.'),
  ).toBeVisible();
  await expect(
    page.getByText('Add the city, state and ZIP, or leave the address blank.'),
  ).toBeVisible();

  await field(page, 'Guardian email').fill('angela.ellis@example.com');
  await field(page, 'City').fill('Long Beach');
  await field(page, 'State').fill('CA');
  await field(page, 'ZIP').fill('90813');
  await page.getByRole('button', { name: 'Save guardian' }).click();
  await expect(page.getByText('Guardian saved')).toBeVisible();
  await expect(page.getByText('angela.ellis@example.com', { exact: true })).toBeVisible();
  await expect(
    page.getByText('1520 E 7th St, Long Beach, CA 90813', { exact: true }),
  ).toBeVisible();

  // The import reads both, shows them, and flags the bad email on its row only.
  await page.getByPlaceholder('Search students or guardians').fill('');
  await page.getByRole('button', { name: 'Import' }).first().click();
  const importing = dialog(page, 'Import students');
  await importing.locator('input[type=file]').setInputFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Name,Instrument,Guardian name,Guardian email,Address,Program,Ensemble',
        'Ana Ruiz,Alto sax,Rosa Ruiz,rosa@example.com,"8500 Contreras St, Paramount, CA 90723",Studio Semester Sessions,Big Band',
        'Bo Lin,Bass,Mei Lin,mei at example,,Studio Semester Sessions,',
      ].join('\n'),
    ),
  });
  await expect(importing.getByText('rosa@example.com', { exact: true })).toBeVisible();
  await expect(
    importing.getByText('8500 Contreras St, Paramount, CA 90723', { exact: true }),
  ).toBeVisible();
  await expect(
    importing.getByText('Email "mei at example" looks wrong; it will be left off'),
  ).toBeVisible();
  await importing.getByRole('button', { name: 'Import 2 students' }).click();
  await expect(page.getByText('2 students added · 0 skipped')).toBeVisible();

  // The Office assistant sees the student, but none of the guardian's contacts.
  await switchUser(page, 'intern');
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await page.getByPlaceholder('Search students').fill(STUDENT);
  await page.getByText(STUDENT).first().click();
  await expect(page.getByText('Last five marks')).toBeVisible();
  await expect(page.getByText('angela.ellis@example.com')).toHaveCount(0);
  await expect(page.getByText('1520 E 7th St', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Who we call about this student')).toHaveCount(0);
});
