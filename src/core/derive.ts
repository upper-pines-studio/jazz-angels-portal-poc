import { addDays, addYears } from 'date-fns';
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

export function staffById(state: PortalState, id: string | undefined): StaffMember | undefined {
  return id ? state.core.staff.find(s => s.id === id) : undefined;
}

export function programById(state: PortalState, id: string): Program | undefined {
  return state.core.programs.find(p => p.id === id);
}

/** The program's full name, falling back to its id so a row is never blank. */
export function programName(state: PortalState, id: string): string {
  return programById(state, id)?.name ?? id;
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

/** Every venue that belongs to one organization: a district's schools. */
export function venuesForOrganization(state: PortalState, organizationId: string): Venue[] {
  return state.core.venues.filter(v => v.organizationId === organizationId);
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
