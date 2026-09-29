import React from 'react';
import { Icon } from '../../../../design-system';
import { useStore } from '../../../../core';
import { accountUsedBy } from '../../domain';
import { BudgetPopover } from './BudgetPopover';

/**
 * Pick the QuickBooks expense accounts whose spending counts on a budget line.
 * Chosen accounts sit in the field as chips; the list shows every expense
 * account, with the line on this grant that already counts it on the right.
 * Keyboard: type to search, arrows to move, Enter or Space to tick, Backspace
 * on an empty search to drop the last chip, Escape to close.
 */
export function BudgetAccountPicker({ grantId, lineId, value, onChange, invalid = false }: {
  grantId: string;
  /** The line being edited, so it does not count as "used by" itself. */
  lineId?: string;
  value: string[];
  onChange: (codes: string[]) => void;
  invalid?: boolean;
}) {
  const { state } = useStore();
  const accounts = state.grants.accounts;
  const box = React.useRef<HTMLDivElement | null>(null);
  const input = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  // The order is fixed when the list opens, so ticking a box never moves the row under the pointer.
  const [openedWith, setOpenedWith] = React.useState<string[]>(value);
  const uid = React.useId().replace(/:/g, '');
  const listId = `budget-accounts-${uid}`;

  const usedBy = (code: string) => accountUsedBy(state, grantId, code, lineId).map(l => l.category);

  const q = query.trim().toLowerCase();
  const options = accounts
    .filter(a => !q || a.code.includes(q) || a.name.toLowerCase().includes(q))
    .map(a => ({ ...a, used: usedBy(a.code) }))
    .sort((a, b) => {
      const rank = (o: { code: string; used: string[] }) => (openedWith.includes(o.code) ? 0 : o.used.length ? 2 : 1);
      return rank(a) - rank(b) || a.code.localeCompare(b.code);
    });

  const show = () => {
    if (!open) {
      setOpenedWith(value);
      setActive(0);
      setOpen(true);
    }
  };
  const close = React.useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code]);
  };

  React.useEffect(() => {
    if (active >= options.length) setActive(Math.max(0, options.length - 1));
  }, [options.length, active]);

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { show(); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => (options.length ? (i + step + options.length) % options.length : 0));
    } else if (e.key === 'Enter' || (e.key === ' ' && open && !query)) {
      // Enter here ticks an account; it must not save the line.
      e.preventDefault();
      e.stopPropagation();
      if (!open) { show(); return; }
      const o = options[active];
      if (o) toggle(o.code);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    } else if (e.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const name = (code: string) => accounts.find(a => a.code === code)?.name ?? 'Unknown account';

  return (
    <div className="budget-picker-wrap">
      <div ref={box}
        className={`budget-picker${focused || open ? ' is-focused' : ''}${invalid ? ' is-invalid' : ''}`}
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          input.current?.focus();
          if (open) close(); else show();
        }}>
        {value.map(code => (
          <span key={code} className="budget-chip budget-chip--edit">
            <b>{code}</b>{name(code)}
            <button type="button" aria-label={`Remove ${code} ${name(code)}`}
              onClick={() => { onChange(value.filter(c => c !== code)); input.current?.focus(); }}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input ref={input} className="budget-picker__search" value={query}
          placeholder={value.length ? 'Search' : 'Search accounts'}
          role="combobox" aria-label="QuickBooks accounts" aria-expanded={open} aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={e => { setQuery(e.target.value); setActive(0); show(); }}
          onKeyDown={onKeyDown} />
        <span className="budget-picker__caret" aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
      </div>

      <BudgetPopover anchor={box} open={open} onClose={close} width={440} maxHeight={320} className="budget-accounts">
        <div className="budget-accounts__head" aria-hidden="true">
          <span>Expense accounts in QuickBooks</span><span>Used by</span>
        </div>
        <div id={listId} role="listbox" aria-multiselectable="true" aria-label="Expense accounts in QuickBooks" className="budget-accounts__list">
          {options.length === 0 && (
            <div className="budget-accounts__none">No account matches "{query.trim()}". Try a number like 6200 or a word like supplies.</div>
          )}
          {options.map((o, i) => {
            const on = value.includes(o.code);
            return (
              <div key={o.code} id={`${listId}-${i}`} role="option" aria-selected={on}
                className={`budget-option${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => { toggle(o.code); input.current?.focus(); }}>
                <span className="budget-check" aria-hidden="true">{on && <Icon name="check" size={12} strokeWidth={3} />}</span>
                <span className="budget-option__code">{o.code}</span>
                <span className="budget-option__name">{o.name}</span>
                <span className="budget-option__used">{o.used.join(', ')}</span>
              </div>
            );
          })}
        </div>
      </BudgetPopover>
    </div>
  );
}
