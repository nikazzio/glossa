import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  const activate = (next: T) => {
    onChange(next);
    buttonRefs.current[next]?.focus();
  };

  const handleKeyDown = (currentValue: T, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = options.findIndex((opt) => opt.value === currentValue);
    let next: T | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = options[(idx - 1 + options.length) % options.length].value;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = options[(idx + 1) % options.length].value;
    else if (event.key === 'Home') next = options[0].value;
    else if (event.key === 'End') next = options[options.length - 1].value;
    if (next) { event.preventDefault(); activate(next); }
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current[opt.value] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(opt.value, e)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md border py-2.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
              isActive
                ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
                : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
