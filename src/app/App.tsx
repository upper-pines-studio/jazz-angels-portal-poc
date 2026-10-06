import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, meetsAny, useStore } from '../core';
import type { Requires } from '../core';
import { MODULES } from '../modules';
import { CORE_REQUIRES, moduleRoutes } from './access';
import { AuthProvider, useAuth } from './AuthGate';
import { Shell } from './Shell';
import { ToastHost, useToast } from './ToastHost';
import Dashboard from './screens/Dashboard';
import Login from './screens/Login';
import NoAccess from './screens/NoAccess';
import Settings from './screens/Settings';
import Partners from './screens/partners/Partners';
import OrganizationDetail from './screens/partners/OrganizationDetail';
import VenueDetail from './screens/partners/VenueDetail';

/** Every registered module's slice, in registry order. Core is added by the store. */
const SLICES = MODULES.map(m => m.slice);

/** The store, with a refused change shown as a toast. */
function Store({ userId, onUnknownUser }: { userId: string; onUnknownUser: () => void }) {
  const toast = useToast();
  const refused = React.useCallback(
    (message: string) => toast({ tone: 'warning', title: message }),
    [toast],
  );
  return (
    <StoreProvider
      slices={SLICES}
      userId={userId}
      onUnknownUser={onUnknownUser}
      onRefused={refused}
    >
      <Frame />
    </StoreProvider>
  );
}

/** Core's own screens, by path; what each needs is in `CORE_REQUIRES`. */
const CORE_ELEMENTS: Record<string, React.ReactElement> = {
  '/': <Dashboard />,
  '/partners': <Partners />,
  '/partners/organizations/:id': <OrganizationDetail />,
  '/partners/venues/:id': <VenueDetail />,
  '/settings': <Settings />,
};

/**
 * A route the signed-in role may not open renders the no-access screen in
 * the frame, not the screen, and keeps its URL (decision 0001).
 */
function Frame() {
  const { state, user } = useStore();
  const routes: Array<{ path: string; element: React.ReactElement; requires?: Requires }> = [
    ...CORE_REQUIRES.map(r => ({ ...r, element: CORE_ELEMENTS[r.path] })),
    ...moduleRoutes(state),
  ];

  return (
    <Shell>
      <Routes>
        {routes.map(r => (
          <Route
            key={r.path}
            path={r.path}
            element={meetsAny(user.role, r.requires) ? r.element : <NoAccess />}
          />
        ))}
        {/* A route from a module that has just been switched off. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

/**
 * Nothing behind the gate mounts until someone signs in, so the login screen
 * never loads or seeds module state. The router sits above App, so the URL
 * asked for survives the detour through the login screen.
 */
function Gate() {
  const { user, signOut } = useAuth();
  const refuse = React.useCallback(() => signOut('no-staff'), [signOut]);
  if (!user) return <Login />;
  return (
    <ToastHost>
      <Store userId={user.staffId} onUnknownUser={refuse} />
    </ToastHost>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
