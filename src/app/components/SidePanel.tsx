import React from 'react';
import { Button, Icon, IconButton } from '../../design-system';
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
export function WithPanel({
  panel,
  children,
}: {
  panel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={'ja-with-panel' + (panel ? ' has-panel' : '')}>
      <div className="ja-with-panel__page">{children}</div>
      {panel}
    </div>
  );
}

/**
 * What a page hands its docked panel so that opening another record, or
 * anything else that would replace the panel, waits while the panel holds
 * unsaved changes. Made by `usePanelGuard`.
 */
export interface PanelGuard {
  /** The panel says whether it has unsaved changes. */
  setDirty(dirty: boolean): void;
  /** The page wants the panel gone or swapped, and is waiting on the answer. */
  pending: boolean;
  /** Throw the changes away and do what the page asked. */
  discard(): void;
  /** Stay on the panel as it is. */
  keep(): void;
}

/**
 * For a page with a docked panel that edits a draft (the reminders, a split).
 * Wrap anything that would close or swap the panel in `guard`: it runs at once
 * when the panel is clean, and waits for Discard when it is not. Pass `panel`
 * to the panel, which hands it to `SidePanel`. Until the person decides, the
 * page leaves the panel as it is: the record it shows does not change.
 *
 *   const { guard, panel } = usePanelGuard();
 *   const open = (id: string) => guard(() => setParams({ report: id }));
 *   <ReminderPanel key={id} guard={panel} … />
 */
export function usePanelGuard(): { guard: (go: () => void) => void; panel: PanelGuard } {
  const dirty = React.useRef(false);
  const [waiting, setWaiting] = React.useState<{ go: () => void }>();

  const guard = React.useCallback((go: () => void) => {
    if (dirty.current) setWaiting({ go });
    else go();
  }, []);
  // Stable, so the panel's effects that report it do not re-run when a swap starts waiting.
  const setDirty = React.useCallback((next: boolean) => {
    dirty.current = next;
    if (!next) setWaiting(undefined);
  }, []);

  const panel = React.useMemo<PanelGuard>(
    () => ({
      setDirty,
      pending: !!waiting,
      discard() {
        dirty.current = false;
        setWaiting(undefined);
        waiting?.go();
      },
      keep() {
        setWaiting(undefined);
      },
    }),
    [waiting, setDirty],
  );

  return { guard, panel };
}

export interface SidePanelProps {
  /** Small caps line over the title: "Split across grants". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Sits right of the title, in the display face: an amount. */
  titleAside?: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Buttons, right-aligned on the sunken band at the foot. A function is given
   * the panel's own close, which asks first when the panel is `dirty`: use it
   * for a Cancel button.
   */
  footer?: React.ReactNode | ((close: () => void) => React.ReactNode);
  /**
   * The panel holds changes that are not saved. Closing it (the X, Escape, a
   * Cancel given `close`) then asks "Discard your changes?" in the footer
   * before it calls `onClose`.
   */
  dirty?: boolean;
  /** From the page's `usePanelGuard`, so the page asks before it swaps the panel. */
  guard?: PanelGuard;
  onClose: () => void;
  children: React.ReactNode;
}

/** The docked panel: a header, a body that scrolls, and a footer that does not. */
export function SidePanel({
  eyebrow,
  title,
  titleAside,
  subtitle,
  footer,
  dirty = false,
  guard,
  onClose,
  children,
}: SidePanelProps) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [closing, setClosing] = React.useState(false);

  // Tell the page whether a swap has to ask; a panel that goes away is clean.
  const setDirty = guard?.setDirty;
  React.useEffect(() => {
    setDirty?.(dirty);
  }, [dirty, setDirty]);
  React.useEffect(() => () => setDirty?.(false), [setDirty]);
  React.useEffect(() => {
    if (!dirty) setClosing(false);
  }, [dirty]);

  const requestClose = React.useCallback(
    () => (dirty ? setClosing(true) : onClose()),
    [dirty, onClose],
  );
  const asking = dirty && (closing || !!guard?.pending);
  const keep = () => {
    setClosing(false);
    guard?.keep();
  };
  const discard = () => {
    setClosing(false);
    if (guard?.pending) guard.discard();
    else onClose();
  };

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
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const foot = asking ? (
    <>
      <span className="ja-side-panel__ask">Discard your changes?</span>
      <Button variant="secondary" size="sm" onClick={keep}>
        Keep editing
      </Button>
      <Button variant="danger" size="sm" onClick={discard}>
        Discard
      </Button>
    </>
  ) : typeof footer === 'function' ? (
    footer(requestClose)
  ) : (
    footer
  );

  return (
    <aside
      className="ja-side-panel"
      ref={ref}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className="ja-side-panel__head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow && (
              <Eyebrow style={{ color: 'var(--teal-600)', marginBottom: 6 }}>{eyebrow}</Eyebrow>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <h2
                style={{
                  margin: 0,
                  minWidth: 0,
                  flex: 1,
                  font: 'var(--weight-semibold) var(--text-xl)/1.2 var(--font-display)',
                  letterSpacing: 'var(--tracking-display)',
                  color: 'var(--text-strong)',
                }}
              >
                {title}
              </h2>
              {titleAside && (
                <span
                  style={{
                    flex: '0 0 auto',
                    font: 'var(--weight-medium) var(--text-xl)/1.2 var(--font-mono)',
                    color: 'var(--text-strong)',
                  }}
                >
                  {titleAside}
                </span>
              )}
            </div>
          </div>
          <span style={{ flex: '0 0 auto', margin: '-6px -8px 0 0' }}>
            <IconButton label="Close" variant="ghost" size="sm" onClick={requestClose}>
              <Icon name="x" size={16} />
            </IconButton>
          </span>
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: 6,
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div className="ja-side-panel__body">{children}</div>
      {foot && <div className="ja-side-panel__foot">{foot}</div>}
    </aside>
  );
}

/** A titled block inside a SidePanel body. */
export function PanelSection({
  title,
  action,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ja-side-panel__section">
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <h3
            style={{
              margin: 0,
              flex: 1,
              font: 'var(--weight-semibold) var(--text-sm)/1.3 var(--font-sans)',
              letterSpacing: 0,
              color: 'var(--text-strong)',
            }}
          >
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
