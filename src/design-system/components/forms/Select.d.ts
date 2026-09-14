import * as React from 'react';
/** Native select with brand chrome. Options accept strings or {value,label}. */
export interface SelectProps {
  options?: Array<string | { value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  style?: React.CSSProperties;
}
export function Select(props: SelectProps): JSX.Element;
