import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar, Icon, IconButton, Avatar, Breadcrumb } from '../design-system';
import { useStore } from '../core';
import type { PortalState } from '../core';
import { MODULES } from '../modules';
import { useAuth } from './AuthGate';

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

interface RailItem { id?: string; label?: React.ReactNode; icon?: React.ReactNode; count?: number; section?: string }

/**
 * The rail: Overview first, then every enabled module's section in registry
 * order (sections with the same name merge), then Partners and Settings at the
 * end of Office: core screens, so they stay whichever modules are on.
 */
function buildNav(state: PortalState, today: string): RailItem[] {
  const sections: Array<{ name: string; items: RailItem[] }> = [
    { name: 'Overview', items: [{ id: '/', label: 'Dashboard', icon: <Icon name="layout-dashboard" size={16} /> }] },
  ];
  const sectionFor = (name: string) => {
    let hit = sections.find(s => s.name === name);
    if (!hit) {
      hit = { name, items: [] };
      sections.push(hit);
    }
    return hit;
  };

  for (const module of MODULES) {
    if (!state.core.settings.enabledModules.includes(module.id)) continue;
    const target = sectionFor(module.nav.section);
    for (const item of module.nav.items) {
      const count = item.badge?.(state, today);
      target.items.push({
        id: item.path,
        label: item.label,
        icon: <Icon name={item.icon} size={16} />,
        count: count || undefined,
      });
    }
  }

  sectionFor('Office').items.push(
    { id: '/partners', label: 'Partners', icon: <Icon name="building-2" size={16} /> },
    { id: '/settings', label: 'Settings', icon: <Icon name="settings" size={16} /> },
  );

  return sections.flatMap(s => (s.items.length ? [{ section: s.name }, ...s.items] : []));
}

/** The collapsed-rail preference survives reloads; storage may be unavailable, so fail quietly. */
const COLLAPSED_KEY = 'ja-sidebar-collapsed';
function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(value: boolean) {
  try { window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}

function activeFor(items: RailItem[], pathname: string): string {
  if (pathname === '/') return '/';
  const hit = items.filter(n => n.id && n.id !== '/' && pathname.startsWith(n.id));
  return hit.length ? (hit[0].id as string) : '/';
}

export function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { state, today } = useStore();
  const { user, signOut } = useAuth();
  const [header, setHeader] = React.useState<PageHeader>({ title: '' });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => readCollapsed());
  const toggleCollapsed = () => setCollapsed(c => { writeCollapsed(!c); return !c; });
  const items = buildNav(state, today);

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
          <Sidebar items={items} active={activeFor(items, loc.pathname)} onNavigate={id => nav(id)} logoSrc="/assets/jazz-angels-logo.png"
            footer={
              <div className="ja-rail-foot">
                <div className="ja-rail-user">
                  <Avatar name={user?.name ?? ''} size={30} tone="var(--gold-400)" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: 'var(--weight-semibold) var(--text-xs)/1.3 var(--font-sans)', color: 'var(--neutral-0)' }}>{user?.name}</div>
                    <div style={{ font: 'var(--text-3xs)/1.3 var(--font-sans)', color: 'var(--text-on-dark-muted)' }}>{user?.role}</div>
                  </div>
                </div>
                <span className="ja-rail-actions">
                  <IconButton label="Sign out" size="sm" variant="ghost"
                    style={{ color: 'var(--text-on-dark-muted)' }} onClick={signOut}>
                    <Icon name="log-out" size={16} />
                  </IconButton>
                  <span className="ja-rail-toggle">
                    <IconButton label={collapsed ? 'Expand menu' : 'Collapse menu'} size="sm" variant="ghost"
                      style={{ color: 'var(--text-on-dark-muted)' }} onClick={toggleCollapsed}>
                      <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={16} />
                    </IconButton>
                  </span>
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
