import type { ReactNode } from 'react';

interface IconButtonProps {
  onClick?: () => void;
  children: ReactNode;
  title: string;
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
  ariaPressed?: boolean;
  size?: 'sm' | 'md';
  variant?: 'default' | 'charcoal';
  className?: string;
}

const SIZE_CLASS = { sm: 'p-1.5', md: 'p-2' } as const;

const BASE = 'rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';

export function IconButton({
  onClick,
  children,
  title,
  ariaLabel,
  active = false,
  disabled = false,
  ariaPressed,
  size = 'md',
  variant = 'default',
  className = '',
}: IconButtonProps) {
  let stateClass: string;
  if (active && variant === 'charcoal') {
    stateClass = 'border-transparent bg-editorial-charcoal text-white';
  } else if (active) {
    stateClass = 'border-transparent bg-editorial-ink text-white';
  } else if (variant === 'charcoal') {
    stateClass = 'border-editorial-border text-editorial-muted hover:border-editorial-charcoal/60 hover:text-editorial-charcoal';
  } else {
    stateClass = 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={ariaPressed}
      className={`${BASE} ${SIZE_CLASS[size]} ${stateClass} ${className}`}
    >
      {children}
    </button>
  );
}
