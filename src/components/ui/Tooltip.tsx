import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type TooltipSide = 'top' | 'right' | 'left';

interface TooltipProps {
  label?: string | null;
  children: ReactNode;
  className?: string;
  side?: TooltipSide;
  offset?: number;
}

const TOOLTIP_BOX =
  'pointer-events-none fixed z-[140] w-max max-w-[16rem] rounded-[14px] border border-editorial-border bg-editorial-bg/98 px-3.5 py-2.5 text-center font-display text-[14px] italic leading-tight text-editorial-ink shadow-[0_12px_28px_rgba(26,26,26,0.12)]';


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function Tooltip({
  label,
  children,
  className = '',
  side = 'top',
  offset = 14,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const computePosition = useCallback(() => {
    if (!anchorRef.current || !tooltipRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    let left = anchorRect.left + anchorRect.width / 2;
    let top = anchorRect.top - offset;
    let transform = 'translate(-50%, -100%)';

    if (side === 'right') {
      left = anchorRect.right + offset;
      top = anchorRect.top + anchorRect.height / 2;
      transform = 'translate(0, -50%)';
    } else if (side === 'left') {
      left = anchorRect.left - offset;
      top = anchorRect.top + anchorRect.height / 2;
      transform = 'translate(-100%, -50%)';
    }

    if (side === 'top') {
      left = clamp(left, margin + tooltipRect.width / 2, viewportWidth - margin - tooltipRect.width / 2);
      top = Math.max(top, margin + tooltipRect.height);
    } else if (side === 'right') {
      left = Math.min(left, viewportWidth - margin - tooltipRect.width);
      top = clamp(top, margin + tooltipRect.height / 2, viewportHeight - margin - tooltipRect.height / 2);
    } else {
      left = Math.max(left, margin + tooltipRect.width);
      top = clamp(top, margin + tooltipRect.height / 2, viewportHeight - margin - tooltipRect.height / 2);
    }

    setStyle({ left, top, transform });
  }, [side, offset]);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
  }, [open, computePosition, label]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', computePosition, true);
    window.addEventListener('resize', computePosition);
    return () => {
      window.removeEventListener('scroll', computePosition, true);
      window.removeEventListener('resize', computePosition);
    };
  }, [open, computePosition]);

  if (!label) return <>{children}</>;

  const child = isValidElement(children)
    ? (() => {
        const childElement = children as ReactElement<Record<string, unknown>>;
        const childProps = childElement.props as Record<string, ((event: unknown) => void) | undefined>;
        return cloneElement(childElement, {
          onMouseEnter: (event: unknown) => {
            setOpen(true);
            childProps.onMouseEnter?.(event);
          },
          onMouseLeave: (event: unknown) => {
            setOpen(false);
            childProps.onMouseLeave?.(event);
          },
          onFocus: (event: unknown) => {
            setOpen(true);
            childProps.onFocus?.(event);
          },
          onBlur: (event: unknown) => {
            setOpen(false);
            childProps.onBlur?.(event);
          },
        });
      })()
    : children;

  return (
    <>
      <span ref={anchorRef} className={`inline-flex ${className}`}>
        {child}
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span ref={tooltipRef} role="tooltip" className={TOOLTIP_BOX} style={style ?? undefined}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
