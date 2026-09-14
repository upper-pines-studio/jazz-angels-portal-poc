import * as React from 'react';
/** Multi-line text entry — grant narratives, lesson notes, attendance comments. */
export interface TextareaProps {
  rows?: number;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  style?: React.CSSProperties;
}
export function Textarea(props: TextareaProps): JSX.Element;
