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
 * preme di nuovo o si sposta il fuoco, così il comando mantiene la promessa.
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
  const [open, setOpen] = useState(false);
  return (
    <Tooltip label={label} side={side} open={open} onOpenChange={setOpen}>
      <IconButton
        title=""
        ariaLabel={label}
        ariaPressed={open}
        size={size}
        tone={children ? 'default' : undefined}
        className={children ? 'rounded border-none px-1 py-0' : undefined}
        onClick={() => setOpen(!open)}
      >
        {children ?? <Info size={13} aria-hidden />}
      </IconButton>
    </Tooltip>
  );
}
