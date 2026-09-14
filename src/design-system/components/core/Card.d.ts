import * as React from 'react';
/**
 * The universal container: white surface, 1px warm border, 8px radius, soft shadow.
 * Optional `accent` paints a 3px brand rule across the top.
 */
export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  padding?: string;
  accent?: string;
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function Card(props: CardProps): JSX.Element;
