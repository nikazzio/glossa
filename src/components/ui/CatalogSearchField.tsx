import type { KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { FIELD_CLASSNAME } from './fieldStyles';
import { Tooltip } from './Tooltip';

/** La ricerca dentro un catalogo o un pannello, in una riga sua. */
export function CatalogSearchField({ value, onChange, placeholder, label, onKeyDown, focusOnMount = false, disabled = false, disabledReason }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Solo quando la ricerca si apre da un comando esplicito. */
  focusOnMount?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <Tooltip label={disabled ? disabledReason : undefined} className="w-full">
    <div className="relative w-full">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-muted" aria-hidden="true" />
      <input
        type="search"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- il chiamante lo chiede solo dopo un comando esplicito
        autoFocus={focusOnMount}
        placeholder={placeholder}
        aria-label={disabled && disabledReason ? `${label} — ${disabledReason}` : label}
        className={`${FIELD_CLASSNAME} py-1.5 pl-8 text-xs`}
      />
    </div>
    </Tooltip>
  );
}
