import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { unversionedChunks, useTranslationHistoryStore } from '../../stores/translationHistoryStore';
import { IconButton } from '../ui';
import { saveVersionWithFeedback } from './manualSave';

/**
 * Il dischetto della traduzione, nella testata del foglio. Lo stato (salvato,
 * da salvare, errore) lo dice la barra di stato; qui resta il comando, che
 * salva e scrive una versione nello storico per i frammenti cambiati, e in
 * caso di errore diventa rosso e riprova.
 */
export function ProjectSaveButton() {
  const { t } = useTranslation();
  const { saveState, lastSaveError } = useProjectStore(
    useShallow((s) => ({ saveState: s.saveState, lastSaveError: s.lastSaveError })),
  );
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const chunks = useChunksStore((s) => s.chunks);
  const latestText = useTranslationHistoryStore((s) => s.latestText);

  const hasUnsaved = saveState === 'dirty' || saveState === 'error'
    || unversionedChunks(chunks, latestText).length > 0;
  const canSave = hasUnsaved && !isProcessing;
  const saveNow = t('document.saveNow');
  const label = isProcessing && hasUnsaved
    ? t('transcription.commandBlocked', { command: saveNow, reason: t('document.reasonRunning') })
    : saveState === 'error'
      ? lastSaveError
        ? t('transcription.commandBlocked', { command: t('transcription.saveRetry'), reason: lastSaveError })
        : t('transcription.saveRetry')
      : canSave
        ? `${saveNow} (Ctrl+S)`
        : t('transcription.saveNowNothing');

  return (
    <IconButton
      size="sm"
      tone={saveState === 'error' ? 'danger' : 'default'}
      onClick={() => saveVersionWithFeedback(t)}
      disabled={!canSave}
      title={label}
    >
      <Save size={13} />
    </IconButton>
  );
}
