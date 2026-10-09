/**
 * The grants module's public API. Other modules import this file and nothing
 * deeper: the manifest, plus pure read-only functions of `(state, …)`.
 */

export { manifest } from './manifest';
export { deadlines, fyTotals, grantsForProgram } from './domain/derive';
export { fundingFor, grantsPayingFor } from './domain/shares';
