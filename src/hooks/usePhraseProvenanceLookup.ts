import { useEffect, useState } from 'react';
import { getChunkPositions, getProjectNames } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

export interface PhraseProvenanceSource {
  projectId: string | null;
  chunkId: string | null;
}

export interface PhraseProvenanceLookup {
  projectNames: Record<string, string>;
  /** Posizione del frammento, da zero. */
  chunkPositions: Record<string, number>;
}

const EMPTY_LOOKUP: PhraseProvenanceLookup = { projectNames: {}, chunkPositions: {} };

/** Nomi delle traduzioni e numeri dei frammenti da cui vengono delle frasi in
 *  memoria: due letture in tutto, qualunque sia il numero delle frasi. */
export function usePhraseProvenanceLookup(sources: PhraseProvenanceSource[]): PhraseProvenanceLookup {
  const [lookup, setLookup] = useState<PhraseProvenanceLookup>(EMPTY_LOOKUP);
  const projectIds = sources.map((s) => s.projectId).filter((id): id is string => id !== null);
  const chunkIds = sources.map((s) => s.chunkId).filter((id): id is string => id !== null);
  const key = `${projectIds.join(',')}|${chunkIds.join(',')}`;

  useEffect(() => {
    let cancelled = false;
    if (projectIds.length === 0 && chunkIds.length === 0) {
      setLookup(EMPTY_LOOKUP);
      return;
    }
    Promise.all([getProjectNames(projectIds), getChunkPositions(chunkIds)])
      .then(([projectNames, chunkPositions]) => {
        if (!cancelled) setLookup({ projectNames, chunkPositions });
      })
      .catch((error: unknown) => {
        // Senza nomi la provenienza resta comunque leggibile (workspace,
        // «importata»): l'errore va nel registro, non blocca la scheda.
        logger.warn('phrase_memory.provenance_lookup_failed', { error: String(error) });
      });
    return () => { cancelled = true; };
    // `key` riassume i due elenchi: gli array cambiano riferimento a ogni disegno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return lookup;
}
