/**
 * The timesheets module's public API. Other modules import this file and
 * nothing deeper: the manifest, plus pure read-only functions of `(state, …)`.
 *
 * `hoursByProgram` and `hoursForProgram` are what a grant report asks for:
 * teaching-artist hours for one program over the grant's period.
 */

export { manifest } from './manifest';
export { hoursByProgram, hoursForProgram } from './domain/derive';
