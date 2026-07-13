import type { ReactNode } from 'react';
import { useState } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/** Pannello a comparsa al passaggio del mouse (hover), per dettagli che non devono
 *  occupare spazio fisso — es. ripartizione costi. Apre/chiude anche sul contenuto,
 *  cosi il mouse può spostarsi dal trigger al pannello senza chiuderlo. */
export function Popover({ trigger, children, side = 'bottom', align = 'end', className = '' }: PopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <span
          className="inline-flex"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {trigger}
        </span>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={`popover-content z-[210] rounded-xl border border-editorial-border bg-editorial-page shadow-lg ${className}`.trim()}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
