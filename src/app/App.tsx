import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from '../core';
import { MODULES } from '../modules';
import { AuthProvider, useAuth } from './AuthGate';
import { Shell } from './Shell';
import { ToastHost } from './ToastHost';
import Dashboard from './screens/Dashboard';
import Login from './screens/Login';
import Settings from './screens/Settings';
import Partners from './screens/partners/Partners';
import OrganizationDetail from './screens/partners/OrganizationDetail';
import VenueDetail from './screens/partners/VenueDetail';

/** Every registered module's slice, in registry order. Core is added by the store. */
const SLICES = MODULES.map(m => m.slice);

function Frame() {
  const { state } = useStore();
  const enabled = state.core.settings.enabledModules;
  const routes = MODULES.filter(m => enabled.includes(m.id)).flatMap(m => m.routes);

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/partners/organizations/:id" element={<OrganizationDetail />} />
        <Route path="/partners/venues/:id" element={<VenueDetail />} />
        <Route path="/settings" element={<Settings />} />
        {routes.map(r => (
          <Route key={r.path} path={r.path} element={r.element} />
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
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <StoreProvider slices={SLICES}>
      <ToastHost>
        <Frame />
      </ToastHost>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
