import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChunksStore } from '../stores/chunksStore';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';
import {
  ensureProvidersReady,
  runPipeline as engineRunPipeline,
  runChunkExecution,
  cancelPipeline as engineCancelPipeline,
  rerunChunkWithMemory as engineRerunChunkWithMemory,
  type ProviderCheck,
} from './pipeline/engine';
import { usePipelineAudit } from './usePipelineAudit';

/**
 * Thin React wiring around the framework-agnostic pipeline engine
 * (see ./pipeline/engine.ts): supplies the translation function the engine
 * needs for toast messages, and exposes `isProcessing` for rendering.
 *
 * Public surface:
 *  - runPipeline / runAuditOnly: iterate over every chunk
 *  - runSingleChunk / auditSingleChunk: same logic restricted to one chunk
 *  - runCoherenceAudit: coherence check across all chunks
 *  - cancelPipeline: cancel whatever is in flight
 */
export function usePipeline() {
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const { t } = useTranslation();

  const ensureProvidersReadyBound = useCallback(
    (checks: ProviderCheck[]) => ensureProvidersReady(checks, t),
    [t],
  );

  const { runAuditOnly, auditSingleChunk, runCoherenceAudit } = usePipelineAudit(ensureProvidersReadyBound);

  const runPipeline = useCallback(() => engineRunPipeline(t), [t]);

  const runSingleChunk = useCallback(
    (chunkId: string) => runChunkExecution(chunkId, t),
    [t],
  );

  const cancelPipeline = useCallback(() => engineCancelPipeline(t), [t]);

  const rerunChunkWithMemory = useCallback(
    (chunkId: string, selectedMatches: PhraseMemoryMatch[]) =>
      engineRerunChunkWithMemory(chunkId, selectedMatches, t),
    [t],
  );

  return {
    runPipeline,
    runSingleChunk,
    rerunChunkWithMemory,
    runAuditOnly,
    auditSingleChunk,
    runCoherenceAudit,
    cancelPipeline,
    isProcessing,
  };
}
