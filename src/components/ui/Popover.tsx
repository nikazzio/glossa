import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

// Piccolo margine prima di chiudere: senza, il minimo spazio fra trigger e
// pannello (sideOffset) fa perdere il hover a metà strada e il pannello
// sparisce prima che il mouse arrivi sopra i controlli (es. le frecce).
const CLOSE_DELAY_MS = 250;

/** Pannello a comparsa al passaggio del mouse (hover), per dettagli che non devono
 *  occupare spazio fisso — es. ripartizione costi. Apre/chiude anche sul contenuto,
 *  cosi il mouse può spostarsi dal trigger al pannello senza chiuderlo. */
export function Popover({ trigger, children, side = 'bottom', align = 'end', className = '' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openNow = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);

  useEffect(() => clearCloseTimer, []);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <span className="inline-flex" onMouseEnter={openNow} onMouseLeave={scheduleClose}>
          {trigger}
        </span>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          className={`popover-content z-[210] rounded-xl border border-editorial-border bg-editorial-page shadow-lg ${className}`.trim()}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
