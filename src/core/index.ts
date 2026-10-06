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
export {
  DEFAULT_ENABLED_MODULES,
  PARAMOUNT_MS_VENUE_ID,
  SEED_TODAY,
  STUDIO_VENUE_ID,
  makeCoreSeed,
} from './seed';

// Namespaced: screens go through `useStore().actions`, but Settings and the
// tests need the raw storage helpers.
export * as repository from './repository';
export { storageKey } from './repository';

// Namespaced like the repository: `auth.verify`, `auth.currentUser`, …
export * as auth from './auth';
export type { AuthUser } from './auth';
