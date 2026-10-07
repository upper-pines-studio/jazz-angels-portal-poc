// Every route as a new office sees it on day one (decision 0004: the portal starts empty).
// Each slice is stored empty before the app loads, so nothing is seeded, and Gwen (Admin, who
// sees every screen) opens each route in turn. A route passes when it shows an empty state, logs
// no error and prints no NaN or "undefined". The core slice still adds the seeded staff records,
// so every login keeps resolving (src/core/store.tsx, `normalise`).
import { expect, test } from '@playwright/test';

const SESSION_KEY = 'ja-portal:session:v1';
const slice = (id: string) => `ja-portal:${id}:v1`;

const EMPTY: Record<string, unknown> = {
  core: {
    staff: [],
    programs: [],
    organizations: [],
    venues: [],
    settings: {
      fiscalYearStartMonth: 7,
      enabledModules: ['grants', 'teaching', 'timesheets'],
      demoToday: '2026-09-13',
    },
  },
  grants: {
    ...Object.fromEntries(
      [
        'funders',
        'grants',
        'tasks',
        'documents',
        'payments',
        'budgetLines',
        'expenses',
        'reports',
        'activity',
        'templates',
        'accounts',
        'classes',
        'transactions',
        'incoming',
        'splitRules',
        'files',
        'terms',
        'reminderPlans',
      ].map(k => [k, []]),
    ),
    quickbooks: { connected: false, company: '', lastSyncedAt: '' },
    reminderDefaults: {
      offsets: [30, 14, 3],
      alsoNotifyIds: [],
      keepReminding: false,
      repeatEveryDays: 3,
      sendHour: 8,
    },
  },
  teaching: { terms: [], ensembles: [], meetings: [], students: [], attendance: [] },
  timesheets: { entries: [] },
};

const ROUTES = [
  '/',
  '/partners',
  '/partners/organizations/none',
  '/partners/venues/none',
  '/settings',
  '/grants',
  '/grants/none',
  '/deadlines',
  '/deadlines?view=calendar',
  '/deadlines?kind=report',
  '/funders',
  '/funders/none',
  '/playbook',
  '/transactions',
  '/transactions?tab=assigned',
  '/transactions?tab=not-grant-funded',
  '/transactions?tab=all',
  '/budget',
  '/budget?period=all',
  '/spend-down',
  '/schedule',
  '/schedule?view=term',
  '/roll/none',
  '/students',
  '/timesheets',
];

test('every route reads sensibly with no data', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', e => problems.push(`${page.url()}: ${e.message}`));

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

  for (const route of ROUTES) {
    await page.goto(route);
    const main = page.locator('main');
    // Every route with no data shows at least one design-system EmptyState (its title is an h3).
    await expect(main.locator('h3').first(), route).toBeVisible();
    const text = await main.innerText();
    expect(text, route).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
  }

  expect(problems).toEqual([]);
});
