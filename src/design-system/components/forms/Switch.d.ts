import * as React from 'react';
/** Instant on/off for settings that apply immediately (no Save). Teal when on. */
export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  label?: React.ReactNode;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
  style?: React.CSSProperties;
}
export function Switch(props: SwitchProps): JSX.Element;
