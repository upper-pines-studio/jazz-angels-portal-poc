// A new office on day one (decision 0004: the portal starts empty) puts its first class on the
// schedule and takes roll for it: a program on Programs, a venue on Partners, a session and an
// ensemble on the Schedule, a class, a student, then the roll call. As in empty-states.spec.ts,
// the dev server runs with the demo on, so each slice is stored empty before the app loads and
// nothing is seeded; the core slice adds back the seeded staff, so Devon Price is there to lead.
// Gwen (Admin) does it all. Today is the demo date, Sunday, September 13, 2026.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, field } from './support';

const SESSION_KEY = 'ja-portal:session:v1';
const slice = (id: string) => `ja-portal:${id}:v1`;

const EMPTY: Record<string, unknown> = {
  core: {
    staff: [],
    programs: [],
    organizations: [],
    venues: [],
    settings: { fiscalYearStartMonth: 7, enabledModules: ['grants', 'teaching', 'timesheets'] },
  },
  teaching: { terms: [], ensembles: [], meetings: [], students: [], attendance: [] },
  timesheets: { entries: [] },
};

async function startEmpty(page: Page) {
  await page.addInitScript(
    ({ data, sessionKey }) => {
      if (sessionStorage.getItem('e2e:started')) return;
      sessionStorage.setItem('e2e:started', '1');
      localStorage.clear();
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      localStorage.setItem(
        sessionKey,
        JSON.stringify({ username: 'gwen', signedInAt: new Date().toISOString() }),
      );
    },
    {
      data: Object.fromEntries(Object.entries(EMPTY).map(([id, v]) => [slice(id), v])),
      sessionKey: SESSION_KEY,
    },
  );
}

test('a new office adds a session, an ensemble and a class, and takes roll', async ({ page }) => {
  await startEmpty(page);
  const main = page.locator('main');

  // Nothing on the empty screens says a step is missing from the portal.
  for (const route of ['/settings', '/programs', '/schedule', '/schedule?view=term']) {
    await page.goto(route);
    await expect(main.locator('h3').first(), route).toBeVisible();
    await expect(main, route).not.toContainText('not built yet');
  }

  // A program, on the Programs page.
  await page.goto('/programs');
  await expect(main.getByText('No programs yet')).toBeVisible();
  await main.getByRole('button', { name: 'Add program' }).click();
  const program = dialog(page, 'Add program');
  await field(program, 'Name').fill('Studio Semester Sessions');
  await field(program, 'Short name').fill('Studio');
  await program.getByRole('button', { name: 'Add program' }).click();
  await expect(page).toHaveURL(/\/programs\/[^/]+$/);
  await expect(
    main.getByRole('heading', { name: 'Studio Semester Sessions', exact: true }),
  ).toBeVisible();

  // A venue, on Partners.
  await page.goto('/partners');
  await page.getByRole('button', { name: 'Add venue' }).first().click();
  const venue = dialog(page, 'Add venue');
  await field(venue, 'Name').fill('Jazz Angels Studio');
  await field(venue, 'Kind', 'select').selectOption('studio');
  await venue.getByRole('button', { name: 'Add venue' }).click();
  await expect(main.getByText('Jazz Angels Studio').first()).toBeVisible();

  // A session, on the Schedule's term view.
  await page.goto('/schedule?view=term');
  await expect(main.getByText('No session yet')).toBeVisible();
  await main.getByRole('button', { name: 'Add session' }).click();
  const session = dialog(page, 'Add session');
  await field(session, 'Name').fill('Fall 2026 session');
  await field(session, 'Starts').fill('2026-09-13');
  await field(session, 'Ends').fill('2026-11-08');
  await expect(field(session, 'Classes planned')).toHaveValue('8');
  await session.getByRole('button', { name: 'Add session' }).click();
  await expect(main.getByRole('heading', { name: 'Fall 2026 session' })).toBeVisible();

  // An ensemble, from the top bar while there is none.
  await page.getByRole('button', { name: 'Add ensemble' }).first().click();
  const ensemble = dialog(page, 'Add ensemble');
  await field(ensemble, 'Name').fill('Combo A');
  await field(ensemble, 'Lead teacher', 'select').selectOption({ label: 'Devon Price' });
  await field(ensemble, 'Room').fill('Studio 1');
  await ensemble.getByRole('radio', { name: 'Teal' }).click();
  await ensemble.getByRole('button', { name: 'Add ensemble' }).click();
  await expect(main.getByText('Combo A')).toBeVisible();

  // A class today, from Add class, which the top bar now offers.
  await page.getByRole('button', { name: 'Add class' }).click();
  const addClass = dialog(page, 'Add class');
  await field(addClass, 'Date').fill('2026-09-13');
  await addClass.getByRole('button', { name: 'Add class' }).click();

  // A student on its roster.
  await page.goto('/students');
  await page.getByRole('button', { name: 'Enroll student' }).first().click();
  const enroll = dialog(page, 'Enroll student');
  await field(enroll, 'Student').fill('Ada Brooks');
  await field(enroll, 'Instrument').fill('Trumpet');
  await field(enroll, 'Guardian').fill('Lena Brooks');
  await field(enroll, 'Ensemble', 'select').selectOption({ label: 'Combo A · Studio 1' });
  await enroll.getByRole('button', { name: 'Enroll student' }).click();

  // The class is on this week's grid; its roll call opens and goes in.
  await page.goto('/schedule');
  await expect(page.getByText('Fall 2026 session · week 1 of 8').first()).toBeVisible();
  await page.getByRole('button', { name: /^Combo A/ }).click();
  await expect(page).toHaveURL(/\/roll\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Combo A' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ada Brooks: mark' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit roll call' }).click();
  await expect(page).toHaveURL(/\/schedule$/);

  await page.goto('/schedule?view=term');
  await expect(main.getByText('1 of 1 Sundays taken')).toBeVisible();
});
