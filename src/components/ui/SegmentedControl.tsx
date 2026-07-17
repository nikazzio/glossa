import type { ReactNode } from 'react';

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
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-2">
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md border py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
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
