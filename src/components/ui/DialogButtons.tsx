import type { ButtonHTMLAttributes, ReactNode } from 'react';

type DialogButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';

/** Pulsante principale "accetta/conferma" — pieno color inchiostro. */
export function DialogConfirmButton({ children, className = '', type = 'button', ...rest }: DialogButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} bg-editorial-ink text-white hover:bg-editorial-ink/90 ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pulsante secondario "annulla/chiudi" — bordo sobrio. */
export function DialogCancelButton({ children, className = '', type = 'button', ...rest }: DialogButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} border border-editorial-border text-editorial-muted hover:border-editorial-ink/40 hover:bg-editorial-textbox/50 hover:text-editorial-ink ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
