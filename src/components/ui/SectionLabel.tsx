import type { LucideIcon } from 'lucide-react';

interface SectionLabelProps {
  icon: LucideIcon;
  label: string;
}

export function SectionLabel({ icon: Icon, label }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} className="shrink-0 text-editorial-accent" />
      {/* 11px: è la misura che le intestazioni di sezione hanno già in tutta
          l'app (ventisei punti la scrivevano a mano). La primitiva si allinea a
          loro invece del contrario, così adottarla non sposta niente. */}
      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
        {label}
      </p>
    </div>
  );
}
