import { SEED_TODAY } from './seed';

/**
 * The demo switch. One build-time variable, `VITE_DEMO`, decides whether the
 * portal starts from the Jazz Angels sample data or empty (decision 0004):
 *
 * - `VITE_DEMO=1` (or `true`): demo data, the demo date, Reset demo data.
 * - `VITE_DEMO=0` (or `false`): empty, the real date, no reset.
 * - unset: on for `npm run dev`, off for `npm run build`.
 *
 * Netlify sets `VITE_DEMO = "1"` in netlify.toml, so the published demo keeps
 * its data. Only this file reads the variable; the repository and the store
 * take the answer as a parameter, so the tests never depend on the build.
 */
export function isDemo(): boolean {
  return demoFromEnv(import.meta.env.VITE_DEMO, import.meta.env.DEV);
}

/** The rule behind `isDemo`, given the variable and whether this is a dev build. */
export function demoFromEnv(value: string | undefined, dev: boolean): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return dev;
}

/**
 * The demo date is a preference of this browser, stored outside the slices, so
 * export, import and reset never carry it. Unset means the seed's day.
 */
export const DEMO_TODAY_KEY = 'ja-portal:demo-today';

/** What the preference holds when someone chose "Use the real date". */
const REAL_DATE = 'clock';

/** The demo date a stored preference names: an ISO day, or undefined for the clock. */
export function demoTodayFrom(stored: string | null): string | undefined {
  if (stored === null) return SEED_TODAY;
  if (stored === REAL_DATE) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : SEED_TODAY;
}

/** The preference to store for a demo date, or for the clock when undefined. */
export function demoTodayToStore(iso: string | undefined): string {
  return iso ?? REAL_DATE;
}
