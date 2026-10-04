import { useRef, useState } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { buildMemoryInjection } from '../services/phraseMemoryInjection';
import { buildBlobContext } from './pipeline/blobContext';
import { stripFootnoteMarkers } from '../utils/footnoteExtractor';
import { llmService } from '../services/llmService';
import { deeplService } from '../services/deeplService';
import { getDeeplOptions } from '../pipeline/deeplConfig';
import type { PipelineConfig, PipelineStageConfig, PromptInfo, TranslationChunk } from '../types';

/** Selector values for the two review checks, next to the stage ids. */
export const AUDIT_PREVIEW_ID = 'preview-audit';
export const COHERENCE_PREVIEW_ID = 'preview-coherence';

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
    setIsBuilding(false);
    setError(null);
    setIsDeeplStage(false);
  };

  const build = async (stageId: string) => {
    if (!chunk) return;
    const config = usePipelineStore.getState().config;
    const isReview = stageId === AUDIT_PREVIEW_ID || stageId === COHERENCE_PREVIEW_ID;
    const stage = config.stages.find((s) => s.id === stageId);
    if (!stage && !isReview) return;

    const requestId = ++requestIdRef.current;
    setPreview(null);
    setError(null);
    setIsDeeplStage(false);

    setIsBuilding(true);
    try {
      if (isReview) {
        const result = await buildReviewPreview(stageId, chunk, config);
        if (requestIdRef.current !== requestId) return;
        setPreview(result);
        return;
      }
      if (!stage) return;
      if (stage.provider === 'deepl') {
        const body = await deeplService.previewDeeplStage({
          text: stripFootnoteMarkers(chunk.sourceProcessingText),
          deeplConfig: getDeeplOptions(stage),
        });
        if (requestIdRef.current !== requestId) return;
        setIsDeeplStage(true);
        setPreview({ systemPrompt: '', userPrompt: body });
        return;
      }
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
        ...(blobContext ? { blobContext, blobCurrentChunkId: chunk.id } : {}),
      };

      // Come in esecuzione: la memoria va a traduzione e Refine, non a Format.
      const memoryEntry = config.usePhraseMemory && !isFormatStage
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

/**
 * Same inputs as the real checks: the audit judges the current translation of
 * the chunk (as the manual audit does), coherence also sees the neighbouring
 * translated chunks as reference block.
 */
async function buildReviewPreview(
  previewId: string,
  chunk: TranslationChunk,
  config: PipelineConfig,
): Promise<PromptInfo> {
  const original = stripFootnoteMarkers(chunk.sourceProcessingText);
  const translation = chunk.translationProcessingText;
  if (previewId === AUDIT_PREVIEW_ID) {
    return llmService.previewJudgePrompt(original, translation, config);
  }
  const blobContext = buildBlobContext(
    useChunksStore.getState().chunks,
    chunk.id,
    (c) => c.translationProcessingText?.trim() ? c.translationProcessingText : undefined,
  );
  return llmService.previewCoherencePrompt({ original, translation, blobContext, currentChunkId: chunk.id }, config);
}
