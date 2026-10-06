import { matchPath } from 'react-router-dom';
import { meetsAny } from '../core';
import type { ModuleRoute, PortalState, Requires, SignedInUser } from '../core';
import { MODULES } from '../modules';

/**
 * What each route needs, so the rail, the routes and the dashboard's links all
 * ask the same question (decision 0001). Core's own screens are listed here;
 * a module's come from its manifest.
 */
export const CORE_REQUIRES: Array<Pick<ModuleRoute, 'path' | 'requires'>> = [
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
 * May this person open this route? Its `requires` for the role, then its own
 * `allows` for the record the params name. The frame and `mayOpen` both ask.
 */
export function mayOpenRoute(
  user: SignedInUser,
  route: Pick<ModuleRoute, 'requires' | 'allows'>,
  state: PortalState,
  params: Record<string, string | undefined>,
): boolean {
  if (!meetsAny(user.role, route.requires)) return false;
  return route.allows ? route.allows(user, state, params) : true;
}

/**
 * May this person follow this link? A link that lands nowhere known is open
 * (the frame sends it home). The rail and the dashboard ask this.
 */
export function mayOpen(user: SignedInUser, href: string, state: PortalState): boolean {
  const path = href.split(/[?#]/)[0] || '/';
  const routes: Array<Pick<ModuleRoute, 'path' | 'requires' | 'allows'>> = [
    ...CORE_REQUIRES,
    ...moduleRoutes(state),
  ];
  for (const route of routes) {
    const match = matchPath(route.path, path);
    if (match) return mayOpenRoute(user, route, state, match.params);
  }
  return true;
}
