import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MenuItem[];
  anchorRect: { x: number; y: number } | null;
}

export function Menu({ open, onOpenChange, items, anchorRect }: MenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      {/* Trigger virtuale a coordinate fisse: 0x0, invisibile, posizionato al click. */}
      <DropdownMenu.Trigger
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'fixed',
          left: anchorRect?.x ?? 0,
          top: anchorRect?.y ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-[210] min-w-[200px] overflow-hidden rounded-xl border border-editorial-border bg-editorial-page py-1.5 shadow-[var(--shadow-warm-md)]"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-editorial-ink outline-none transition-colors data-[highlighted]:bg-editorial-textbox/60 data-[highlighted]:text-editorial-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            >
              {item.icon ? <span className="shrink-0 text-editorial-accent">{item.icon}</span> : null}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
