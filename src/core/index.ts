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
export { CURRENT_USER, DEFAULT_ENABLED_MODULES, SEED_TODAY, makeCoreSeed } from './seed';

// Namespaced: screens go through `useStore().actions`, but Settings and the
// tests need the raw storage helpers.
export * as repository from './repository';
export { storageKey } from './repository';
