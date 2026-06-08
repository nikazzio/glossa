import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { llmService } from '../services/llmService';
import { withRetry, friendlyError } from '../utils/retry';
import { pipelineLog } from '../utils/pipelineLogging';
import { stripFootnoteMarkers } from '../utils/footnoteExtractor';
import { buildBlobContext } from './pipeline/blobContext';
import { runJudgeForChunk } from './pipeline/runJudge';
import type { Issue, PromptInfo, ResponseInfo } from '../types';

type EnsureProvidersReady = (
  checks: { provider: string; model: string; label: string }[],
) => Promise<boolean>;

/**
 * Audit-only operations: runAuditOnly, auditSingleChunk, runCoherenceAudit.
 *
 * Accepts `ensureProvidersReady` from the parent hook to avoid duplicating
 * the preflight logic and to keep all provider checks in one place.
 */
export function usePipelineAudit(ensureProvidersReady: EnsureProvidersReady) {
  const {
    updateChunkJudge,
    updateChunkStatus,
    updateChunkCoherence,
    setIsProcessing,
  } = useChunksStore();
  const { config } = usePipelineStore();
  const { t } = useTranslation();

  const judgeActions = { updateChunkJudge, updateChunkStatus, t };

  const runAuditOnly = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    if (liveChunks.length === 0) return;
    pipelineLog.auditBatchStart(liveChunks.length);
    if (!(await ensureProvidersReady([
      { provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` },
    ]))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of liveChunks) {
      if (useChunksStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }
      const outcome = await runJudgeForChunk(chunk, chunk.translationProcessingText, judgeActions);
      if (outcome === 'cancelled') { cancelled = true; break; }
      if (outcome === 'failed') errorCount++;
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      pipelineLog.auditBatchCancelled();
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      pipelineLog.auditBatchCompleted();
      toast.success(t('errors.reEvalCompleted'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus, ensureProvidersReady]);

  const auditSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    if (!chunk.translationProcessingText) {
      toast.message(t('pipeline.auditSkippedNoDraft'));
      return;
    }
    if (!(await ensureProvidersReady([
      { provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` },
    ]))) return;
    pipelineLog.auditSingleStart(chunkId);
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    const outcome = await runJudgeForChunk(chunk, chunk.translationProcessingText, judgeActions);

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      pipelineLog.auditSingleCancelled(chunkId);
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      pipelineLog.auditSingleCompleted(chunkId);
      toast.success(t('pipeline.singleChunkAudited'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus, ensureProvidersReady]);

  const runCoherenceAudit = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    const auditableChunks = liveChunks.filter((c) => c.translationProcessingText?.trim());
    if (auditableChunks.length === 0) {
      toast.message(t('coherence.noChunksToAudit'));
      return;
    }
    if (liveChunks.some((c) => !c.translationProcessingText?.trim())) {
      toast.message(t('coherence.translationsRequired'));
      return;
    }
    if (!(await ensureProvidersReady([
      { provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` },
    ]))) return;
    pipelineLog.coherenceBatchStart(liveChunks.length);

    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (let i = 0; i < liveChunks.length; i++) {
      const chunk = liveChunks[i];
      if (!chunk.translationProcessingText?.trim()) continue;
      if (useChunksStore.getState().cancelRequested) { cancelled = true; break; }

      const blobContext = buildBlobContext(
        liveChunks,
        chunk.id,
        (c) => c.translationProcessingText?.trim() ? c.translationProcessingText : undefined,
      );

      updateChunkCoherence(chunk.id, { status: 'processing', issues: [] });
      const coherenceRef = { provider: config.judgeProvider, model: config.judgeModel };
      pipelineLog.coherenceChunkStart(chunk.id, coherenceRef);
      const coherenceStartedAt = Date.now();

      try {
        const result = await withRetry(
          () => llmService.runCoherenceForChunk(
            {
              original: stripFootnoteMarkers(chunk.sourceProcessingText),
              translation: chunk.translationProcessingText,
              blobContext,
              currentChunkId: chunk.id,
            },
            config,
            (info: PromptInfo) => pipelineLog.coherencePrompt(chunk.id, coherenceRef, info.systemPrompt, info.userPrompt),
            (info: ResponseInfo) => pipelineLog.coherenceResponse(chunk.id, info.rawJson),
          ),
          {
            label: 'Coherence audit',
            onRetry: (attempt, total, error, delayMs) =>
              pipelineLog.coherenceRetry(chunk.id, attempt, total, error, delayMs),
          },
        );

        const tokenUsage =
          result.inputTokens !== undefined && result.outputTokens !== undefined
            ? {
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                cachedInputTokens: result.cachedInputTokens,
                cacheMissInputTokens: result.cacheMissInputTokens,
              }
            : undefined;

        updateChunkCoherence(chunk.id, {
          status: 'completed',
          issues: result.issues as Issue[],
          ...(tokenUsage ? { tokenUsage } : {}),
        });
        pipelineLog.coherenceChunkEnd(
          chunk.id,
          coherenceRef,
          Date.now() - coherenceStartedAt,
          result.issues.length,
          tokenUsage,
        );
      } catch (error: unknown) {
        const msg = friendlyError(error instanceof Error ? error.message : String(error));
        updateChunkCoherence(chunk.id, { status: 'error', issues: [], error: msg });
        pipelineLog.coherenceChunkError(chunk.id, msg, Date.now() - coherenceStartedAt);
        errorCount++;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      pipelineLog.coherenceBatchCancelled();
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      pipelineLog.coherenceBatchCompleted();
      toast.success(t('coherence.auditCompleted'));
    } else {
      pipelineLog.coherenceBatchCompletedWithErrors(errorCount);
      toast.warning(t('coherence.auditCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkCoherence, ensureProvidersReady]);

  return { runAuditOnly, auditSingleChunk, runCoherenceAudit };
}
