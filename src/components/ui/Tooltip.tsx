import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export type TooltipSide = 'top' | 'right' | 'left' | 'bottom';

interface TooltipProps {
  label?: string | null;
  children: ReactNode;
  className?: string;
  side?: TooltipSide;
  offset?: number;
}

const TOOLTIP_BOX =
  'pointer-events-none z-[210] w-max max-w-[16rem] whitespace-pre-line rounded-[14px] border border-editorial-border bg-editorial-bg/98 px-3.5 py-2.5 text-center font-display text-[14px] italic leading-tight text-editorial-ink shadow-[var(--shadow-tooltip)]';

export function Tooltip({
  label,
  children,
  className = '',
  side = 'top',
  offset = 14,
}: TooltipProps) {
  if (!label) return <>{children}</>;

  return (
    <RadixTooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          <span className={`inline-flex ${className}`.trim()}>{children}</span>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} sideOffset={offset} collisionPadding={12} className={TOOLTIP_BOX}>
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
