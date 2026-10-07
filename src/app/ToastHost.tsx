import React from 'react';
import { Toast } from '../design-system';

type ToastTone = 'success' | 'info' | 'warning' | 'danger';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: React.ReactNode;
  message?: React.ReactNode;
}

type ToastInput = Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastTone };
const Ctx = React.createContext<(t: ToastInput) => void>(() => {});

/**
 * `const toast = useToast(); toast({ title: 'Grant added' })` — bottom-right, auto-dismiss in 4s.
 * Tone defaults to success. A danger toast, such as a change that could not be saved, stays 8s so
 * it is not missed.
 */
export function useToast() {
  return React.useContext(Ctx);
}

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((t: ToastInput) => {
    const id = Date.now() + Math.random();
    setItems(xs => [...xs, { tone: 'success', ...t, id }]);
    const ms = t.tone === 'danger' ? 8000 : 4000;
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), ms);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        className="ja-toasts"
        style={{
          position: 'fixed',
          right: 'var(--space-6)',
          bottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          zIndex: 100,
        }}
      >
        {items.map(t => (
          <Toast
            key={t.id}
            tone={t.tone}
            title={t.title}
            message={t.message}
            onDismiss={() => setItems(xs => xs.filter(x => x.id !== t.id))}
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}
