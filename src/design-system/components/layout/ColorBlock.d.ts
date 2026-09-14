import * as React from 'react';
/**
 * Flat brand-colour field — the system's substitute for photography.
 * Public pages are built by alternating these against paper and white.
 */
export interface ColorBlockProps {
  tone?: 'blue' | 'blue-deep' | 'teal' | 'olive' | 'gold' | 'paper' | 'white';
  pad?: string;
  ratio?: string;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export function ColorBlock(props: ColorBlockProps): JSX.Element;
