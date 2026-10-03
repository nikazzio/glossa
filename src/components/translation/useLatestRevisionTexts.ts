import { useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useTranslationHistoryStore } from '../../stores/translationHistoryStore';
import { latestRevisionTexts } from '../../services/translationRevisionsService';
import { logger } from '../../utils/logger';

/**
 * Carica, per la pipeline aperta, il testo dell'ultima versione di ogni
 * frammento: il dischetto lo confronta con i fogli per sapere se c'è una
 * versione nuova da scrivere. Le versioni scritte dopo arrivano da sole.
 */
export function useLatestRevisionTexts(): void {
  const activePipelineId = useProjectStore((s) => s.activePipelineId);

  useEffect(() => {
    const { setLatestTexts } = useTranslationHistoryStore.getState();
    setLatestTexts({});
    if (!activePipelineId) return;
    let stale = false;
    latestRevisionTexts(activePipelineId)
      .then((texts) => { if (!stale) setLatestTexts(texts); })
      .catch((error: unknown) => {
        logger.warn('translation.history.latest_failed', {
          pipelineId: activePipelineId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => { stale = true; };
  }, [activePipelineId]);
}
