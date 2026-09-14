import * as React from 'react';
/**
 * Public-site section opener: teal eyebrow, display heading, 56px gold rule, optional lede.
 * The gold rule is the brand's recurring section marker — keep it on.
 */
export interface SectionHeadingProps {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  align?: 'left' | 'center';
  rule?: boolean;
  style?: React.CSSProperties;
}
export function SectionHeading(props: SectionHeadingProps): JSX.Element;
