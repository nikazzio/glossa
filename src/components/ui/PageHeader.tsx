import type { ReactNode } from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { IconButton } from './IconButton';
import { AREA_INK_CLASSNAME, type InkedArea } from './AreaHeading';

/**
 * La riga in cima a una pagina di dettaglio (scheda opera, Studio): ritorno
 * all'elenco, segno dell'area nel suo inchiostro, identità di quello che si sta
 * guardando, e a destra i suoi comandi. L'identità prende lo spazio che avanza
 * e si tronca solo quando serve davvero.
 */
export function PageHeader({ area, icon: Icon, title, onBack, backLabel, actions }: {
  area: InkedArea;
  icon: LucideIcon;
  title: ReactNode;
  onBack: () => void;
  backLabel: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton size="sm" onClick={onBack} title={backLabel}>
          <ArrowLeft size={15} />
        </IconButton>
        <Icon size={16} className={`shrink-0 ${AREA_INK_CLASSNAME[area]}`} aria-hidden="true" />
        <h1 className="min-w-0">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center justify-end gap-1">{actions}</div>}
    </header>
  );
}
