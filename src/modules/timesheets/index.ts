/**
 * The timesheets module's public API. Other modules import this file and
 * nothing deeper: the manifest, plus pure read-only functions of `(state, …)`.
 *
 * `hoursByProgram`, `hoursForProgram` and `hoursForPrograms` are what a grant report asks for:
 * teaching-artist hours for one program, or several over the grant's period.
 */

export { manifest } from './manifest';
export { hoursByProgram, hoursForProgram, hoursForPrograms } from './domain/derive';
