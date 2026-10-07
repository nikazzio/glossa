import { useEffect, useRef, useState } from 'react';
import { FIELD_CLASSNAME } from './fieldStyles';

/** Il nome scritto dove compare, in una riga di catalogo: Invio salva, Esc o
 *  un click fuori annullano. */
export function RenameField({ initial, onSave, onCancel, label, maxLength, className = '' }: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  label: string;
  maxLength?: number;
  className?: string;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.select(); }, []);
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initial) onCancel();
    else onSave(trimmed);
  };
  return (
    <input
      ref={input}
      value={name}
      maxLength={maxLength}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
      aria-label={label}
      className={`${FIELD_CLASSNAME} py-1 font-display text-base italic ${className}`}
    />
  );
}
