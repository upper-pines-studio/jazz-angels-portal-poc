import React from 'react';
import { Button, Icon } from '../../../design-system';

/**
 * Small layout pieces shared by the grant-detail tabs: the bands that separate
 * sections inside the tab panel, and the field stack used in every dialog.
 */

/** Title band for a section inside a tab panel: 1px top rule, title, right-aligned action. */
export function SectionBand({ title, action, first = false }: { title: React.ReactNode; action?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 42,
      padding: '10px var(--space-6)',
      borderTop: first ? undefined : 'var(--border-width) solid var(--border-subtle)',
    }}>
      <h4 style={{ font: 'var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans)', color: 'var(--text-strong)', letterSpacing: 0 }}>{title}</h4>
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}

/** The band at the foot of a tab panel that holds "+ Add …". */
export function FooterBand({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 'var(--space-3) var(--space-6)' }}>{children}</div>;
}

/** Ghost "+ Add task" style button used in footer and section bands. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" iconLeft={<Icon name="plus" size={14} />} onClick={onClick}>{label}</Button>
  );
}

/** Vertical stack of Fields inside a Dialog. */
export function DialogFields({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>{children}</div>;
}

/** Two fields side by side inside a Dialog. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="ja-grid-2">{children}</div>;
}

/** A teal check followed by a date — "received", "done". */
export function DoneMark({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)', color: 'var(--teal-700)' }}>
      <Icon name="check" size={13} color="var(--teal-500)" />{children}
    </span>
  );
}

/** The faint × that deletes a row. Colours up on its own hover. */
export function DeleteX({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex',
        color: hover ? 'var(--danger-500)' : 'var(--text-faint)', transition: 'var(--transition-control)',
      }}>
      <Icon name="x" size={14} />
    </button>
  );
}

/** "Delete this task?" — inline confirmation, so nothing calls window.confirm. */
export function InlineConfirm({ question, onConfirm, onCancel }: { question: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'auto', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      {question}
      <button onClick={onConfirm} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--danger-500)', font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)' }}>Delete</button>
      <button onClick={onCancel} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)' }}>Keep</button>
    </span>
  );
}

export const MONO_SM: React.CSSProperties = { font: 'var(--weight-medium) var(--text-xs)/1.3 var(--font-mono)' };

/**
 * Which DataTable row the pointer is over, so a cell can reveal a control on
 * row hover. Spread `hoverProps` on a wrapper around the table; the index is
 * the row index (header excluded), or -1.
 */
export function useRowHover() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(-1);
  const onMouseMove = (e: React.MouseEvent) => {
    const table = ref.current?.firstElementChild;
    if (!table) return;
    const kids = Array.from(table.children);
    const row = kids.find(k => k.contains(e.target as Node));
    const next = row ? kids.indexOf(row) - 1 : -1;
    setIndex(prev => (prev === next ? prev : next));
  };
  return { ref, index, hoverProps: { onMouseMove, onMouseLeave: () => setIndex(-1) } };
}
