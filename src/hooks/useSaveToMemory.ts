import { useState, useCallback } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useProjectStore } from '../stores/projectStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { saveSelectedPhrases } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

export function useSaveToMemory() {
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const saveToMemory = useCallback(async (chunkIds: string[]): Promise<number> => {
    const config = usePipelineStore.getState().config;
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    const currentProjectId = useProjectStore.getState().currentProjectId;
    const chunks = useChunksStore.getState().chunks;

    if (!activeWorkspace || !currentProjectId || chunkIds.length === 0) return 0;

    const selectedIds = new Set(chunkIds);
    const selected = chunks.filter(
      (c) => selectedIds.has(c.id) && c.sourceProcessingText?.trim() && c.currentDraft?.trim(),
    );
    logger.debug('phrase_memory.save_hook.selection', {
      requestedChunkCount: chunkIds.length,
      selectedChunkCount: selected.length,
      workspaceId: activeWorkspace.id,
      projectId: currentProjectId,
    });
    if (selected.length === 0) return 0;

    setIsSaving(true);
    setProgress({ done: 0, total: selected.length });
    usePhraseMemoryStore.getState().setJobStatus({
      kind: 'running', processed: 0, total: selected.length, estimatedCostUsd: 0,
    });

    try {
      const savedPhraseCount = await saveSelectedPhrases({
        workspaceId: activeWorkspace.id,
        projectId: currentProjectId,
        embeddingModel: activeWorkspace.embeddingModel,
        extractorProvider: activeWorkspace.memoryExtractorProvider,
        extractorModel: activeWorkspace.memoryExtractorModel,
        extractorPrompt: activeWorkspace.memoryExtractorPrompt,
        sourceLanguage: config.sourceLanguage,
        targetLanguage: config.targetLanguage,
        chunks: selected.map((c) => ({
          id: c.id,
          sourceText: c.sourceProcessingText,
          targetText: c.currentDraft!,
        })),
        onProgress: (done, total) => {
          setProgress({ done, total });
          usePhraseMemoryStore.getState().setJobStatus({
            kind: 'running', processed: done, total, estimatedCostUsd: 0,
          });
        },
      });
      usePhraseMemoryStore.getState().setJobStatus({
        kind: 'done', totalPhrases: savedPhraseCount,
      });
      logger.info('phrase_memory.save_hook.done', {
        workspaceId: activeWorkspace.id,
        projectId: currentProjectId,
        selectedChunkCount: selected.length,
        savedPhraseCount,
      });
      return savedPhraseCount;
    } catch (err: unknown) {
      logger.warn('saveToMemory failed', { error: String(err) });
      usePhraseMemoryStore.getState().setJobStatus({ kind: 'idle' });
      throw err;
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }, []);

  return { saveToMemory, isSaving, progress };
}
