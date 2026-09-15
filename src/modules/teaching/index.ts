/**
 * The teaching module's public API. Other modules import this file and nothing
 * deeper: the manifest, plus pure read-only functions of `(state, …)`.
 *
 * `attendanceSummary` is what the grants module's Program numbers card quotes.
 */

export { manifest } from './manifest';
export { attendanceSummary, enrolledCount } from './domain/derive';
export type { AttendanceSummary } from './domain/types';
