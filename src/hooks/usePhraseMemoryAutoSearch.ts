import { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemorySearchStatus } from '../stores/phraseMemoryStore';
import { listPresets } from '../services/phraseMemoryPresetService';
import { searchPhraseMemoryBatch } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

export function usePhraseMemoryAutoSearch(): { runSearch: () => void; status: PhraseMemorySearchStatus } {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const usePhraseMemory = usePipelineStore((s) => s.config.usePhraseMemory);
  const phraseMemoryPresetId = usePipelineStore((s) => s.config.phraseMemoryPresetId ?? '');
  const phraseMemoryOverridesKey = usePipelineStore((s) => JSON.stringify(s.config.phraseMemoryOverrides ?? {}));
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const chunksSearchKey = useChunksStore((s) =>
    s.chunks.map((c) => `${c.id}:${c.sourceProcessingText ?? ''}`).join('\u001f'),
  );
  const status = usePhraseMemoryStore((s) => s.searchStatus);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const config = usePipelineStore.getState().config;
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    const chunks = useChunksStore.getState().chunks;
    const { setSearchStatus } = usePhraseMemoryStore.getState();

    if (!config.usePhraseMemory || !activeWorkspace || chunks.length === 0) {
      setSearchStatus('idle');
      return;
    }

    const toSearch = chunks
      .filter((c) => c.sourceProcessingText?.trim())
      .map((c) => ({ id: c.id, text: c.sourceProcessingText }));

    if (toSearch.length === 0) {
      setSearchStatus('idle');
      return;
    }

    setSearchStatus('searching');

    void (async () => {
      try {
        const presets = await listPresets(activeWorkspace.id);
        const preset = presets.find((p) => p.id === config.phraseMemoryPresetId) ?? presets[0] ?? null;
        const threshold = config.phraseMemoryOverrides?.similarityThreshold
          ?? preset?.config.similarityThreshold ?? 0.75;
        const maxResults = config.phraseMemoryOverrides?.maxResults
          ?? preset?.config.maxResults ?? 10;

        const results = await searchPhraseMemoryBatch({
          workspaceId: activeWorkspace.id,
          embeddingModel: activeWorkspace.embeddingModel,
          chunks: toSearch,
          threshold,
          maxResults,
        });
        if (requestIdRef.current !== requestId) return;

        const { setMatches, setSearchStatus: setLatestSearchStatus } = usePhraseMemoryStore.getState();
        for (const [chunkId, matches] of results) {
          setMatches(chunkId, matches);
        }
        setLatestSearchStatus('done');
      } catch (err: unknown) {
        if (requestIdRef.current !== requestId) return;
        logger.warn('phrase memory auto-search failed', { error: String(err) });
        usePhraseMemoryStore.getState().setSearchStatus('error');
      }
    })();
  }, []);

  useEffect(() => {
    if (currentProjectId && usePhraseMemory) {
      runSearch();
    } else {
      requestIdRef.current += 1;
      usePhraseMemoryStore.getState().setSearchStatus('idle');
    }
  }, [
    activeWorkspaceId,
    chunksSearchKey,
    currentProjectId,
    phraseMemoryOverridesKey,
    phraseMemoryPresetId,
    runSearch,
    usePhraseMemory,
  ]);

  return { runSearch, status };
}
