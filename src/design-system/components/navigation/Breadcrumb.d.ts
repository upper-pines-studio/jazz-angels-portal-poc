import * as React from 'react';
/** Slash-separated trail above a page title. Last item is the current page and is not a link. */
export interface BreadcrumbProps {
  items?: Array<{ label: React.ReactNode; href?: string }>;
  style?: React.CSSProperties;
}
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
