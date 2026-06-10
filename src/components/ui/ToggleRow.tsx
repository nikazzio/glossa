import type { ReactNode } from 'react';

interface ToggleRowProps {
  icon: ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

export function ToggleRow({ icon, label, checked, disabled = false, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
        <span className="text-editorial-accent">{icon}</span>
        <span>{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-editorial-accent' : 'bg-editorial-border'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}
