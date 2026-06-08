import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip, type TooltipSide } from './Tooltip';

const iconButton = cva(
  'inline-flex items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      size: {
        sm: 'p-1.5',
        md: 'p-2',
        lg: 'p-2.5',
      },
      tone: {
        default:  'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent',
        accent:   'border-editorial-accent bg-editorial-accent text-white',
        success:  'border-editorial-success/50 bg-editorial-success/10 text-editorial-success',
        charcoal: 'border-editorial-border text-editorial-muted hover:border-editorial-charcoal/60 hover:text-editorial-charcoal',
        muted:    'border-editorial-border/60 text-editorial-muted/50 hover:border-editorial-accent/40 hover:text-editorial-accent',
        running:  'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
      },
    },
    defaultVariants: { size: 'md', tone: 'default' },
  },
);

export type IconButtonTone = NonNullable<VariantProps<typeof iconButton>['tone']>;
export type IconButtonSize = NonNullable<VariantProps<typeof iconButton>['size']>;

type IconButtonProps = VariantProps<typeof iconButton> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'aria-pressed' | 'aria-label'> & {
    onClick?: () => void;
    children: ReactNode;
    title: string;
    ariaLabel?: string;
    ariaPressed?: boolean;
    tooltipSide?: TooltipSide;
  };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  onClick,
  children,
  title,
  ariaLabel,
  disabled = false,
  ariaPressed,
  size,
  tone,
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
          className={iconButton({ size, tone, className })}
          {...rest}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  );
});
