import type { ReactNode } from 'react';

type PillVariant = 'primary' | 'secondary' | 'accent' | 'ghost';

interface PillButtonProps {
  onClick?: () => void;
  children: ReactNode;
  variant?: PillVariant;
  disabled?: boolean;
  type?: 'button' | 'submit';
  autoFocus?: boolean;
  className?: string;
}

const VARIANT_CLASS: Record<PillVariant, string> = {
  primary:   'border-transparent bg-editorial-ink text-white hover:bg-editorial-ink/90',
  secondary: 'border-editorial-border text-editorial-muted hover:border-editorial-ink/40 hover:text-editorial-ink',
  accent:    'border-editorial-accent bg-editorial-accent text-white hover:bg-editorial-accent/90',
  ghost:     'border-transparent text-editorial-muted hover:text-editorial-ink',
};

const BASE = 'rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';

export function PillButton({
  onClick,
  children,
  variant = 'secondary',
  disabled = false,
  type = 'button',
  autoFocus,
  className = '',
}: PillButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`${BASE} ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
