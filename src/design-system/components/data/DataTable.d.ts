import * as React from 'react';

export interface DataTableColumn {
  key: string;
  label: React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  strong?: boolean;
  wrap?: boolean;
  render?: (row: any) => React.ReactNode;
}
/**
 * The workhorse of the staff portal: roster, grants pipeline, timesheets.
 * CSS-grid rows, uppercase header band on the sunken surface, blue-50 hover.
 */
export interface DataTableProps {
  columns?: DataTableColumn[];
  rows?: any[];
  onRowClick?: (row: any) => void;
  selectable?: boolean;
  selected?: string[];
  onToggle?: (row: any) => void;
  emptyLabel?: string;
  style?: React.CSSProperties;
}
export function DataTable(props: DataTableProps): JSX.Element;
