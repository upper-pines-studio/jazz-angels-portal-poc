import type { ModuleManifest } from '../core';
import * as grants from './grants';
import * as teaching from './teaching';
import * as timesheets from './timesheets';

/**
 * The registry. One line per module, in the order the rail and the dashboard
 * read them. See ./README.md for how to add one.
 */
export const MODULES: ModuleManifest[] = [grants.manifest, teaching.manifest, timesheets.manifest];
