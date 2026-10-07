/**
 * The shared core: people, programs, the fiscal year, the store and the
 * formatting helpers. Screens and modules import from here, never deeper.
 * See ./README.md.
 */

export * from './types';
export * from './module';
export * from './format';
export * from './derive';
export * from './store';
export * from './roles';
export * from './permissions';
export * from './archive';
export {
  DEFAULT_ENABLED_MODULES,
  PARAMOUNT_MS_VENUE_ID,
  SEED_TODAY,
  STUDIO_VENUE_ID,
  makeCoreEmpty,
  makeCoreSeed,
} from './seed';
export { DEMO_TODAY_KEY, isDemo } from './demo';

// Namespaced: screens go through `useStore().actions`, but Settings and the
// tests need the raw storage helpers.
export * as repository from './repository';
export { storageKey } from './repository';

// Namespaced like the repository: `auth.verify`, `auth.currentUser`, …
export * as auth from './auth';
export type { AuthUser } from './auth';
export type { Repository } from './persistence';
export type { Saving, SaveStatus } from './live';
