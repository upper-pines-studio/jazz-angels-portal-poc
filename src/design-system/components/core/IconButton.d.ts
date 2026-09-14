import * as React from 'react';
/** Square icon-only action. Always pass `label` — it becomes aria-label and tooltip. */
export interface IconButtonProps {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'solid' | 'outline';
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function IconButton(props: IconButtonProps): JSX.Element;
