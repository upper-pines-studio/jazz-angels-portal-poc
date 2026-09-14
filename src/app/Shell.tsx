import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar, Icon, Avatar, Breadcrumb } from '../design-system';

export interface Crumb { label: React.ReactNode; href?: string }

/** Screens set the top bar through this context so the Shell owns the frame. */
export interface PageHeader {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}
const HeaderCtx = React.createContext<(h: PageHeader) => void>(() => {});

/** Call once per screen: `usePageHeader({ title, subtitle, actions })`. */
export function usePageHeader(header: PageHeader) {
  const set = React.useContext(HeaderCtx);
  const { title, subtitle, crumbs, actions } = header;
  React.useEffect(() => { set({ title, subtitle, crumbs, actions }); });
}

const NAV = [
  { section: 'Overview' },
  { id: '/', label: 'Dashboard', icon: <Icon name="layout-dashboard" size={16} /> },
  { id: '/deadlines', label: 'Deadlines', icon: <Icon name="calendar-days" size={16} /> },
  { section: 'Grants' },
  { id: '/grants', label: 'All grants', icon: <Icon name="landmark" size={16} /> },
  { id: '/funders', label: 'Funders', icon: <Icon name="building-2" size={16} /> },
  { section: 'Office' },
  { id: '/playbook', label: 'Playbook', icon: <Icon name="book-open" size={16} /> },
  { id: '/settings', label: 'Settings', icon: <Icon name="settings" size={16} /> },
];

function activeFor(pathname: string): string {
  if (pathname === '/') return '/';
  const hit = NAV.filter(n => n.id && n.id !== '/' && pathname.startsWith(n.id as string));
  return hit.length ? (hit[0].id as string) : '/';
}

export function Shell({ children, badgeCounts }: { children: React.ReactNode; badgeCounts?: Record<string, number> }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [header, setHeader] = React.useState<PageHeader>({ title: '' });
  const items = NAV.map(n => (n.id && badgeCounts?.[n.id] ? { ...n, count: badgeCounts[n.id] } : n));

  // Lucide swaps <i data-lucide> placeholders for SVG; re-run after each render.
  React.useEffect(() => { (window as any).lucide?.createIcons?.(); });

  return (
    <HeaderCtx.Provider value={setHeader}>
      <style>{`.ja-kv + .ja-kv { border-top: var(--border-width) solid var(--border-subtle); }`}</style>
      <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--surface-page)' }}>
        <Sidebar items={items} active={activeFor(loc.pathname)} onNavigate={id => nav(id)} logoSrc="/assets/jazz-angels-logo.png"
          footer={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Avatar name="Barry Cogert" size={30} tone="var(--gold-400)" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: 'var(--weight-semibold) var(--text-xs)/1.3 var(--font-sans)', color: 'var(--neutral-0)' }}>Barry Cogert</div>
                <div style={{ font: 'var(--text-3xs)/1.3 var(--font-sans)', color: 'var(--text-on-dark-muted)' }}>Program Director</div>
              </div>
            </div>
          } />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar title={header.title} subtitle={header.subtitle}
            breadcrumb={header.crumbs && <Breadcrumb items={header.crumbs} />} actions={header.actions} />
          {/* position:relative so the design-system Dialog (position:absolute) scopes to the scrolling area */}
          <main style={{ flex: 1, overflow: 'auto', padding: 'var(--space-7)', position: 'relative' }}>
            <div style={{ maxWidth: 'var(--container-max)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </HeaderCtx.Provider>
  );
}
