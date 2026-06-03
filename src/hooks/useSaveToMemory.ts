import { useState, useCallback } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useProjectStore } from '../stores/projectStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { listPresets } from '../services/phraseMemoryPresetService';
import { saveAllCompletedPhrases } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

export function useSaveToMemory() {
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const saveToMemory = useCallback(async () => {
    const config = usePipelineStore.getState().config;
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    const currentProjectId = useProjectStore.getState().currentProjectId;
    const chunks = useChunksStore.getState().chunks;

    if (!activeWorkspace || !currentProjectId) return;

    const eligible = chunks.filter(
      (c) => (c.translationLocked || c.status === 'completed') &&
        c.sourceProcessingText?.trim() &&
        c.currentDraft?.trim(),
    );
    if (eligible.length === 0) return;

    const presets = await listPresets(activeWorkspace.id);
    const preset = presets.find((p) => p.id === config.phraseMemoryPresetId) ?? presets[0] ?? null;
    const splitter = config.phraseMemoryOverrides?.splitter ?? preset?.config.splitter ?? 'regex';
    const minPhraseLength = config.phraseMemoryOverrides?.minPhraseLength ?? preset?.config.minPhraseLength ?? 3;

    setIsSaving(true);
    setProgress({ done: 0, total: eligible.length });
    usePhraseMemoryStore.getState().setJobStatus({
      kind: 'running', processed: 0, total: eligible.length, estimatedCostUsd: 0,
    });

    try {
      await saveAllCompletedPhrases({
        workspaceId: activeWorkspace.id,
        projectId: currentProjectId,
        embeddingModel: activeWorkspace.embeddingModel,
        splitter,
        minPhraseLength,
        sourceLanguage: config.sourceLanguage,
        targetLanguage: config.targetLanguage,
        chunks: eligible.map((c) => ({
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
        kind: 'done', totalPhrases: eligible.length,
      });
    } catch (err: unknown) {
      logger.warn('saveToMemory failed', { error: String(err) });
      usePhraseMemoryStore.getState().setJobStatus({ kind: 'idle' });
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }, []);

  return { saveToMemory, isSaving, progress };
}
