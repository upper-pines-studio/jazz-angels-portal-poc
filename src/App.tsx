import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { StoreProvider, useStore, deadlines } from './domain';
import { Shell } from './app/Shell';
import { ToastHost } from './app/ToastHost';
import Dashboard from './app/screens/Dashboard';
import Grants from './app/screens/Grants';
import GrantDetail from './app/screens/GrantDetail';
import Deadlines from './app/screens/Deadlines';
import Funders from './app/screens/Funders';
import FunderDetail from './app/screens/FunderDetail';
import Playbook from './app/screens/Playbook';
import Settings from './app/screens/Settings';

function Frame() {
  const { state, today } = useStore();
  const attention = deadlines(state, today).filter(d => d.status !== 'upcoming').length;
  return (
    <Shell badgeCounts={{ '/deadlines': attention }}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/grants" element={<Grants />} />
        <Route path="/grants/:id" element={<GrantDetail />} />
        <Route path="/deadlines" element={<Deadlines />} />
        <Route path="/funders" element={<Funders />} />
        <Route path="/funders/:id" element={<FunderDetail />} />
        <Route path="/playbook" element={<Playbook />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastHost>
        <Frame />
      </ToastHost>
    </StoreProvider>
  );
}
