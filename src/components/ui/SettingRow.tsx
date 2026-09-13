import type { ReactNode } from 'react';
import { Hint } from './Hint';

/**
 * La riga di un'impostazione: etichetta a sinistra, comando a destra, e la
 * spiegazione **al passaggio del mouse**.
 *
 * Un pannello di impostazioni si legge per le voci, non per la prosa: le righe
 * hanno tutte la stessa altezza e la stessa etichetta, così l'occhio scorre la
 * colonna di sinistra e trova subito il comando allineato a destra. Viveva
 * dentro la scheda Scaricamento e ogni altra scheda ne aveva una copia leggermente
 * diversa — corpo del testo, spaziatura, icona ripetuta a sinistra.
 *
 * Va dentro una lista `divide-y divide-editorial-border/60 border-y
 * border-editorial-border/70`, che è il trattamento degli elenchi nelle finestre.
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-editorial-ink">
        <span className="min-w-0 truncate">{label}</span>
        {/* La spiegazione si raggiunge anche da tastiera, e premerla la apre:
            un comando che non fa niente è una promessa non mantenuta. */}
        {hint && <Hint label={hint} size="xs" />}
      </span>
      {/* Il comando non si allarga a spese dell'etichetta: un campo a larghezza
          piena riduceva «Nome» a «No…». */}
      <span className="flex shrink-0 items-center justify-end gap-2">{children}</span>
    </div>
  );
}
