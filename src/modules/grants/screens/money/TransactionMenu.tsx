import React from 'react';
import { Icon } from '../../../../design-system';

export interface MenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
}

/**
 * The "…" menu at the end of a handled row: Change, Send back to assign, See
 * in grant. Opens on click, closes on a click elsewhere or Escape.
 */
export function TransactionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const button = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tx-menu" ref={wrap} onClick={e => e.stopPropagation()}>
      <button
        ref={button}
        type="button"
        className="tx-menu__button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      {open && (
        <div className="tx-menu__list" role="menu" data-ja-menu="">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="tx-menu__item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
