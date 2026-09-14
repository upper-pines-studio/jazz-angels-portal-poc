import * as React from 'react';
/** Dark hover label for icon-only controls and truncated cells. Never put actions inside it. */
export interface TooltipProps {
  label: React.ReactNode;
  placement?: 'top' | 'bottom';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Tooltip(props: TooltipProps): JSX.Element;
