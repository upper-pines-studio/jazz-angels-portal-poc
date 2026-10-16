import { describe, expect, it } from 'vitest';
import { firstFocus, wrapFocus } from '../dialogFocus';
import type { FocusTraits } from '../dialogFocus';

type Control = { name: string } & Partial<FocusTraits>;
const traits = (c: Control): FocusTraits => ({
  autofocus: !!c.autofocus,
  field: !!c.field,
  close: !!c.close,
});

const close: Control = { name: '×', close: true };
const reason: Control = { name: 'reason', field: true };
const notes: Control = { name: 'notes', field: true };
const cancel: Control = { name: 'Cancel' };
const confirm: Control = { name: 'Send back' };

describe('firstFocus', () => {
  it('takes the first field, past the × and any button before it', () => {
    expect(firstFocus([close, cancel, reason, notes, confirm], traits)).toBe(reason);
  });

  it('takes the first button other than the × when there is no field', () => {
    expect(firstFocus([close, cancel, confirm], traits)).toBe(cancel);
  });

  it('takes the × when it is the only control', () => {
    expect(firstFocus([close], traits)).toBe(close);
  });

  it('lets the dialog choose with data-autofocus, over a field', () => {
    const keep = { ...cancel, autofocus: true };
    expect(firstFocus([close, reason, keep, confirm], traits)).toBe(keep);
  });

  it('is undefined with no control at all', () => {
    expect(firstFocus([], traits)).toBeUndefined();
  });
});

describe('wrapFocus', () => {
  const controls = [close, reason, cancel, confirm];

  it('goes from the last control round to the first on Tab', () => {
    expect(wrapFocus(controls, confirm, false)).toBe(close);
  });

  it('goes from the first control round to the last on Shift+Tab', () => {
    expect(wrapFocus(controls, close, true)).toBe(confirm);
  });

  it('leaves the move in between to the browser', () => {
    expect(wrapFocus(controls, reason, false)).toBeUndefined();
    expect(wrapFocus(controls, cancel, true)).toBeUndefined();
  });

  it('brings focus in from outside: Tab to the first, Shift+Tab to the last', () => {
    expect(wrapFocus(controls, undefined, false)).toBe(close);
    expect(wrapFocus(controls, undefined, true)).toBe(confirm);
    expect(wrapFocus(controls, { name: 'elsewhere' }, false)).toBe(close);
  });

  it('keeps a single control where it is', () => {
    expect(wrapFocus([close], close, false)).toBe(close);
    expect(wrapFocus([close], close, true)).toBe(close);
  });

  it('is undefined with no controls', () => {
    expect(wrapFocus([], undefined, false)).toBeUndefined();
  });
});
