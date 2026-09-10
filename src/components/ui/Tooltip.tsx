import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export type TooltipSide = 'top' | 'right' | 'left' | 'bottom';

interface TooltipProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  side?: TooltipSide;
  offset?: number;
  /**
   * `note` è la spiegazione breve di un comando: corsivo, centrata, in
   * carattere editoriale. `panel` è per i dati tecnici — allineati a sinistra,
   * in carattere di sistema — dove il corsivo si leggerebbe male e il centrato
   * spezzerebbe le colonne.
   */
  variant?: 'note' | 'panel';
}

const TOOLTIP_BASE =
  'pointer-events-none z-[210] w-max rounded-[14px] border border-editorial-border bg-editorial-bg/98 shadow-[var(--shadow-tooltip)]';

const TOOLTIP_VARIANT = {
  note: 'max-w-[16rem] whitespace-pre-line px-3.5 py-2.5 text-center font-display text-[14px] italic leading-tight text-editorial-ink',
  panel: 'max-w-[22rem] px-3.5 py-3 text-left font-sans text-xs leading-snug text-editorial-ink',
} as const;

export function Tooltip({
  label,
  children,
  className = '',
  side = 'top',
  offset = 14,
  variant = 'note',
}: TooltipProps) {
  if (label === null || label === undefined || label === '') return <>{children}</>;
  const box = `${TOOLTIP_BASE} ${TOOLTIP_VARIANT[variant]}`;

  return (
    <RadixTooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          <span className={`inline-flex ${className}`.trim()}>{children}</span>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} sideOffset={offset} collisionPadding={12} className={box}>
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
