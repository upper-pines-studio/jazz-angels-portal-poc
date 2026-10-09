import { Checkbox, Field } from '../../../../design-system';
import { programOptions, useStore } from '../../../../core';
import type { ProgramId } from '../../../../core';

/**
 * Choose the programs a grant's money is for, one or more (decision 0006).
 * They stay in the order the office lists its programs, Operations last,
 * whatever order they were ticked in. `error` shows when none is ticked.
 */
export function ProgramPicker({
  keep = [],
  value,
  onChange,
  error,
  style,
}: {
  /** Archived programs the grant already names: still shown, so it can keep them. */
  keep?: ProgramId[];
  value: ProgramId[];
  onChange: (next: ProgramId[]) => void;
  error?: string;
  style?: React.CSSProperties;
}) {
  const { state } = useStore();
  // The current programs, plus any archived one the grant already names.
  const options = programOptions(state, keep);
  const toggle = (id: ProgramId, on: boolean) =>
    onChange(options.map(p => p.id).filter(pid => (pid === id ? on : value.includes(pid))));

  return (
    <Field
      label="Programs"
      required
      hint="Choose every program this grant's money is for."
      error={error}
      style={style}
    >
      <div
        role="group"
        aria-label="Programs"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 'var(--space-2) var(--space-4)',
        }}
      >
        {options.map(p => (
          <Checkbox
            key={p.id}
            label={p.name}
            checked={value.includes(p.id)}
            onChange={on => toggle(p.id, on)}
          />
        ))}
      </div>
    </Field>
  );
}
