import * as React from 'react';

/**
 * The one action control. Primary blue for the single most important action per view,
 * gold accent reserved for Donate / Enroll, ghost for toolbar-level actions.
 */
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  as?: keyof JSX.IntrinsicElements;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
