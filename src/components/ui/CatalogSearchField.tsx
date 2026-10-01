import { Search } from 'lucide-react';
import { FIELD_CLASSNAME } from './fieldStyles';

/** La ricerca dentro un catalogo, in una riga sua sopra i filtri rapidi. */
export function CatalogSearchField({ value, onChange, placeholder, label }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-muted" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${FIELD_CLASSNAME} py-1.5 pl-8 text-xs`}
      />
    </div>
  );
}
