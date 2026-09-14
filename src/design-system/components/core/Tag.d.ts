import * as React from 'react';
/** Pill-shaped descriptor with a colour dot — instruments, ensembles, grant categories. Removable when `onRemove` is given. */
export interface TagProps {
  onRemove?: () => void;
  color?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function Tag(props: TagProps): JSX.Element;
