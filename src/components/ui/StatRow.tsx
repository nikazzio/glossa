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
      <dt className="flex items-center gap-1 caption-label">
        {info ? <Hint label={`${label} — ${info}`} side="right">{label}</Hint> : label}
      </dt>
      <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{value}</dd>
    </div>
  );
}
