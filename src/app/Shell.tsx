import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar, Icon, IconButton, Avatar, Breadcrumb } from '../design-system';

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

/** The collapsed-rail preference survives reloads; storage may be unavailable, so fail quietly. */
const COLLAPSED_KEY = 'ja-sidebar-collapsed';
function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(value: boolean) {
  try { window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}

function activeFor(pathname: string): string {
  if (pathname === '/') return '/';
  const hit = NAV.filter(n => n.id && n.id !== '/' && pathname.startsWith(n.id as string));
  return hit.length ? (hit[0].id as string) : '/';
}

export function Shell({ children, badgeCounts }: { children: React.ReactNode; badgeCounts?: Record<string, number> }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [header, setHeader] = React.useState<PageHeader>({ title: '' });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => readCollapsed());
  const toggleCollapsed = () => setCollapsed(c => { writeCollapsed(!c); return !c; });
  const items = NAV.map(n => (n.id && badgeCounts?.[n.id] ? { ...n, count: badgeCounts[n.id] } : n));

  // Lucide swaps <i data-lucide> placeholders for SVG; re-run after each render.
  React.useEffect(() => { (window as any).lucide?.createIcons?.(); });

  // The drawer (narrow screens only) closes on navigation and on Escape.
  React.useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <HeaderCtx.Provider value={setHeader}>
      <style>{`.ja-kv + .ja-kv { border-top: var(--border-width) solid var(--border-subtle); }`}</style>
      <div className="ja-shell">
        <div className={'ja-sidebar' + (menuOpen ? ' is-open' : '') + (collapsed ? ' is-collapsed' : '')}>
          <Sidebar items={items} active={activeFor(loc.pathname)} onNavigate={id => nav(id)} logoSrc="/assets/jazz-angels-logo.png"
            footer={
              <div className="ja-rail-foot">
                <div className="ja-rail-user">
                  <Avatar name="Barry Cogert" size={30} tone="var(--gold-400)" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: 'var(--weight-semibold) var(--text-xs)/1.3 var(--font-sans)', color: 'var(--neutral-0)' }}>Barry Cogert</div>
                    <div style={{ font: 'var(--text-3xs)/1.3 var(--font-sans)', color: 'var(--text-on-dark-muted)' }}>Program Director</div>
                  </div>
                </div>
                <span className="ja-rail-toggle">
                  <IconButton label={collapsed ? 'Expand menu' : 'Collapse menu'} size="sm" variant="ghost"
                    style={{ color: 'var(--text-on-dark-muted)' }} onClick={toggleCollapsed}>
                    <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={16} />
                  </IconButton>
                </span>
              </div>
            } />
        </div>
        {menuOpen && <div className="ja-scrim" onClick={() => setMenuOpen(false)} />}
        <div className="ja-frame">
          <div className={'ja-topbar' + (header.actions ? ' has-actions' : '')}>
            <span className="ja-menu-btn">
              <IconButton label={menuOpen ? 'Close menu' : 'Open menu'} variant="ghost" onClick={() => setMenuOpen(o => !o)}>
                <Icon name={menuOpen ? 'x' : 'menu'} size={18} />
              </IconButton>
            </span>
            <TopBar title={header.title} subtitle={header.subtitle}
              breadcrumb={header.crumbs && <Breadcrumb items={header.crumbs} />} actions={header.actions} />
          </div>
          <main className="ja-main">
            <div className="ja-page">
              {children}
            </div>
          </main>
        </div>
      </div>
    </HeaderCtx.Provider>
  );
}
