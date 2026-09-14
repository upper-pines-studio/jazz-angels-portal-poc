import * as React from 'react';
/** Single-line text field, 38px tall with a 1px inset shadow. */
export interface InputProps {
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
