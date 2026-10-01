import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { computeSyncState } from './transcriptionSync';

export type StudioSource = 'main' | 'sibling';

interface ViewerSyncOptions {
  activeSource: StudioSource;
  setActiveSource: Dispatch<SetStateAction<StudioSource>>;
  manualUnlinked: boolean;
  siblingPageCount: number | null;
  pageIndex: number;
  pageTotal: number | null;
}

/**
 * Visore e testo sfogliano insieme finché la copia mostrata ha la stessa
 * numerazione del testo e nessuno li ha staccati a mano. Qui si decide se lo
 * sono, e a quale pagina deve saltare il visore quando tornano a esserlo.
 */
export function useViewerSync({
  activeSource,
  setActiveSource,
  manualUnlinked,
  siblingPageCount,
  pageIndex,
  pageTotal,
}: ViewerSyncOptions) {
  const [jumpRequest, setJumpRequest] = useState<{ index: number; token: number } | null>(null);
  const { aligned, synced } = computeSyncState({
    activeSource,
    manualUnlinked,
    mainPageTotal: pageTotal,
    siblingPageCount,
  });

  // Tornando in sincronia (si rientra sulla principale, o si riallinea la
  // secondaria) il visore attivo salta dove sta il testo: senza, resterebbe
  // dov'era rimasto sfogliando da solo.
  const wasSyncedRef = useRef(synced);
  useEffect(() => {
    if (synced && !wasSyncedRef.current) {
      setJumpRequest({ index: pageIndex, token: Date.now() });
    }
    wasSyncedRef.current = synced;
  }, [synced, pageIndex]);

  /** Cambio fonte: se le due copie restano sincrone (allineate, o si torna
   *  alla principale) il visore che si monta è un altro componente — chiave
   *  diversa, stato interno nuovo — e senza una richiesta esplicita apre la
   *  sua prima pagina invece di quella che il testo sta mostrando. */
  const changeSource = (source: StudioSource) => {
    setActiveSource(source);
    const nextSynced = computeSyncState({
      activeSource: source,
      manualUnlinked,
      mainPageTotal: pageTotal,
      siblingPageCount,
    }).synced;
    if (nextSynced) setJumpRequest({ index: pageIndex, token: Date.now() });
  };

  return {
    aligned,
    synced,
    jumpRequest,
    clearJumpRequest: () => setJumpRequest(null),
    changeSource,
  };
}
