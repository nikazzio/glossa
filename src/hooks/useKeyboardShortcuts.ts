import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../stores/projectStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useChunksStore } from '../stores/chunksStore';
import { useUiStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';

function isInputActive(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.getAttribute('contenteditable') === 'true'
  );
}

interface Options {
  onRunPipeline: () => void;
  onRunSingleChunk: (chunkId: string) => void;
}

export function useKeyboardShortcuts({ onRunPipeline, onRunSingleChunk }: Options) {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // Ctrl+Enter: fires even inside text inputs
      if (e.key === 'Enter') {
        e.preventDefault();
        const workMode = useConfigStore.getState().workMode;
        if (workMode === 'chunk') {
          const selectedChunkId = useUiStore.getState().selectedChunkId;
          if (selectedChunkId) onRunSingleChunk(selectedChunkId);
        } else {
          onRunPipeline();
        }
        return;
      }

      if (isInputActive()) return;

      switch (e.key) {
        case 's':
        case 'S': {
          e.preventDefault();
          const { currentProjectId, saveCurrentProject } = useProjectStore.getState();
          const { dirtyIds, saveAllDirty } = useLibraryStore.getState();
          const isProcessing = useChunksStore.getState().isProcessing;

          const shouldSaveProject = Boolean(currentProjectId) && !isProcessing;
          const shouldSaveLibrary = dirtyIds.length > 0;
          const projectDeferred = Boolean(currentProjectId) && isProcessing;

          if (!shouldSaveProject && !shouldSaveLibrary) {
            toast[projectDeferred ? 'warning' : 'success'](
              t(projectDeferred ? 'header.projectSaveDeferred' : 'header.nothingToSave'),
            );
            return;
          }

          const saves: Promise<void>[] = [];
          if (shouldSaveProject) saves.push(saveCurrentProject());
          if (shouldSaveLibrary) saves.push(saveAllDirty());

          Promise.all(saves)
            .then(() =>
              toast[projectDeferred ? 'warning' : 'success'](
                t(projectDeferred ? 'header.savedLibraryProjectDeferred' : 'header.savedAll'),
              ),
            )
            .catch((err: unknown) =>
              toast.error(t('header.globalSaveFailed'), {
                description: err instanceof Error ? err.message : String(err),
              }),
            );
          break;
        }

        case 'e':
        case 'E': {
          e.preventDefault();
          const chunks = useChunksStore.getState().chunks;
          if (chunks.length > 0) {
            useUiStore.getState().setShowExportDialog(true);
          }
          break;
        }

        case ',': {
          e.preventDefault();
          useUiStore.getState().setShowConfigDrawer(true);
          break;
        }

        case 'h':
        case 'H': {
          e.preventDefault();
          useUiStore.getState().setShowHelp(true, 'shortcuts');
          break;
        }

        default: {
          if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const idx = parseInt(e.key, 10) - 1;
            const chunk = useChunksStore.getState().chunks[idx];
            if (chunk) {
              useUiStore.getState().setSelectedChunkId(chunk.id);
            }
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onRunPipeline, onRunSingleChunk, t]);
}
