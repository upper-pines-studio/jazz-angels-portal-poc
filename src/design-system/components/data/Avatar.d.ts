import * as React from 'react';
/**
 * Initials disc for students, teachers, and funders. Colour is derived from the name
 * so the same person is always the same hue. Photos are supported but the portal
 * defaults to initials (see docs/design-system.md: imagery is flat colour, not photography).
 */
export interface AvatarProps {
  name?: string;
  size?: number;
  src?: string;
  tone?: string;
  style?: React.CSSProperties;
}
export function Avatar(props: AvatarProps): JSX.Element;
