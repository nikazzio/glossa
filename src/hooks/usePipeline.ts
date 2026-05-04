import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { llmService, isStreamCancelledError } from '../services/llmService';
import { withRetry, friendlyError } from '../utils/retry';
import { qualityDefault, qualityFailure } from '../utils';
import type { Issue, JudgeResult, TokenUsage, TranslationChunk } from '../types';

function lastNWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : words.slice(-n).join(' ');
}

function firstNWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : words.slice(0, n).join(' ');
}

type ChunkOutcome = 'completed' | 'failed' | 'cancelled' | 'skipped';

/**
 * Hook that encapsulates pipeline execution logic.
 * Uses streaming for translation stages, non-streaming for judge.
 * Includes retry with exponential backoff and toast notifications.
 *
 * Public surface:
 *  - runPipeline / runAuditOnly: iterate over every chunk
 *  - runSingleChunk / auditSingleChunk: same logic restricted to one chunk
 *  - cancelPipeline: cancel whatever is in flight
 */
export function usePipeline() {
  const {
    updateChunkStage,
    appendChunkStageContent,
    updateChunkJudge,
    updateChunkDraft,
    updateChunkStatus,
    updateChunkCoherence,
    clearChunkStages,
    requestCancel,
    setIsProcessing,
  } = useChunksStore();
  const { config } = usePipelineStore();
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const { t } = useTranslation();

  // ── Internal helpers ────────────────────────────────────────────────
  // These run the full per-chunk flow. They are plain async functions
  // (not useCallback) because they only need to be referentially stable
  // for the lifetime of a single invocation; the exported callbacks
  // pull them in fresh and that is fine.

  /**
   * Run all enabled translation stages and the audit for a single chunk.
   * Returns an outcome so the caller can aggregate batch counters.
   *
   * `skipIfCompleted` is true for the full-pipeline batch run (preserve
   * already-translated chunks) and false for an explicit per-chunk
   * re-run (the user asked for it, redo everything).
   */
  const executePipelineForChunk = async (
    chunk: TranslationChunk,
    options: { skipIfCompleted: boolean; previousTranslation?: string },
  ): Promise<ChunkOutcome> => {
    if (useChunksStore.getState().cancelRequested) return 'cancelled';
    if (options.skipIfCompleted && chunk.status === 'completed') return 'skipped';

    // Reset only this chunk so we don't carry over a previous run's
    // stage outputs / draft / audit if it cancels or fails early.
    clearChunkStages(chunk.id);
    updateChunkJudge(chunk.id, {
      content: '', status: 'idle', rating: qualityDefault(), issues: [],
    });
    updateChunkDraft(chunk.id, '');

    let lastResult = '';
    let producedOutput = false;
    updateChunkStatus(chunk.id, 'processing');

    for (const stage of config.stages) {
      if (!stage.enabled) continue;

      // Override global language pair with stage-specific one if set
      const effectiveConfig = (stage.sourceLanguage || stage.targetLanguage) ? {
        ...config,
        ...(stage.sourceLanguage ? { sourceLanguage: stage.sourceLanguage } : {}),
        ...(stage.targetLanguage ? { targetLanguage: stage.targetLanguage } : {}),
      } : config;

      updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
      try {
        let capturedUsage: TokenUsage | undefined;
        const result = await withRetry(
          async () => {
            capturedUsage = undefined;
            updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
            return llmService.runStageStream(
              chunk.originalText, stage, effectiveConfig, lastResult || undefined,
              (token) => appendChunkStageContent(chunk.id, stage.id, token),
              (usage) => { capturedUsage = usage; },
              stage.rollingContext !== false ? options.previousTranslation : undefined,
            );
          },
          { label: `Stage "${stage.name}"` },
        );
        if (result) {
          lastResult = result;
          producedOutput = true;
        }
        updateChunkStage(chunk.id, stage.id, {
          content: result,
          status: 'completed',
          ...(capturedUsage ? { tokenUsage: capturedUsage } : {}),
        });
      } catch (error: any) {
        if (isStreamCancelledError(error)) {
          updateChunkStage(chunk.id, stage.id, { content: '', status: 'idle' });
          updateChunkStatus(chunk.id, 'ready');
          return 'cancelled';
        }
        const msg = friendlyError(error.message ?? String(error));
        updateChunkStage(chunk.id, stage.id, {
          content: '', status: 'error', error: msg,
        });
        updateChunkStatus(chunk.id, 'error');
        toast.error(t('errors.stageFailed', { name: stage.name }), { description: msg });
        return 'failed';
      }
    }

    if (!producedOutput) {
      updateChunkStatus(chunk.id, 'ready');
      return 'skipped';
    }

    updateChunkDraft(chunk.id, lastResult);

    if (lastResult) {
      const auditOutcome = await runJudgeForChunk(chunk, lastResult);
      if (auditOutcome === 'failed') return 'failed';
      if (auditOutcome === 'cancelled') return 'cancelled';
    }

    return 'completed';
  };

  /**
   * Run the judge call for a chunk. Used both as the audit step at the
   * end of executePipelineForChunk and as the body of runAuditOnly /
   * auditSingleChunk.
   *
   * `existingDraft` is what we send to the judge — for the pipeline
   * flow this is the latest stage output; for re-audit it's the
   * chunk.currentDraft (which the user may have hand-edited).
   */
  const runJudgeForChunk = async (
    chunk: TranslationChunk,
    textToAudit: string | undefined,
  ): Promise<ChunkOutcome> => {
    if (!textToAudit) return 'skipped';
    // We do NOT short-circuit on cancelRequested here — once we have a
    // complete translation for this chunk, finishing the audit costs
    // nothing extra and matches the documented "stop after the current
    // chunk" behaviour. The outer loops still check cancel between chunks.

    updateChunkStatus(chunk.id, 'processing');
    updateChunkJudge(chunk.id, {
      content: '', status: 'processing', rating: qualityDefault(), issues: [],
    });
    try {
      const judgeData = await withRetry(
        () => llmService.judgeTranslation(chunk.originalText, textToAudit, config),
        { label: 'Audit' },
      );
      const judgeTokenUsage =
        judgeData.inputTokens !== undefined && judgeData.outputTokens !== undefined
          ? { inputTokens: judgeData.inputTokens, outputTokens: judgeData.outputTokens }
          : undefined;
      updateChunkJudge(chunk.id, {
        ...judgeData,
        content: textToAudit,
        status: 'completed',
        ...(judgeTokenUsage ? { tokenUsage: judgeTokenUsage } : {}),
      } as JudgeResult);
      updateChunkStatus(chunk.id, 'completed');
      return 'completed';
    } catch (error: any) {
      const msg = friendlyError(error.message ?? String(error));
      updateChunkJudge(chunk.id, {
        content: textToAudit,
        status: 'error',
        rating: qualityFailure(),
        issues: [],
        error: msg,
      });
      updateChunkStatus(chunk.id, 'error');
      toast.error(t('errors.auditFailed'), { description: msg });
      return 'failed';
    }
  };

  // ── Exported callables ──────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    // Read chunks from the store at invocation time so callers that
    // mutate the store right before invoking us (e.g. the "Re-run all"
    // button which resetCompletedChunks() then runPipeline()) see the
    // freshest state instead of a stale useCallback closure.
    const liveChunks = useChunksStore.getState().chunks;
    if (liveChunks.length === 0) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;
    let previousTranslation: string | undefined;

    for (const chunk of liveChunks) {
      const outcome = await executePipelineForChunk(chunk, { skipIfCompleted: true, previousTranslation });
      if (outcome === 'cancelled') { cancelled = true; break; }
      if (outcome === 'failed') errorCount++;
      if (outcome === 'completed' || outcome === 'skipped') {
        const fresh = useChunksStore.getState().chunks.find((c) => c.id === chunk.id);
        previousTranslation = fresh?.currentDraft || undefined;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      toast.success(t('errors.pipelineCompleted'));
    } else {
      toast.warning(t('errors.pipelineCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages]);

  const runSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    // Force a redo even if this chunk was already completed — the user
    // explicitly asked for it via the per-chunk action menu.
    const outcome = await executePipelineForChunk(chunk, { skipIfCompleted: false });

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      toast.success(t('pipeline.singleChunkCompleted'));
    } else if (outcome === 'failed') {
      // Per-chunk failure already raised a toast inside the helper; no
      // extra summary toast is needed.
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages]);

  const runAuditOnly = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    if (liveChunks.length === 0) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of liveChunks) {
      if (useChunksStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }

      const outcome = await runJudgeForChunk(chunk, chunk.currentDraft);
      if (outcome === 'cancelled') { cancelled = true; break; }
      if (outcome === 'failed') errorCount++;

      if (useChunksStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      toast.success(t('errors.reEvalCompleted'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus]);

  const auditSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    if (!chunk.currentDraft) {
      toast.message(t('pipeline.auditSkippedNoDraft'));
      return;
    }
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    const outcome = await runJudgeForChunk(chunk, chunk.currentDraft);

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      toast.success(t('pipeline.singleChunkAudited'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus]);

  const runCoherenceAudit = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    const auditableChunks = liveChunks.filter((c) => c.currentDraft?.trim());
    if (auditableChunks.length === 0) {
      toast.message(t('coherence.noChunksToAudit'));
      return;
    }
    if (liveChunks.some((c) => !c.currentDraft?.trim())) {
      toast.message(t('coherence.translationsRequired'));
      return;
    }

    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (let i = 0; i < liveChunks.length; i++) {
      const chunk = liveChunks[i];
      if (!chunk.currentDraft?.trim()) continue;
      if (useChunksStore.getState().cancelRequested) { cancelled = true; break; }

      const prevChunk = liveChunks[i - 1];
      const nextChunk = liveChunks[i + 1];
      const prevContext = prevChunk?.currentDraft ? lastNWords(prevChunk.currentDraft, 300) : undefined;
      const nextContext = nextChunk?.currentDraft ? firstNWords(nextChunk.currentDraft, 300) : undefined;

      updateChunkCoherence(chunk.id, { status: 'processing', issues: [] });

      try {
        const result = await withRetry(
          () => llmService.runCoherenceForChunk(
            { original: chunk.originalText, translation: chunk.currentDraft!, prevContext, nextContext },
            config,
          ),
          { label: 'Coherence audit' },
        );
        const tokenUsage =
          result.inputTokens !== undefined && result.outputTokens !== undefined
            ? { inputTokens: result.inputTokens, outputTokens: result.outputTokens }
            : undefined;
        updateChunkCoherence(chunk.id, {
          status: 'completed',
          issues: result.issues as Issue[],
          ...(tokenUsage ? { tokenUsage } : {}),
        });
      } catch (error: any) {
        const msg = friendlyError(error.message ?? String(error));
        updateChunkCoherence(chunk.id, { status: 'error', issues: [], error: msg });
        errorCount++;
        toast.error(t('errors.coherenceFailed'), { description: msg });
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      toast.success(t('coherence.auditCompleted'));
    } else {
      toast.warning(t('coherence.auditCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkCoherence]);

  const cancelPipeline = useCallback(() => {
    requestCancel();
    const streamId = useChunksStore.getState().activeStreamId;
    if (streamId) {
      // Best-effort: tell the backend to drop the in-flight HTTP request
      // so the provider stops billing immediately. Failures are silent
      // because the cancelRequested flag will still stop the loop between
      // chunks.
      llmService.cancelStream(streamId).catch(() => {});
    }
    toast.message(t('pipeline.stopRequested'));
  }, [requestCancel, t]);

  return {
    runPipeline,
    runSingleChunk,
    runAuditOnly,
    auditSingleChunk,
    runCoherenceAudit,
    cancelPipeline,
    isProcessing,
  };
}
