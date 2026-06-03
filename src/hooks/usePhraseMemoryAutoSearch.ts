import { useCallback, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { listPresets } from '../services/phraseMemoryPresetService';
import { searchPhraseMemoryBatch } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

export function usePhraseMemoryAutoSearch(): { runSearch: () => void } {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const usePhraseMemory = usePipelineStore((s) => s.config.usePhraseMemory);

  const runSearch = useCallback(() => {
    const config = usePipelineStore.getState().config;
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    const chunks = useChunksStore.getState().chunks;

    if (!config.usePhraseMemory || !activeWorkspace || chunks.length === 0) return;

    void (async () => {
      try {
        const presets = await listPresets(activeWorkspace.id);
        const preset = presets.find((p) => p.id === config.phraseMemoryPresetId) ?? presets[0] ?? null;
        const threshold = config.phraseMemoryOverrides?.similarityThreshold
          ?? preset?.config.similarityThreshold ?? 0.75;
        const maxResults = config.phraseMemoryOverrides?.maxResults
          ?? preset?.config.maxResults ?? 10;

        const toSearch = chunks
          .filter((c) => c.sourceProcessingText?.trim())
          .map((c) => ({ id: c.id, text: c.sourceProcessingText }));

        if (toSearch.length === 0) return;

        const results = await searchPhraseMemoryBatch({
          workspaceId: activeWorkspace.id,
          embeddingModel: activeWorkspace.embeddingModel,
          chunks: toSearch,
          threshold,
          maxResults,
        });

        const { setMatches } = usePhraseMemoryStore.getState();
        for (const [chunkId, matches] of results) {
          setMatches(chunkId, matches);
        }
      } catch (err: unknown) {
        logger.warn('phrase memory auto-search failed', { error: String(err) });
      }
    })();
  }, []);

  useEffect(() => {
    if (currentProjectId && usePhraseMemory) {
      runSearch();
    }
  }, [currentProjectId, usePhraseMemory, runSearch]);

  return { runSearch };
}
