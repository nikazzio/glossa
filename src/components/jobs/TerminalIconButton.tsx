import type { ReactNode } from 'react';
import { Tooltip } from '../ui';

/**
 * Comando icona dentro il pannello scuro.
 *
 * `IconButton` porta con sé la palette chiara dell'interfaccia: dentro il
 * drawer stonerebbe, e il sistema di design vieta di infiltrare i token
 * `editorial-*` lì dentro. Questo è lo stesso pulsante della testata della
 * console, con i token `terminal-*`, tooltip incluso.
 */
export function TerminalIconButton({
  children,
  label,
  onClick,
  tone = 'default',
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  const hover =
    tone === 'danger'
      ? 'hover:border-terminal-error/60 hover:text-terminal-error'
      : 'hover:border-terminal-accent/60 hover:text-terminal-accent';

  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-terminal-border text-terminal-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent ${hover}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
