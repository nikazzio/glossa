import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip, type TooltipSide } from './Tooltip';

const iconButton = cva(
  'inline-flex items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent',
  {
    variants: {
      size: {
        xs: 'p-1',
        sm: 'p-1.5',
        md: 'p-2',
        lg: 'p-2.5',
      },
      tone: {
        default:  'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent',
        accent:   'border-editorial-accent bg-editorial-accent text-white hover:bg-editorial-accent/85',
        danger:   'border-editorial-danger/50 bg-editorial-danger/10 text-editorial-danger hover:border-editorial-danger/70 hover:bg-editorial-danger/15',
        success:  'border-editorial-success/50 bg-editorial-success/10 text-editorial-success',
        charcoal: 'border-editorial-border text-editorial-muted hover:border-editorial-charcoal/60 hover:text-editorial-charcoal',
        muted:    'border-editorial-border/60 text-editorial-muted/50 hover:border-editorial-accent/40 hover:text-editorial-accent',
        running:  'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
        warning:  'border-editorial-warning bg-editorial-warning/20 text-editorial-warning hover:bg-editorial-warning/30',
      },
      // Non tutti i pulsanti disattivati significano "azione vietata": alcuni
      // sono solo "non applicabile qui" (es. non c'è un paragrafo da spostare)
      // e vogliono un cursore/opacità meno "bloccati".
      disabledStyle: {
        blocked:  'disabled:cursor-not-allowed disabled:opacity-40',
        soft:     'disabled:cursor-not-allowed disabled:opacity-30',
        inactive: 'disabled:cursor-default disabled:opacity-20',
      },
    },
    defaultVariants: { size: 'md', tone: 'default', disabledStyle: 'blocked' },
  },
);

export type IconButtonTone = NonNullable<VariantProps<typeof iconButton>['tone']>;
export type IconButtonSize = NonNullable<VariantProps<typeof iconButton>['size']>;
export type IconButtonDisabledStyle = NonNullable<VariantProps<typeof iconButton>['disabledStyle']>;

type IconButtonProps = VariantProps<typeof iconButton> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'aria-pressed' | 'aria-label'> & {
    onClick?: () => void;
    children: ReactNode;
    title: string;
    ariaLabel?: string;
    ariaPressed?: boolean;
    tooltipSide?: TooltipSide;
  };

type IconLinkProps = VariantProps<typeof iconButton> & {
  href: string;
  children: ReactNode;
  title: string;
  ariaLabel?: string;
  className?: string;
  tooltipSide?: TooltipSide;
};

/** Stesso aspetto di `IconButton` per un indirizzo esterno: resta un
 *  collegamento vero, così vale il tasto centrale e il menu del browser. */
export function IconLink({
  href,
  children,
  title,
  ariaLabel,
  size,
  tone,
  className,
  tooltipSide,
}: IconLinkProps) {
  return (
    <Tooltip label={title} side={tooltipSide}>
      <span className="inline-flex">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel ?? title}
          className={iconButton({ size, tone, className })}
        >
          {children}
        </a>
      </span>
    </Tooltip>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  onClick,
  children,
  title,
  ariaLabel,
  disabled = false,
  ariaPressed,
  size,
  tone,
  disabledStyle,
  className,
  tooltipSide,
  ...rest
}, ref) {
  return (
    <Tooltip label={title} side={tooltipSide}>
      <span className="inline-flex">
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel ?? title}
          aria-pressed={ariaPressed}
          className={iconButton({ size, tone, disabledStyle, className })}
          {...rest}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  );
});
