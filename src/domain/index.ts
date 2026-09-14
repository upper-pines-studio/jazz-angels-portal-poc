/**
 * The data/domain layer for the Jazz Angels grants POC.
 * Screens import from here and nowhere deeper. See ./README.md.
 */

export * from './types';
export * from './phases';
export * from './templates';
export * from './derive';
export * from './format';
export * from './seed';
export * from './store';

// The repository is namespaced: screens should go through `useStore().actions`,
// but Settings needs the raw import/export helpers.
export * as repository from './repository';
export { STORAGE_KEY } from './repository';
