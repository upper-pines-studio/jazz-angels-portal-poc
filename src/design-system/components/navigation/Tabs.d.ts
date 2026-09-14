import * as React from 'react';
/** Underline tab set for switching views within one page. Accepts strings or {id,label,count}. */
export interface TabsProps {
  tabs?: Array<string | { id: string; label: React.ReactNode; count?: number }>;
  active?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}
export function Tabs(props: TabsProps): JSX.Element;
