import type { KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Per i casi in cui la scelta vive dentro una modifica da confermare o
   *  annullare (Invio ed Esc), come nei campi scritti. */
  onKeyDown?: (event: KeyboardEvent<HTMLSelectElement>) => void;
}

/** Select editoriale condiviso: stesso trattamento visivo su tutta l'app, etichetta sempre esplicita. */
export function Select({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  className = '',
  onKeyDown,
}: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
