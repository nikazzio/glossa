import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { IconButton } from '../ui';

/**
 * Il dischetto della traduzione, nella testata del foglio. Lo stato (salvato,
 * da salvare, errore) lo dice la barra di stato; qui resta il comando, che in
 * caso di errore diventa rosso e riprova.
 */
export function ProjectSaveButton() {
  const { t } = useTranslation();
  const { saveState, lastSaveError, saveCurrentProject } = useProjectStore(
    useShallow((s) => ({
      saveState: s.saveState,
      lastSaveError: s.lastSaveError,
      saveCurrentProject: s.saveCurrentProject,
    })),
  );
  const isProcessing = useChunksStore((s) => s.isProcessing);

  const hasUnsaved = saveState === 'dirty' || saveState === 'error';
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
      onClick={() => { saveCurrentProject().catch(() => undefined); }}
      disabled={!canSave}
      title={label}
    >
      <Save size={13} />
    </IconButton>
  );
}
