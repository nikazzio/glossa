import type { KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Intestazione del gruppo a cui la voce appartiene. Le voci con lo stesso
   *  gruppo devono stare vicine: l'ordine dell'elenco è quello che si vede. */
  group?: string;
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /**
   * `sm` (predefinita) per barre e righe compatte; `md` dentro le liste di
   * impostazioni, dove un valore più piccolo dell'etichetta accanto si legge
   * come una nota a margine invece che come la scelta fatta.
   */
  size?: 'sm' | 'md';
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
  size = 'sm',
  onKeyDown,
}: SelectProps) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 ${text} font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {groupOptions(options).map(({ group, items }) => {
        const rendered = items.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ));
        return group ? (
          <optgroup key={group} label={group}>
            {rendered}
          </optgroup>
        ) : (
          rendered
        );
      })}
    </select>
  );
}

/** Raccoglie le voci consecutive con lo stesso gruppo. Non riordina: un elenco
 *  che si riordina da sé nasconde l'ordine scelto da chi lo ha costruito. */
function groupOptions(options: SelectOption[]): { group?: string; items: SelectOption[] }[] {
  const groups: { group?: string; items: SelectOption[] }[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === option.group) last.items.push(option);
    else groups.push({ group: option.group, items: [option] });
  }
  return groups;
}
