import type { ReactNode } from 'react';

/**
 * Una voce di classifica: nome a sinistra, barra proporzionale al massimo
 * dell'elenco, valore a destra. Barra in inchiostro, testo nei colori del
 * testo; una nota breve può stare sotto il nome.
 */
export function MeterRow({ label, note, ratio, value, barClassName = 'bg-editorial-ink' }: {
  label: ReactNode;
  note?: ReactNode;
  /** Quota rispetto alla voce più grande dell'elenco, 0–1. */
  ratio: number;
  value: ReactNode;
  barClassName?: string;
}) {
  const width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-editorial-ink">{label}</p>
        {note && <p className="break-words text-xs text-editorial-muted">{note}</p>}
      </div>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-editorial-textbox" aria-hidden="true">
        <span className={`block h-full rounded-full ${barClassName}`} style={{ width }} />
      </span>
      <span className="text-right font-display text-sm italic tabular-nums text-editorial-ink">{value}</span>
    </div>
  );
}
