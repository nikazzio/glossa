import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { useProjectStore } from '../../stores/projectStore';
import { logger } from '../../utils/logger';

/**
 * Dischetto e Ctrl/⌘+S: salva e scrive le versioni nello storico. Un errore
 * del salvataggio lo mostra già la barra di stato (e il dischetto rosso);
 * resta da dire solo quello delle versioni, che altrimenti non si vedrebbe.
 */
export function saveVersionWithFeedback(t: TFunction): void {
  useProjectStore.getState().saveVersionNow().catch((error: unknown) => {
    logger.warn('translation.version.save_failed', { error: error instanceof Error ? error.message : String(error) });
    if (useProjectStore.getState().saveState === 'error') return;
    toast.error(t('document.versionSaveFailed'));
  });
}
