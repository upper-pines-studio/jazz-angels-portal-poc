import * as React from 'react';
/** Page header inside the portal frame: title, optional breadcrumb/subtitle, right-aligned actions. */
export interface TopBarProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}
export function TopBar(props: TopBarProps): JSX.Element;
