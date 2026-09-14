import * as React from 'react';
/** What a list looks like before there is data. Always offer the action that fills it. */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
