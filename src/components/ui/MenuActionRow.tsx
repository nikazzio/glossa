import type { ReactNode } from 'react';

interface MenuActionRowProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * Voce di comando dentro un `ClickPopover`: icona, etichetta, tono
 * opzionale per le azioni distruttive. Copre un caso che né `PopoverItem`
 * (niente icona) né i pattern locali tipo `ViewOptionRow` (niente tono
 * danger, pensato per opzioni "attive"/"non attive" non per azioni) coprono.
 */
export function MenuActionRow({ icon, label, onClick, tone = 'default', disabled = false }: MenuActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'danger'
          ? 'text-editorial-danger hover:bg-editorial-danger/10'
          : 'text-editorial-ink hover:bg-editorial-textbox/60'
      }`}
    >
      <span className={tone === 'danger' ? 'text-editorial-danger' : 'text-editorial-muted'}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
