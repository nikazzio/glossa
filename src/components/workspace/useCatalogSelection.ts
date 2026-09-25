import { useCallback, useState } from 'react';
import type { RowPick } from './LibraryCatalogRow';

/**
 * Le opere scelte nel catalogo, come in un gestore di file: un click con Ctrl
 * aggiunge o toglie, con Maiuscolo sceglie tutto l'intervallo dall'ultima
 * scelta, nell'ordine in cui le righe si vedono.
 */
export function useCatalogSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const pick = (id: string, mode: RowPick) => {
    const from = anchor === null ? -1 : visibleIds.indexOf(anchor);
    const to = visibleIds.indexOf(id);
    if (mode === 'range' && from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from];
      setSelected(new Set([...selected, ...visibleIds.slice(start, end + 1)]));
      return;
    }
    setAnchor(id);
    if (mode === 'only') {
      setSelected(new Set([id]));
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  return { selected, pick, clear };
}
