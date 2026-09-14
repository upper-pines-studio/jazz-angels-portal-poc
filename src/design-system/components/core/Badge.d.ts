import * as React from 'react';
/** Small uppercase status marker. Use for state (Paid, Overdue, Draft), never for navigation. */
export interface BadgeProps {
  tone?: 'neutral' | 'blue' | 'teal' | 'olive' | 'gold' | 'danger' | 'solid';
  dot?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;
