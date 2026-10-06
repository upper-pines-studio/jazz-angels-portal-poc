import React from 'react';
import { Icon } from '../../../../design-system';
import { BudgetPopover } from './BudgetPopover';

export interface BudgetMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * The three dots at the end of a budget line: Edit line, View transactions,
 * See pacing, Remove line. Arrow keys move through it; Escape closes it and
 * puts focus back on the dots.
 */
export function BudgetRowMenu({ label, items }: { label: string; items: BudgetMenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const uid = React.useId().replace(/:/g, '');
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      (
        document.querySelector(`#budget-menu-${uid} [role="menuitem"]`) as HTMLElement | null
      )?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, uid]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const all = Array.from(
      document.querySelectorAll<HTMLElement>(`#budget-menu-${uid} [role="menuitem"]`),
    );
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      all[all.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="budget-dots"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `budget-menu-${uid}` : undefined}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      <BudgetPopover
        anchor={trigger}
        open={open}
        onClose={close}
        width={200}
        align="right"
        id={`budget-menu-${uid}`}
        role="menu"
        ariaLabel={label}
        onKeyDown={onKeyDown}
        className="budget-menu"
      >
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={`budget-menu__item${item.danger ? ' is-danger' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setOpen(false);
              item.onSelect();
            }}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </BudgetPopover>
    </>
  );
}
