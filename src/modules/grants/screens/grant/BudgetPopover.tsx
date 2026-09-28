import React from 'react';
import { createPortal } from 'react-dom';

/**
 * A floating panel anchored to an element on the budget tab: the account
 * picker's list and the row menu. It renders into `document.body` with fixed
 * positioning so neither the card nor the table scroller can clip it, follows
 * its anchor when the page scrolls, flips above when there is no room below,
 * and closes on a click outside it or its anchor.
 */
export function BudgetPopover({ anchor, open, onClose, width, align = 'left', maxHeight = 320, children, className, id, role, ariaLabel, onKeyDown }: {
  anchor: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /** Wanted width; never narrower than the anchor unless the viewport is. */
  width?: number;
  align?: 'left' | 'right';
  maxHeight?: number;
  children: React.ReactNode;
  className?: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const panel = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<React.CSSProperties | null>(null);

  const place = React.useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gutter = 8;
    const w = Math.min(Math.max(width ?? r.width, r.width), vw - gutter * 2);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(gutter, Math.min(left, vw - w - gutter));
    const below = vh - r.bottom - gutter;
    const above = r.top - gutter;
    const wanted = Math.min(maxHeight, panel.current?.scrollHeight ?? maxHeight);
    const flip = below < Math.min(wanted, 200) && above > below;
    const room = Math.max(120, (flip ? above : below) - 4);
    setBox({
      position: 'fixed',
      left,
      width: w,
      maxHeight: Math.min(maxHeight, room),
      ...(flip ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [anchor, width, align, maxHeight]);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div ref={panel} id={id} role={role} aria-label={ariaLabel} onKeyDown={onKeyDown}
      className={`budget-popover${className ? ` ${className}` : ''}`}
      style={box ?? { position: 'fixed', visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}
