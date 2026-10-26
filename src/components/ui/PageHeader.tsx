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
export function PageHeader({ area, icon: Icon, title, onBack, backLabel, backDisabled = false, center, titleAccessory, actions }: {
  area: InkedArea;
  icon: LucideIcon;
  title: ReactNode;
  onBack: () => void;
  backLabel: string;
  /** Uscire adesso farebbe perdere un lavoro in corso. */
  backDisabled?: boolean;
  /** Un gruppo a sé, centrato nella riga (la pipeline nello Studio di
   *  traduzione): le due ali hanno la stessa larghezza, così resta al centro
   *  qualunque sia la lunghezza del titolo. */
  center?: ReactNode;
  /** Identità secondaria affiancata al titolo, come la pipeline di un’opera. */
  titleAccessory?: ReactNode;
  actions?: ReactNode;
}) {
  const leading = (
    <div className={`flex min-w-0 items-center gap-3 ${titleAccessory ? 'flex-1' : ''}`}>
      <IconButton size="sm" onClick={onBack} title={backLabel} disabled={backDisabled}>
        <ArrowLeft size={15} />
      </IconButton>
      <Icon size={16} className={`shrink-0 ${AREA_INK_CLASSNAME[area]}`} aria-hidden="true" />
      <h1 className={`min-w-0 ${titleAccessory ? 'max-w-[min(28vw,24rem)]' : ''}`}>{title}</h1>
      {titleAccessory && <div className="flex min-w-0 items-center gap-3">{titleAccessory}</div>}
    </div>
  );
  const trailing = actions && <div className="flex shrink-0 items-center justify-end gap-1">{actions}</div>;

  if (center) {
    return (
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-editorial-border px-3">
        {leading}
        <div className="flex min-w-0 items-center justify-center">{center}</div>
        <div className="flex min-w-0 justify-end">{trailing}</div>
      </header>
    );
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3">
      {leading}
      {trailing}
    </header>
  );
}
