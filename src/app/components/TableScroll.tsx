import React from 'react';

/**
 * Wrap a DataTable so it scrolls sideways on narrow screens instead of
 * crushing its columns. `minWidth` is the narrowest the table may get; pick
 * roughly the sum of the fixed columns plus ~120px per flexible one.
 *
 *   <TableScroll minWidth={720}><DataTable … /></TableScroll>
 */
export function TableScroll({ minWidth = 640, children }: { minWidth?: number; children: React.ReactNode }) {
  return (
    <div className="ja-table-scroll">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
