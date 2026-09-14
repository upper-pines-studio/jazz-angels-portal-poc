import * as React from 'react';
/** Label + hint/error wrapper shared by every form control. Wrap Input, Select, Textarea in this. */
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function Field(props: FieldProps): JSX.Element;
