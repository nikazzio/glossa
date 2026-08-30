import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface LinkChipProps {
  label: string;
  /** Cosa succede cliccando: sta nel tooltip, non nel `title` nativo. */
  hint: string;
  onClick: () => void;
  icon?: LucideIcon;
}

/**
 * L'etichetta di un legame già stabilito — il workspace a cui un'opera è
 * collegata, la collezione in cui sta — che cliccata lo scioglie.
 *
 * Una primitiva sola perché il legame è lo stesso concetto: due copie di
 * questa riga avrebbero preso col tempo due aspetti diversi per la stessa
 * cosa.
 */
export function LinkChip({ label, hint, onClick, icon: Icon }: LinkChipProps) {
  return (
    <Tooltip label={hint} side="top">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 rounded-full border border-editorial-accent/40 bg-editorial-accent/8 px-2 py-0.5 text-xs text-editorial-accent transition-colors hover:border-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        {label}
        {Icon && <Icon size={11} aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
