import { useState, useCallback } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useProjectStore } from '../stores/projectStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { logOperation } from '../stores/operationLogStore';
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
    const requested = chunks.filter((c) => selectedIds.has(c.id));
    const selected = requested.filter(
      (c) => c.sourceProcessingText?.trim() && c.currentDraft?.trim(),
    );

    for (const chunk of requested) {
      const hasSource = !!chunk.sourceProcessingText?.trim();
      const hasDraft = !!chunk.currentDraft?.trim();
      if (!hasSource || !hasDraft) {
        logOperation({
          level: 'warn',
          scope: 'memory',
          chunkId: chunk.id,
          message: 'Save to memory skipped for this chunk because source or translation text is missing',
          meta: {
            workspaceId: activeWorkspace.id,
            projectId: currentProjectId,
            hasSource,
            hasDraft,
          },
        });
      }
    }

    logger.debug('phrase_memory.save_hook.selection', {
      requestedChunkCount: chunkIds.length,
      requestedChunkIds: requested.map((c) => c.id),
      selectedChunkCount: selected.length,
      workspaceId: activeWorkspace.id,
      projectId: currentProjectId,
    });
    if (selected.length === 0) {
      logOperation({
        level: 'warn',
        scope: 'memory',
        chunkId: requested.length === 1 ? requested[0].id : undefined,
        message: 'Save to memory skipped because no selected chunk had both source and translation text',
        meta: {
          requestedChunkCount: chunkIds.length,
          requestedChunkIds: requested.map((c) => c.id),
          selectedChunkCount: 0,
          workspaceId: activeWorkspace.id,
          projectId: currentProjectId,
        },
      });
      return 0;
    }

    const jobChunkId = selected.length === 1 ? selected[0].id : null;
    setIsSaving(true);
    setProgress({ done: 0, total: selected.length });
    usePhraseMemoryStore.getState().setJobStatus({
      kind: 'running', chunkId: jobChunkId, processed: 0, total: selected.length, estimatedCostUsd: 0,
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
            kind: 'running', chunkId: jobChunkId, processed: done, total, estimatedCostUsd: 0,
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
    logOperation({
      level: savedPhraseCount > 0 ? 'success' : 'warn',
      scope: 'memory',
      phase: 'end',
      chunkId: selected.length === 1 ? selected[0].id : undefined,
      message: savedPhraseCount > 0
        ? 'Save to memory completed'
        : 'Save to memory completed without saved phrases',
      meta: {
        workspaceId: activeWorkspace.id,
        projectId: currentProjectId,
        selectedChunkCount: selected.length,
        savedPhraseCount,
        chunkIds: selected.map((c) => c.id),
      },
    });
      return savedPhraseCount;
    } catch (err: unknown) {
      logger.warn('saveToMemory failed', { error: String(err) });
      logOperation({
        level: 'error',
        scope: 'memory',
        phase: 'end',
        chunkId: selected.length === 1 ? selected[0].id : undefined,
        message: 'Save to memory failed',
        meta: {
          workspaceId: activeWorkspace.id,
          projectId: currentProjectId,
          selectedChunkCount: selected.length,
          error: String(err),
        },
        detail: String(err),
        detailKind: 'error',
      });
      usePhraseMemoryStore.getState().setJobStatus({ kind: 'idle' });
      throw err;
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }, []);

  return { saveToMemory, isSaving, progress };
}
