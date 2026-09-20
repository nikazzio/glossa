import type { LucideIcon } from 'lucide-react';
import { Hint } from './Hint';

interface SectionLabelProps {
  icon: LucideIcon;
  label: string;
  /** La spiegazione della sezione. Quando c'è, il titolo stesso la porta: si
   *  apre passandoci sopra o premendolo, senza aggiungere una «i» accanto. */
  hint?: string;
  /** Anima l'icona in rotazione: per una sezione che segue una pagina in
   *  caricamento, senza toccare le altre, che non la passano. */
  iconSpinning?: boolean;
  /** Sostituisce il colore di sempre dell'icona con quello degli errori: per
   *  una sezione che segue una pagina appena fallita. */
  iconTone?: 'accent' | 'danger';
}

export function SectionLabel({
  icon: Icon,
  label,
  hint,
  iconSpinning = false,
  iconTone = 'accent',
}: SectionLabelProps) {
  const content = (
    <span className="flex items-center gap-1.5">
      <Icon
        size={11}
        className={[
          'shrink-0',
          iconTone === 'danger' ? 'text-editorial-danger' : 'text-editorial-accent',
          iconSpinning ? 'animate-spin' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {/* 11px: è la misura che le intestazioni di sezione hanno già in tutta
          l'app (ventisei punti la scrivevano a mano). La primitiva si allinea a
          loro invece del contrario, così adottarla non sposta niente. */}
      <span className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
        {label}
      </span>
    </span>
  );
  if (!hint) return <div className="flex items-center gap-1.5">{content}</div>;
  return <Hint label={`${label} — ${hint}`}>{content}</Hint>;
}
