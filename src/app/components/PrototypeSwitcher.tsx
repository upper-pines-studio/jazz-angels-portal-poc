import React from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * PROTOTYPE — the floating bar that flips a prototype route between its
 * variants (`?variant=`). Arrow keys cycle too. Renders nothing in a
 * production build.
 */
export function PrototypeSwitcher({
  variants,
}: {
  variants: Array<{ key: string; name: string }>;
}) {
  const [params, setParams] = useSearchParams();
  const current = Math.max(
    0,
    variants.findIndex(v => v.key === params.get('variant')),
  );

  const go = React.useCallback(
    (step: number) => {
      const next = variants[(current + step + variants.length) % variants.length];
      setParams(
        p => {
          p.set('variant', next.key);
          return p;
        },
        { replace: true },
      );
    },
    [current, variants, setParams],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!import.meta.env.DEV) return null;

  const v = variants[current];
  const arrow: React.CSSProperties = {
    background: 'none',
    border: 0,
    color: 'inherit',
    font: 'inherit',
    fontSize: 'var(--text-lg)',
    cursor: 'pointer',
    padding: '0 var(--space-2)',
  };
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      style={{
        position: 'fixed',
        bottom: 'var(--space-5)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-4)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--neutral-900)',
        color: 'var(--neutral-0)',
        boxShadow: 'var(--shadow-lg)',
        font: 'var(--type-label)',
      }}
    >
      <button style={arrow} onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span style={{ minWidth: 200, textAlign: 'center' }}>
        {v.key} ({v.name}) · {current + 1}/{variants.length}
      </span>
      <button style={arrow} onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
