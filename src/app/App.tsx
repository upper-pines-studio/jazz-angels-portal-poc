import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { StoreProvider, useStore } from '../core';
import type { ModuleRoute } from '../core';
import { MODULES } from '../modules';
import { CORE_REQUIRES, mayOpenRoute, moduleRoutes } from './access';
import { AuthProvider, useAuth } from './AuthGate';
import { Shell } from './Shell';
import { ToastHost, useToast } from './ToastHost';
import Dashboard from './screens/Dashboard';
import Login from './screens/Login';
import NoAccess from './screens/NoAccess';
import Settings from './screens/Settings';
import Programs from './screens/programs/Programs';
import Partners from './screens/partners/Partners';
import OrganizationDetail from './screens/partners/OrganizationDetail';
import VenueDetail from './screens/partners/VenueDetail';

/** Every registered module's slice, in registry order. Core is added by the store. */
const SLICES = MODULES.map(m => m.slice);

/** The store, with a refused change and a change that could not be saved shown as toasts. */
function Store({
  userId,
  onUnknownUser,
}: {
  userId: string;
  onUnknownUser: (reason: 'no-staff' | 'archived') => void;
}) {
  const toast = useToast();
  const refused = React.useCallback(
    (message: string) => toast({ tone: 'warning', title: message }),
    [toast],
  );
  const notSaved = React.useCallback(
    (message: string) =>
      toast({ tone: 'danger', title: message, message: 'Check the connection and try again.' }),
    [toast],
  );
  return (
    <StoreProvider
      slices={SLICES}
      userId={userId}
      onUnknownUser={onUnknownUser}
      onRefused={refused}
      onSaveFailed={notSaved}
    >
      <Frame />
    </StoreProvider>
  );
}

/** Core's own screens, by path; what each needs is in `CORE_REQUIRES`. */
const CORE_ELEMENTS: Record<string, React.ReactElement> = {
  '/': <Dashboard />,
  '/programs': <Programs />,
  '/programs/:id': <Programs />,
  '/programs/projects/:projectId': <Programs />,
  '/partners': <Partners />,
  '/partners/organizations/:id': <OrganizationDetail />,
  '/partners/venues/:id': <VenueDetail />,
  '/settings': <Settings />,
};

/**
 * The route's screen, or the no-access screen when the signed-in person may
 * not open it (decision 0001). The URL stays as it was.
 */
function Guarded({ route }: { route: ModuleRoute }) {
  const { state, user } = useStore();
  const params = useParams();
  return mayOpenRoute(user, route, state, params) ? route.element : <NoAccess />;
}

function Frame() {
  const { state } = useStore();
  const routes: ModuleRoute[] = [
    ...CORE_REQUIRES.map(r => ({ ...r, element: CORE_ELEMENTS[r.path] })),
    ...moduleRoutes(state),
  ];

  return (
    <Shell>
      <Routes>
        {routes.map(r => (
          <Route key={r.path} path={r.path} element={<Guarded route={r} />} />
        ))}
        {/* A route from a module that has just been switched off. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function Gate() {
  const { user, signOut } = useAuth();
  const refuse = React.useCallback((reason: 'no-staff' | 'archived') => signOut(reason), [signOut]);
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
