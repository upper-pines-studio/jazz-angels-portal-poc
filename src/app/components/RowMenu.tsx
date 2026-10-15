import React from 'react';
import { Icon } from '../../design-system';
import './row-menu.css';

export interface RowMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
}

/**
 * The "…" menu at the end of a table row, for the actions a row needs now and
 * then: Send back, History. The pattern of the grants transaction menu, with
 * two differences. The list is placed against the viewport, so a table cell or
 * a card that clips its overflow does not cut it off: under the button, or over
 * it when the window has no room below, and it follows the button when the page
 * scrolls. And it works from the keyboard as a menu does: Enter, Space or the
 * down arrow opens it on the first item, the up arrow on the last, the arrows,
 * Home and End move, Escape closes it back onto the button, and Tab closes it
 * and moves on.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  // Where the list sits, once it is measured; until then it renders hidden.
  const [at, setAt] = React.useState<{ top: number; right: number } | null>(null);
  const wrap = React.useRef<HTMLSpanElement | null>(null);
  const button = React.useRef<HTMLButtonElement | null>(null);
  const list = React.useRef<HTMLDivElement | null>(null);
  // Where focus goes when the list opens: the first item, or the last from the up arrow.
  const focusFirst = React.useRef(true);

  const place = React.useCallback(() => {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const height = list.current?.offsetHeight ?? 0;
    const below = box.bottom + 4;
    const above = box.top - 4 - height;
    const top = below + height > window.innerHeight - 8 && above >= 8 ? above : below;
    setAt({ top, right: window.innerWidth - box.right });
  }, []);

  const show = (first: boolean) => {
    focusFirst.current = first;
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  React.useLayoutEffect(() => {
    if (open) place();
    else setAt(null);
  }, [open, place]);

  // Once the list is placed and visible, focus moves into it.
  const placed = at !== null;
  React.useEffect(() => {
    if (!open || !placed) return;
    const menuItems = list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    menuItems?.[focusFirst.current ? 0 : menuItems.length - 1]?.focus();
  }, [open, placed]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show(e.key === 'ArrowDown');
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const menuItems = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const now = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      menuItems[(to + menuItems.length) % menuItems.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(now + 1);
    else if (e.key === 'ArrowUp') move(now - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(menuItems.length - 1);
    else if (e.key === 'Escape') {
      // The menu gets the key, not a side panel or dialog underneath it.
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      // Close once the browser has moved focus on, so Tab lands after the button.
      window.setTimeout(() => setOpen(false));
    }
  };

  return (
    <span className="ja-row-menu" ref={wrap} onClick={e => e.stopPropagation()}>
      <button
        ref={button}
        type="button"
        className="ja-row-menu__button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : show(true))}
        onKeyDown={onButtonKey}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      {open && (
        <div
          ref={list}
          className="ja-row-menu__list"
          role="menu"
          aria-label={label}
          data-ja-menu=""
          style={at ?? { top: 0, right: 0, visibility: 'hidden' }}
          onKeyDown={onListKey}
        >
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="ja-row-menu__item"
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
