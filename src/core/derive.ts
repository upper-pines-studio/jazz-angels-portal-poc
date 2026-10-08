import { addDays, addYears } from 'date-fns';
import { pickable, withArchived } from './archive';
import { toDate, toISO } from './format';
import type {
  Address,
  FiscalYear,
  Organization,
  PortalState,
  Program,
  StaffMember,
  Venue,
} from './types';

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

/**
 * Anyone by id, archived or not: a past approval, an activity row or a class
 * lead still names whoever it was (decision 0002).
 */
export function staffById(state: PortalState, id: string | undefined): StaffMember | undefined {
  return id ? state.core.staff.find(s => s.id === id) : undefined;
}

export function programById(state: PortalState, id: string): Program | undefined {
  return state.core.programs.find(p => p.id === id);
}

/**
 * The program's full name, falling back to its id so a row is never blank.
 * An archived program still reads by its name on the records that name it.
 */
export function programName(state: PortalState, id: string): string {
  return programById(state, id)?.name ?? id;
}

/**
 * The programs a picker offers: the current ones, plus `keepId` when the
 * record being edited already names one that has since been archived.
 */
export function programOptions(state: PortalState, keepId?: string): Program[] {
  return pickable(state.core.programs, keepId);
}

/**
 * The programs as Settings lists them: the current ones, then, with
 * `includeArchived`, the archived ones after them.
 */
export function programsList(state: PortalState, includeArchived = false): Program[] {
  return withArchived(state.core.programs, includeArchived);
}

/** A program's name and short name, tidied: trimmed, the short name falling back to the name. */
export function programFields(input: Partial<Pick<Program, 'name' | 'short'>>) {
  const name = input.name?.trim() ?? '';
  return { name, short: input.short?.trim() || name };
}

/** Why a program cannot be saved with this name, or undefined when it can. */
export function programProblem(
  programs: readonly Program[],
  input: Partial<Pick<Program, 'name' | 'short'>>,
  id?: string,
): string | undefined {
  const { name } = programFields(input);
  if (!name) return 'Give the program a name.';
  const taken = programs.find(
    p => p.id !== id && p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (taken) return `There is already a program called ${taken.name}.`;
  return undefined;
}

export function organizationById(
  state: PortalState,
  id: string | undefined,
): Organization | undefined {
  return id ? state.core.organizations.find(o => o.id === id) : undefined;
}

export function venueById(state: PortalState, id: string | undefined): Venue | undefined {
  return id ? state.core.venues.find(v => v.id === id) : undefined;
}

/** The venue's name, falling back to its id so a row is never blank. */
export function venueName(state: PortalState, id: string): string {
  return venueById(state, id)?.name ?? id;
}

/**
 * Every current venue that belongs to one organization: a district's schools.
 * `includeArchived` adds the archived ones after them.
 */
export function venuesForOrganization(
  state: PortalState,
  organizationId: string,
  includeArchived = false,
): Venue[] {
  return withArchived(
    state.core.venues.filter(v => v.organizationId === organizationId),
    includeArchived,
  );
}

/**
 * Where a class is, the way staff say it. In Jazz Angels' own studio the room
 * is enough ("Studio 1"); anywhere else the venue comes first
 * ("Paramount Middle School · Band room"). A room-less venue is just its name.
 */
export function placeLabel(
  state: PortalState,
  venueId: string | undefined,
  room: string | undefined,
): string {
  const venue = venueById(state, venueId);
  const roomText = room?.trim() ?? '';
  if (!venue) return roomText || venueId || '—';
  if (venue.kind === 'studio') return roomText || venue.name;
  return roomText ? `${venue.name} · ${roomText}` : venue.name;
}

/** "8500 Contreras St, Paramount, CA 90723" on one line. */
export function addressLine(address: Address | undefined): string {
  if (!address) return '';
  const cityLine = [address.city, [address.state, address.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.street, cityLine].filter(Boolean).join(', ');
}
