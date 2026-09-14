import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { IconButton, type IconButtonSize } from './IconButton';
import { Tooltip, type TooltipSide } from './Tooltip';

/**
 * La spiegazione di un comando o di un campo, raggiungibile anche senza mouse.
 *
 * Prima erano pulsanti che non facevano niente: chi naviga da tastiera ci
 * arrivava, sentiva annunciare un pulsante, premeva Invio e non succedeva
 * nulla. Qui premere apre la spiegazione e la lascia aperta finché non si
 * preme di nuovo, non si esce col fuoco o non si preme Esc.
 *
 * Due stati distinti di proposito: `hovered` è l'apertura passeggera del
 * passaggio del mouse, `pinned` quella voluta col click. Tenendone uno solo,
 * il passaggio del mouse apriva e il click che doveva fissare chiudeva, e
 * l'uscita del mouse chiudeva anche ciò che era stato fissato.
 *
 * Senza `children` mostra la «i» consueta; con `children` è l'elemento passato
 * a portare la spiegazione (un'etichetta di stato, un nome che va spiegato).
 */
export function Hint({ label, size = 'xs', side, children }: {
  label: string;
  size?: IconButtonSize;
  side?: TooltipSide;
  children?: ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const close = () => { setPinned(false); setHovered(false); };
  return (
    <Tooltip label={label} side={side} open={pinned || hovered}
      onOpenChange={(next) => { if (!pinned) setHovered(next); }}>
      <IconButton
        title=""
        ariaLabel={label}
        ariaPressed={pinned}
        size={size}
        tone={children ? 'default' : undefined}
        className={children ? 'rounded border-none px-1 py-0' : undefined}
        onClick={() => { setPinned(!pinned); setHovered(false); }}
        onBlur={close}
        onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
      >
        {children ?? <Info size={13} aria-hidden />}
      </IconButton>
    </Tooltip>
  );
}
