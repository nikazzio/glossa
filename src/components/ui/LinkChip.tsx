import { X } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface LinkChipProps {
  label: string;
  /** Cosa succede premendo la X: sta nel tooltip, non nel `title` nativo. */
  hint: string;
  onClick: () => void;
}

/**
 * L'etichetta di un legame già stabilito — il workspace a cui un'opera è
 * collegata, la collezione in cui sta. Solo la X lo scioglie: il resto del
 * riquadro è solo lettura, premerci sopra non fa niente — un intero
 * riquadro cliccabile per togliere un legame è facile da far scattare per
 * sbaglio.
 *
 * Una primitiva sola perché il legame è lo stesso concetto: due copie di
 * questa riga avrebbero preso col tempo due aspetti diversi per la stessa
 * cosa.
 */
export function LinkChip({ label, hint, onClick }: LinkChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-editorial-accent/40 bg-editorial-accent/8 py-0.5 pl-2 pr-1 text-xs text-editorial-accent">
      {label}
      <Tooltip label={hint} side="top">
        <button
          type="button"
          onClick={onClick}
          aria-label={hint}
          className="flex items-center justify-center rounded-full p-0.5 transition-colors hover:bg-editorial-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <X size={11} aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
}
