import { useState, type ReactNode } from 'react';
import { ClickPopover, IconButton, PopoverItem } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

/**
 * Un comando icona che apre un elenco da cui sceglierne uno: il workspace a cui
 * collegare, la raccolta in cui mettere. Con `create`, in fondo all'elenco c'è
 * il campo per aggiungerne uno nuovo e sceglierlo subito.
 */
export function ListPicker({ icon, title, items, onPick, create, size = 'xs' }: {
  icon: ReactNode;
  title: string;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  create?: { placeholder: string; onCreate: (name: string) => void };
  size?: 'xs' | 'sm';
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (items.length === 0 && !create) return null;

  const createNew = () => {
    if (!create || !name.trim()) return;
    create.onCreate(name.trim());
    setName('');
    setOpen(false);
  };

  return (
    <ClickPopover
      open={open}
      onOpenChange={setOpen}
      trigger={<IconButton size={size} title={title} ariaPressed={open}>{icon}</IconButton>}
    >
      <ul className="flex min-w-44 flex-col py-1">
        {items.map((item) => (
          <li key={item.id} className="flex">
            <PopoverItem label={item.label} onSelect={() => { setOpen(false); onPick(item.id); }} />
          </li>
        ))}
        {create && (
          <li className="px-2 pb-1 pt-1.5">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') createNew(); }}
              placeholder={create.placeholder}
              aria-label={create.placeholder}
              className={`${FIELD_CLASSNAME} py-1 text-xs`}
            />
          </li>
        )}
      </ul>
    </ClickPopover>
  );
}
