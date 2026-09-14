import * as React from 'react';
/**
 * Thin wrapper over the Lucide CDN icon set (an intentional addition — the brand ships no icons).
 * Host page must include the Lucide script tag; see docs/design-system.md ICONOGRAPHY.
 */
export interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
}
export function Icon(props: IconProps): JSX.Element;
