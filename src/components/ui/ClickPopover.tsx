import type { ReactNode } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';

interface ClickPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/** Pannello a comparsa al click, ancorato a un trigger reale (di norma un
 *  `IconButton`) — per scegliere fra poche opzioni senza aprire una finestra
 *  modale intera (es. cambio pipeline, modalità di visualizzazione). Il
 *  chiamante gestisce lo stato `open` e passa un `IconButton` con
 *  `ariaPressed={open}` come trigger. */
export function ClickPopover({ open, onOpenChange, trigger, children, side = 'bottom', align = 'end', className = '' }: ClickPopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={`z-[210] min-w-40 overflow-hidden rounded-xl border border-editorial-border bg-editorial-page shadow-lg ${className}`.trim()}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
