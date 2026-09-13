import type { ReactNode } from 'react';
import { Hint } from './Hint';

interface StatRowProps {
  label: string;
  /** Testo, oppure un elemento quando il valore porta con sé un colore di stato. */
  value: ReactNode;
  info?: string;
}

export function StatRow({ label, value, info }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
        {label}
        {info && <Hint label={info} size="xs" side="right" />}
      </dt>
      <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{value}</dd>
    </div>
  );
}
