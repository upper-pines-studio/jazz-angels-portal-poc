import * as React from 'react';
/**
 * Centred modal on a 44% warm scrim with a 2px backdrop blur.
 * Renders `position:absolute` so it can be scoped to a mocked screen frame.
 */
export interface DialogProps {
  open?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  width?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Dialog(props: DialogProps): JSX.Element | null;
