import React from 'react';
import { Icon, IconButton } from '../../design-system';
import { Eyebrow } from './badges';
import './side-panel.css';

/**
 * A page with a panel docked on its right. Pass `panel` to open it and
 * `undefined` to close it; the page takes the full width when it is closed.
 *
 *   <WithPanel panel={row && <SidePanel title={row.payee} onClose={close}>…</SidePanel>}>
 *     …the page…
 *   </WithPanel>
 */
export function WithPanel({ panel, children }: { panel?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={'ja-with-panel' + (panel ? ' has-panel' : '')}>
      <div className="ja-with-panel__page">{children}</div>
      {panel}
    </div>
  );
}

export interface SidePanelProps {
  /** Small caps line over the title: "Split across grants". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Sits right of the title, in the display face: an amount. */
  titleAside?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Buttons, right-aligned on the sunken band at the foot. */
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/** The docked panel: a header, a body that scrolls, and a footer that does not. */
export function SidePanel({ eyebrow, title, titleAside, subtitle, footer, onClose, children }: SidePanelProps) {
  const ref = React.useRef<HTMLElement | null>(null);

  // The panel is as tall as the scrolling area it sits in, whatever the top bar's height.
  React.useLayoutEffect(() => {
    const panel = ref.current;
    const main = panel?.closest('.ja-main') as HTMLElement | null;
    if (!panel || !main) return;
    const fit = () => panel.style.setProperty('--ja-panel-h', `${main.clientHeight}px`);
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog or a menu open over the panel gets the key first.
      if (document.querySelector('[data-ja-menu], .ja-main div[style*="z-index: 50"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="ja-side-panel" ref={ref} aria-label={typeof title === 'string' ? title : undefined}>
      <div className="ja-side-panel__head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow && <Eyebrow style={{ color: 'var(--teal-600)', marginBottom: 6 }}>{eyebrow}</Eyebrow>}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <h2 style={{ margin: 0, minWidth: 0, flex: 1, font: 'var(--weight-semibold) var(--text-xl)/1.2 var(--font-display)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)' }}>
                {title}
              </h2>
              {titleAside && (
                <span style={{ flex: '0 0 auto', font: 'var(--weight-medium) var(--text-xl)/1.2 var(--font-mono)', color: 'var(--text-strong)' }}>
                  {titleAside}
                </span>
              )}
            </div>
          </div>
          <span style={{ flex: '0 0 auto', margin: '-6px -8px 0 0' }}>
            <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}><Icon name="x" size={16} /></IconButton>
          </span>
        </div>
        {subtitle && (
          <div style={{ marginTop: 6, font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{subtitle}</div>
        )}
      </div>
      <div className="ja-side-panel__body">{children}</div>
      {footer && <div className="ja-side-panel__foot">{footer}</div>}
    </aside>
  );
}

/** A titled block inside a SidePanel body. */
export function PanelSection({ title, action, children }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ja-side-panel__section">
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, flex: 1, font: 'var(--weight-semibold) var(--text-sm)/1.3 var(--font-sans)', letterSpacing: 0, color: 'var(--text-strong)' }}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
