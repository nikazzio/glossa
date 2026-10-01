import { useState, type DragEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Gli identificativi trascinati, se il dato è davvero un elenco di stringhe. */
function draggedIds(event: DragEvent, type: string): string[] {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(type));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface ShelfItemProps {
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
  /** Un comando accanto alla voce (eliminare una raccolta). */
  action?: ReactNode;
  /** La voce accetta righe trascinate di questo tipo di dato. */
  dropType?: string;
  onDropIds?: (ids: string[]) => void;
}

/** Una voce della colonna degli scaffali: segno, nome, quante voci. La scelta
 *  è in verde tenue. */
export function ShelfItem({ icon: Icon, label, count, active, onSelect, action, dropType, onDropIds }: ShelfItemProps) {
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) =>
    dropType !== undefined && onDropIds !== undefined && event.dataTransfer.types.includes(dropType);
  return (
    <li
      className={`group/shelf flex items-center gap-1 rounded ${over ? 'ring-2 ring-editorial-accent' : ''}`}
      onDragOver={(event) => { if (!accepts(event)) return; event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!accepts(event) || dropType === undefined) return;
        event.preventDefault();
        const ids = draggedIds(event, dropType);
        if (ids.length > 0) onDropIds?.(ids);
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          active ? 'bg-editorial-accent/10 text-editorial-accent' : 'text-editorial-ink hover:bg-surface-hover/50'
        }`}
      >
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-editorial-muted">{count}</span>}
      </button>
      {action}
    </li>
  );
}
