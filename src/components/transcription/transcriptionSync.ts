/**
 * Quando il visore e il testo restano agganciati, cambiando pagina insieme.
 *
 * Immagini e PDF della stessa opera non promettono la stessa numerazione di
 * pagina. La copia con cui il documento è nato è la principale; l'altra,
 * quando c'è, è la secondaria. Sulla principale l'aggancio c'è sempre. Sulla
 * secondaria, solo se le due dichiarano lo stesso numero di pagine — altrimenti
 * si naviga il visore e il testo separatamente, ognuno con le proprie frecce.
 * Un interruttore manuale stacca l'aggancio a prescindere, in ogni caso.
 */
export interface SyncStateInput {
  activeSource: 'main' | 'sibling';
  manualUnlinked: boolean;
  mainPageTotal: number | null;
  siblingPageCount: number | null;
}

export interface SyncState {
  /** Le due copie dichiarano lo stesso numero di pagine: `false` anche
   *  quando uno dei due conteggi non è ancora noto — mai un "forse". */
  aligned: boolean;
  synced: boolean;
}

export function computeSyncState({
  activeSource,
  manualUnlinked,
  mainPageTotal,
  siblingPageCount,
}: SyncStateInput): SyncState {
  const aligned =
    mainPageTotal !== null && siblingPageCount !== null && mainPageTotal === siblingPageCount;
  const synced = !manualUnlinked && (activeSource === 'main' || aligned);
  return { aligned, synced };
}
