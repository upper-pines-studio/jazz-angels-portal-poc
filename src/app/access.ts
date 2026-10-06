import { matchPath } from 'react-router-dom';
import { meetsAny } from '../core';
import type { ModuleRoute, PortalState, Requires, Role } from '../core';
import { MODULES } from '../modules';

/**
 * What each route needs, so the rail, the routes and the dashboard's links all
 * ask the same question (decision 0001). Core's own screens are listed here;
 * a module's come from its manifest.
 */
export const CORE_REQUIRES: Array<{ path: string; requires?: Requires }> = [
  { path: '/' },
  { path: '/partners', requires: { subject: 'partners' } },
  { path: '/partners/organizations/:id', requires: { subject: 'partners' } },
  { path: '/partners/venues/:id', requires: { subject: 'partners' } },
  // Settings holds staff, the system settings and the QuickBooks connection;
  // whoever may touch one of them may open it, and sees only that part.
  {
    path: '/settings',
    requires: [
      { subject: 'staff' },
      { subject: 'modules' },
      { subject: 'quickbooks-connect' },
      { subject: 'quickbooks-sync' },
    ],
  },
];

/** The routes of every module that is switched on. */
export function moduleRoutes(state: PortalState): ModuleRoute[] {
  const enabled = state.core.settings.enabledModules;
  return MODULES.filter(m => enabled.includes(m.id)).flatMap(m => m.routes);
}

/**
 * What a link needs: the requirement of the route it lands on. A link that
 * lands nowhere known needs nothing (the frame redirects it home).
 */
export function requiresFor(href: string, state: PortalState): Requires | undefined {
  const path = href.split(/[?#]/)[0] || '/';
  const routes = [...CORE_REQUIRES, ...moduleRoutes(state)];
  return routes.find(r => matchPath(r.path, path))?.requires;
}

/** May this role follow this link? */
export function mayOpen(role: Role, href: string, state: PortalState): boolean {
  return meetsAny(role, requiresFor(href, state));
}
