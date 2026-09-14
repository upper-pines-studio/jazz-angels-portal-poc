import * as React from 'react';
/** Horizontal completion bar — grant spend, session attendance rate, fundraising goal. */
export interface ProgressBarProps {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  caption?: React.ReactNode;
  color?: string;
  height?: number;
  showValue?: boolean;
  style?: React.CSSProperties;
}
export function ProgressBar(props: ProgressBarProps): JSX.Element;
