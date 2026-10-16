import React from 'react';
// The one place the design-system Dialog is imported; eslint.config.js stops any other.
import { Dialog } from '../../design-system';
import type { DialogProps } from '../../design-system';
import { firstFocus, wrapFocus } from './dialogFocus';

export interface AppDialogProps extends DialogProps {
  /**
   * Mid-save: Escape, the × and the scrim leave the dialog open. No dialog
   * needs it today, since the store saves at once; it is here for one that waits.
   */
  busy?: boolean;
}

/** The controls Tab can reach, before the visibility check. */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The open dialogs, newest last: only the top one answers Escape and Tab. */
const stack: HTMLElement[] = [];

/**
 * The design-system Dialog, made to behave as a dialog: focus moves into it
 * when it opens (its first field, else its first button, or whichever control
 * carries `data-autofocus`), Tab and Shift+Tab stay inside it, Escape calls
 * `onClose` as the × does, and on closing focus goes back to whatever opened
 * it. The box gets `role="dialog"`, `aria-modal` and `aria-labelledby` /
 * `aria-describedby` pointing at its title and description.
 *
 * `Dialog.jsx` is shared with the staff-portal POC and is not edited, and it
 * does not pass props through to its box, so this renders it unchanged inside
 * a `display: contents` holder (no box of its own, so the scrim still anchors
 * to `.ja-viewport` and nothing moves) and decorates the box it finds there
 * after each render. Every dialog in src/ goes through here; lint stops a
 * direct import of `Dialog`.
 */
export function AppDialog({ busy = false, onClose, ...props }: AppDialogProps) {
  const isOpen = props.open !== false;
  const holder = React.useRef<HTMLDivElement | null>(null);
  const ids = React.useId();

  // Whatever had focus as the dialog opened, read before the commit so a menu
  // item that opens it is still on the page.
  const opener = React.useRef<HTMLElement | null>(null);
  const wasOpen = React.useRef(false);
  if (isOpen && !wasOpen.current) opener.current = openerOf(document.activeElement);
  wasOpen.current = isOpen;

  const latest = React.useRef({ onClose, busy });
  latest.current = { onClose, busy };

  // Name the box after every render: the title or description may change.
  React.useLayoutEffect(() => {
    const box = boxIn(holder.current);
    if (!box) return;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('tabindex', '-1');
    const title = box.querySelector<HTMLElement>(':scope > header h2');
    const description = box.querySelector<HTMLElement>(':scope > header p');
    label(box, 'aria-labelledby', title?.textContent ? title : null, `${ids}title`);
    label(box, 'aria-describedby', description, `${ids}description`);
  });

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const box = boxIn(holder.current);
    if (!box) return;
    stack.push(box);
    const from = opener.current;

    // In, unless something inside already took it.
    if (!box.contains(document.activeElement)) {
      (firstFocus(tabbable(box), el => traits(box, el)) ?? box).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== box || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        // Ours alone: a side panel underneath keeps its own Escape.
        e.preventDefault();
        e.stopPropagation();
        if (!latest.current.busy) latest.current.onClose?.();
      } else if (e.key === 'Tab') {
        const active = document.activeElement as HTMLElement | null;
        const controls = tabbable(box);
        const inside = active && box.contains(active) ? active : undefined;
        const next = controls.length === 0 ? box : wrapFocus(controls, inside, e.shiftKey);
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(box), 1);
      // Back where it came from, unless focus has already gone somewhere else.
      const active = document.activeElement;
      const lost = !active || active === document.body || box.contains(active);
      if (lost && from?.isConnected) from.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div ref={holder} style={{ display: 'contents' }}>
      <Dialog {...props} onClose={busy ? undefined : onClose} />
    </div>
  );
}

/** The dialog box: the scrim's only child. */
function boxIn(holder: HTMLElement | null): HTMLElement | null {
  return (holder?.firstElementChild?.firstElementChild as HTMLElement | null) ?? null;
}

/**
 * The control to give focus back to. A menu item that opens a dialog is gone
 * once the menu closes, so it is the menu's button instead: the one still
 * marked expanded.
 */
function openerOf(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (active.closest('[role="menu"]')) {
    return document.querySelector<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]');
  }
  return active;
}

/** Point `attr` on the box at `target`, giving it an id if it has none. */
function label(box: HTMLElement, attr: string, target: HTMLElement | null, id: string) {
  if (!target) {
    box.removeAttribute(attr);
    return;
  }
  if (!target.id) target.id = id;
  box.setAttribute(attr, target.id);
}

/** What Tab can reach inside the box, in order: shown, and one radio per group. */
function tabbable(box: HTMLElement): HTMLElement[] {
  const all = Array.from(box.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    el => el.getClientRects().length > 0,
  );
  return all.filter(el => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
    const group = all.filter(
      (o): o is HTMLInputElement =>
        o instanceof HTMLInputElement && o.type === 'radio' && o.name === el.name,
    );
    return el.checked || (!group.some(o => o.checked) && group[0] === el);
  });
}

function traits(box: HTMLElement, el: HTMLElement) {
  return {
    autofocus: el.hasAttribute('data-autofocus'),
    field: el.matches('input, select, textarea'),
    // The × is the only button in the Dialog's own header.
    close: el.parentElement?.tagName === 'HEADER' && el.parentElement.parentElement === box,
  };
}
