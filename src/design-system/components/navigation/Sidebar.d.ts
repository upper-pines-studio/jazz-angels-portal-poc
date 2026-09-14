import * as React from 'react';

export interface SidebarItemDef {
  id?: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  section?: string;
}
/**
 * Deep-blue primary navigation rail for the staff portal, 236px wide.
 * Pass `{section:'Programs'}` entries to print a group heading.
 */
export interface SidebarProps {
  items?: SidebarItemDef[];
  active?: string;
  onNavigate?: (id: string) => void;
  logoSrc?: string;
  brandName?: string;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Sidebar(props: SidebarProps): JSX.Element;
