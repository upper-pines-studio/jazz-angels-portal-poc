import * as React from 'react';
/** Square multi-select control. Uncontrolled by default; pass `checked` to control it. */
export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: number;
  onChange?: (next: boolean) => void;
  style?: React.CSSProperties;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
