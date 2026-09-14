import * as React from 'react';
/** Transient confirmation, bottom-right. The only component that uses a coloured left rule as its identifier. */
export interface ToastProps {
  tone?: 'success' | 'info' | 'warning' | 'danger';
  title?: React.ReactNode;
  message?: React.ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}
export function Toast(props: ToastProps): JSX.Element;
