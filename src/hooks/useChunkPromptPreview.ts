import { useRef, useState } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { buildMemoryInjection } from '../services/phraseMemoryInjection';
import { buildBlobContext } from './pipeline/blobContext';
import { stripFootnoteMarkers } from '../utils/footnoteExtractor';
import { llmService } from '../services/llmService';
import type { PipelineStageConfig, PromptInfo, TranslationChunk } from '../types';

interface ChunkPromptPreviewResult {
  preview: PromptInfo | null;
  isBuilding: boolean;
  error: string | null;
  isDeeplStage: boolean;
  build: (stageId: string) => Promise<void>;
  reset: () => void;
}

/**
 * Builds the literal prompt for one pipeline stage on a specific chunk, mirroring the
 * per-stage context assembly in usePipeline's executePipelineForChunk (blob context,
 * phrase-memory injection, previous-stage chaining) but only up to the point of building
 * the message — it never calls a provider.
 */
export function useChunkPromptPreview(chunk: TranslationChunk | null): ChunkPromptPreviewResult {
  const [preview, setPreview] = useState<PromptInfo | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeeplStage, setIsDeeplStage] = useState(false);
  // Bumped on every reset()/build() so a build() that resolves after the user
  // already switched chunk/stage (or started a newer build) can detect it's
  // stale and discard its result instead of overwriting the current view.
  const requestIdRef = useRef(0);

  const reset = () => {
    requestIdRef.current += 1;
    setPreview(null);
    setError(null);
    setIsDeeplStage(false);
  };

  const build = async (stageId: string) => {
    if (!chunk) return;
    const config = usePipelineStore.getState().config;
    const stage = config.stages.find((s) => s.id === stageId);
    if (!stage) return;

    const requestId = ++requestIdRef.current;
    setPreview(null);
    setError(null);
    setIsDeeplStage(false);

    if (stage.provider === 'deepl') {
      setIsDeeplStage(true);
      return;
    }

    setIsBuilding(true);
    try {
      const enabledStages = config.stages.filter((s) => s.enabled);
      const stageIndex = enabledStages.findIndex((s) => s.id === stageId);
      const previousStage = stageIndex > 0 ? enabledStages[stageIndex - 1] : undefined;
      const previousResult = previousStage ? chunk.stageResults[previousStage.id]?.content : undefined;

      const isFormatStage = (stage.role ?? 'translation') === 'format';
      const liveChunks = useChunksStore.getState().chunks;
      const blobContext = isFormatStage
        ? undefined
        : buildBlobContext(liveChunks, chunk.id, (c) => c.sourceProcessingText || undefined);

      const effectiveConfig = {
        ...config,
        ...(!config.persona && stage.sourceLanguage ? { sourceLanguage: stage.sourceLanguage } : {}),
        ...(!config.persona && stage.targetLanguage ? { targetLanguage: stage.targetLanguage } : {}),
        ...(blobContext ? { blobContext, blobCurrentChunkId: chunk.id } : {}),
      };

      const memoryEntry = config.usePhraseMemory
        ? usePhraseMemoryStore.getState().matchesByChunk.get(chunk.id)
        : undefined;
      const memoryBlock = memoryEntry
        ? buildMemoryInjection(memoryEntry.matches.filter((m) => memoryEntry.enabledMatchIds.has(m.id))) ?? undefined
        : undefined;
      const effectiveStage: PipelineStageConfig = memoryBlock
        ? { ...stage, prompt: `${stage.prompt}\n\n${memoryBlock}` }
        : stage;

      const stageText = isFormatStage
        ? (previousResult ?? '')
        : stripFootnoteMarkers(chunk.sourceProcessingText);
      const stagePrevious = isFormatStage ? undefined : previousResult;

      const result = await llmService.previewStagePrompt(stageText, effectiveStage, effectiveConfig, stagePrevious);
      if (requestIdRef.current !== requestId) return; // stale: chunk/fase è già cambiata
      setPreview(result);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestIdRef.current === requestId) setIsBuilding(false);
    }
  };

  return { preview, isBuilding, error, isDeeplStage, build, reset };
}
