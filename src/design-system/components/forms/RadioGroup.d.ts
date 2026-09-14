import * as React from 'react';
/** Single-choice group for 2–4 short options (attendance status, grant stage). */
export interface RadioGroupProps {
  options?: Array<string | { value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  name?: string;
  direction?: 'row' | 'column';
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export function RadioGroup(props: RadioGroupProps): JSX.Element;
