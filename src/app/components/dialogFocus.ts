/**
 * Where focus goes in a dialog, kept apart from the DOM so it can be tested in
 * node: which control takes focus when the dialog opens, and where Tab and
 * Shift+Tab go at either end. `AppDialog` feeds these the dialog's controls.
 */

/** What `firstFocus` needs to know about each control, in document order. */
export interface FocusTraits {
  /** Marked `data-autofocus`: the dialog chose it to take focus first. */
  autofocus: boolean;
  /** An input, select or textarea. */
  field: boolean;
  /** The design-system Dialog's own × in the header. */
  close: boolean;
}

/**
 * The control that takes focus when a dialog opens: the one it marked
 * `data-autofocus`, else its first field, else its first button other than the
 * ×, else the ×. Undefined when it has no control at all.
 */
export function firstFocus<T>(controls: T[], traits: (control: T) => FocusTraits): T | undefined {
  const all = controls.map(c => ({ c, t: traits(c) }));
  return (
    all.find(x => x.t.autofocus)?.c ??
    all.find(x => x.t.field)?.c ??
    all.find(x => !x.t.close)?.c ??
    all[0]?.c
  );
}

/**
 * Where Tab (or Shift+Tab, `back`) goes from `active`, so focus stays inside:
 * round from the last control to the first and back, and into the dialog when
 * focus is outside it. Undefined when the browser's own move is right.
 */
export function wrapFocus<T>(controls: T[], active: T | undefined, back: boolean): T | undefined {
  if (controls.length === 0) return undefined;
  const first = controls[0];
  const last = controls[controls.length - 1];
  const at = active === undefined ? -1 : controls.indexOf(active);
  if (at === -1) return back ? last : first;
  if (back && at === 0) return last;
  if (!back && at === controls.length - 1) return first;
  return undefined;
}
