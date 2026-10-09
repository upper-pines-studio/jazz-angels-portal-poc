import type { Locator, Page } from '@playwright/test';

/** The key `startSession` in src/core/auth.ts writes. */
const SESSION_KEY = 'ja-portal:session:v1';

/**
 * Start the page from fresh demo data, optionally signed in as one of the seven demo logins.
 *
 * Playwright gives every test its own browser context, so storage is already empty; the init
 * script makes that explicit by clearing localStorage on the tab's first load (a sessionStorage
 * flag remembers it was done), so the app seeds itself from scratch. Reloads and in-app
 * navigation after that keep whatever the test changed. Signing in writes the session record
 * straight into localStorage, so no password is needed.
 */
export async function freshStart(page: Page, username?: string): Promise<void> {
  await page.addInitScript(
    ({ key, username }) => {
      if (sessionStorage.getItem('e2e:started')) return;
      sessionStorage.setItem('e2e:started', '1');
      localStorage.clear();
      if (username) {
        localStorage.setItem(
          key,
          JSON.stringify({ username, signedInAt: new Date().toISOString() }),
        );
      }
    },
    { key: SESSION_KEY, username },
  );
}

/**
 * The control inside a design-system Field, found by the Field's visible label. Field renders
 * the label and its control as siblings without tying them together, so this walks from the
 * label to the wrapper it shares with the control.
 */
export function field(scope: Page | Locator, label: string, control = 'input, select, textarea') {
  return scope
    .locator('label')
    .filter({ hasText: new RegExp(`^${escape(label)}\\s*\\*?$`) })
    .locator('xpath=..')
    .locator(control)
    .first();
}

/** The open design-system Dialog with this title. */
export function dialog(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { level: 2, name: title, exact: true })
    .locator('xpath=ancestor::div[.//footer][1]');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hand the same tab to another of the demo logins, keeping the data the test has changed so
 * far: the session record is swapped for theirs and the page reloads. The second login of a
 * two-person flow (a teacher submits, the office approves).
 */
export async function switchUser(page: Page, username: string): Promise<void> {
  await page.evaluate(
    ({ key, username }) =>
      localStorage.setItem(key, JSON.stringify({ username, signedInAt: new Date().toISOString() })),
    { key: SESSION_KEY, username },
  );
  await page.reload();
}
