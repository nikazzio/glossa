import { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemorySearchStatus } from '../stores/phraseMemoryStore';
import { searchPhraseMemory, searchPhraseMemoryBatch } from '../services/phraseMemoryService';
import { logger } from '../utils/logger';

type UsePhraseMemoryAutoSearchOptions = {
  auto?: boolean;
};

const DEFAULT_THRESHOLD = 0.75;
const DEFAULT_MAX_RESULTS = 10;

export function usePhraseMemoryAutoSearch(
  options: UsePhraseMemoryAutoSearchOptions = {},
): {
  runSearch: () => void;
  runSearchForChunk: (chunkId: string) => Promise<void>;
  status: PhraseMemorySearchStatus;
} {
  const auto = options.auto ?? true;
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const usePhraseMemory = usePipelineStore((s) => s.config.usePhraseMemory);
  const autoSearchPhraseMemory = usePipelineStore((s) => s.config.autoSearchPhraseMemory !== false);
  const phraseMemorySearchKey = usePipelineStore((s) =>
    JSON.stringify({
      threshold: s.config.phraseMemorySimilarityThreshold ?? DEFAULT_THRESHOLD,
      maxResults: s.config.phraseMemoryMaxResults ?? DEFAULT_MAX_RESULTS,
    }),
  );
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
        const results = await searchPhraseMemoryBatch({
          workspaceId: activeWorkspace.id,
          embeddingModel: activeWorkspace.embeddingModel,
          chunks: toSearch,
          threshold: config.phraseMemorySimilarityThreshold ?? DEFAULT_THRESHOLD,
          maxResults: config.phraseMemoryMaxResults ?? DEFAULT_MAX_RESULTS,
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

  const runSearchForChunk = useCallback(async (chunkId: string) => {
    const config = usePipelineStore.getState().config;
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    const chunk = useChunksStore.getState().chunks.find((entry) => entry.id === chunkId);
    const { setMatches, setSearchStatus } = usePhraseMemoryStore.getState();

    if (!config.usePhraseMemory || !activeWorkspace || !chunk?.sourceProcessingText.trim()) {
      setSearchStatus('idle');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSearchStatus('searching');

    try {
      const matches = await searchPhraseMemory({
        workspaceId: activeWorkspace.id,
        embeddingModel: activeWorkspace.embeddingModel,
        queryText: chunk.sourceProcessingText,
        threshold: config.phraseMemorySimilarityThreshold ?? DEFAULT_THRESHOLD,
        maxResults: config.phraseMemoryMaxResults ?? DEFAULT_MAX_RESULTS,
      });
      if (requestIdRef.current !== requestId) return;
      setMatches(chunkId, matches);
      setSearchStatus('done');
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) return;
      logger.warn('phrase memory manual search failed', { chunkId, error: String(err) });
      setSearchStatus('error');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    if (currentProjectId && usePhraseMemory && autoSearchPhraseMemory) {
      runSearch();
    } else {
      requestIdRef.current += 1;
      usePhraseMemoryStore.getState().setSearchStatus('idle');
    }
  }, [
    activeWorkspaceId,
    auto,
    autoSearchPhraseMemory,
    chunksSearchKey,
    currentProjectId,
    phraseMemorySearchKey,
    runSearch,
    usePhraseMemory,
  ]);

  return { runSearch, runSearchForChunk, status };
}
