interface PopoverItemProps {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Seconda riga, più piccola e a spaziatura fissa: l'inizio di un testo
   *  salvato (un modello di prompt), per riconoscerlo oltre che dal nome. */
  description?: string;
}

/**
 * Una voce di elenco dentro un `ClickPopover`: scegliere un workspace, una
 * collezione, una vista salvata.
 *
 * Sta qui perché la stessa riga era scritta a mano in tre posti, ogni volta
 * con le sue classi e il suo anello di focus: tre copie che prima o poi
 * divergono. `Menu` non copre questi casi, dove accanto alla voce vive un
 * altro comando o un campo.
 */
export function PopoverItem({ label, onSelect, disabled = false, description }: PopoverItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="min-w-0 flex-1 truncate rounded px-3 py-1.5 text-left text-sm text-editorial-ink transition-colors hover:bg-surface-hover/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {description === undefined ? label : (
        <>
          <span className="block truncate">{label}</span>
          <span className="block truncate font-mono text-xs text-editorial-muted">{description}</span>
        </>
      )}
    </button>
  );
}
