import { addDays, addYears } from 'date-fns';
import { toDate, toISO } from './format';
import type { FiscalYear, PortalState, Program, StaffMember } from './types';

/** Derived data on the shared nouns. Every function here is pure. */

/**
 * The fiscal year containing `dateISO`. Jazz Angels runs Jul 1 – Jun 30, and
 * the year is named for the year it ends: Jul 1 2026 – Jun 30 2027 is "FY27".
 */
export function fiscalYear(dateISO: string, startMonth: number): FiscalYear {
  const d = toDate(dateISO);
  const month = d.getMonth() + 1;
  const startYear = month >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(startYear, startMonth - 1, 1);
  const end = addDays(addYears(start, 1), -1);
  return {
    label: `FY${String(end.getFullYear() % 100).padStart(2, '0')}`,
    start: toISO(start),
    end: toISO(end),
  };
}

export function staffById(state: PortalState, id: string | undefined): StaffMember | undefined {
  return id ? state.core.staff.find((s) => s.id === id) : undefined;
}

export function programById(state: PortalState, id: string): Program | undefined {
  return state.core.programs.find((p) => p.id === id);
}

/** The program's full name, falling back to its id so a row is never blank. */
export function programName(state: PortalState, id: string): string {
  return programById(state, id)?.name ?? id;
}
