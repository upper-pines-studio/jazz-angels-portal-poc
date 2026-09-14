import * as React from 'react';
/**
 * A single number with its label and trend — dashboard top row.
 * The 3px left rule carries the brand hue that identifies the metric's domain.
 */
export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: 'teal' | 'gold' | 'danger' | 'neutral';
  footnote?: React.ReactNode;
  accent?: string;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}
export function StatCard(props: StatCardProps): JSX.Element;
