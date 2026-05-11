import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { llmService, ollamaService, isStreamCancelledError } from '../services/llmService';
import { useUiStore } from '../stores/uiStore';
import { logOperation } from '../stores/operationLogStore';
import { withRetry, friendlyError } from '../utils/retry';
import { qualityDefault, qualityFailure } from '../utils';
import type { Issue, JudgeResult, PromptInfo, TokenUsage, TranslationChunk } from '../types';

function lastNWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : words.slice(-n).join(' ');
}

function firstNWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text.trim() : words.slice(0, n).join(' ');
}

type ChunkOutcome = 'completed' | 'failed' | 'cancelled' | 'skipped';
type OllamaRunRequirement = { provider: string; model?: string | null };

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
    setChunkStagePromptInfo,
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

  const ensureOllamaReady = useCallback(async (requirements: OllamaRunRequirement[]) => {
    const ollamaModels = new Set(
      requirements
        .filter((item) => item.provider === 'ollama')
        .map((item) => item.model?.trim())
        .filter((model): model is string => Boolean(model)),
    );

    if (ollamaModels.size === 0) return true;

    const requestedModels = [...ollamaModels];
    logOperation({
      level: 'info',
      scope: 'preflight',
      message: 'Checking whether Ollama is reachable and whether the requested local models are installed',
      meta: { requestedModels },
    });

    try {
      const preflight = await ollamaService.checkPreflight(requestedModels[0]);
      useUiStore.getState().setOllamaStatus(preflight.reachable ? 'connected' : 'disconnected');
      useUiStore.getState().setOllamaModels(preflight.models);

      if (!preflight.reachable) {
        logOperation({
          level: 'error',
          scope: 'preflight',
          message: 'Ollama is offline, so the run is blocked before any chunk work starts',
        });
        toast.error(t('ollama.notRunning'));
        return false;
      }
      if (preflight.models.length === 0) {
        logOperation({
          level: 'warn',
          scope: 'preflight',
          message: 'Ollama responded, but there are no installed local models to run',
        });
        toast.error(t('ollama.noModels'));
        return false;
      }

      const available = new Set(preflight.models);
      const missing = requestedModels.filter((model) =>
        !available.has(model) &&
        !available.has(`${model}:latest`) &&
        !(model.endsWith(':latest') && available.has(model.slice(0, -7))),
      );

      if (missing.length > 0) {
        logOperation({
          level: 'error',
          scope: 'preflight',
          message: `The configured Ollama model "${missing[0]}" is missing locally`,
        });
        toast.error(t('ollama.modelMissing', { model: missing[0] }));
        return false;
      }

      logOperation({
        level: 'success',
        scope: 'preflight',
        message: 'Ollama preflight passed and the run can proceed',
        meta: { models: preflight.models.length, availableModels: preflight.models },
      });
      return true;
    } catch (error: unknown) {
      useUiStore.getState().setOllamaStatus('disconnected');
      useUiStore.getState().setOllamaModels([]);
      const msg = friendlyError(error instanceof Error ? error.message : String(error));
      logOperation({
        level: 'error',
        scope: 'preflight',
        message: 'The preflight request itself failed before the pipeline could start',
        meta: { error: msg },
      });
      toast.error(t('ollama.notRunning'), { description: msg });
      return false;
    }
  }, [t]);

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
    logOperation({
      level: 'info',
      scope: 'chunk',
      message: 'Starting pipeline work for this chunk',
      chunkId: chunk.id,
    });
    updateChunkJudge(chunk.id, {
      content: '', status: 'idle', rating: qualityDefault(), issues: [],
    });
    updateChunkDraft(chunk.id, '');

    let lastResult = '';
    let lastEffectiveConfig = config;
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
      lastEffectiveConfig = effectiveConfig;

      updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
      logOperation({
        level: 'info',
        scope: 'stage',
        message: `Stage "${stage.name}" started streaming generation`,
        chunkId: chunk.id,
        stageId: stage.id,
        meta: { provider: stage.provider, model: stage.model },
      });
      try {
        let capturedUsage: TokenUsage | undefined;
        const result = await withRetry(
          async () => {
            capturedUsage = undefined;
            updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
            return llmService.runStageStream(
              chunk.sourceProcessingText, stage, effectiveConfig, lastResult || undefined,
              (token) => appendChunkStageContent(chunk.id, stage.id, token),
              (usage) => { capturedUsage = usage; },
              stage.rollingContext !== false ? options.previousTranslation : undefined,
              (info: PromptInfo) => {
                setChunkStagePromptInfo(chunk.id, stage.id, info);
                logOperation({
                  level: 'info',
                  scope: 'stage',
                  message: `prompt → ${stage.provider}/${stage.model}`,
                  chunkId: chunk.id,
                  stageId: stage.id,
                  detail: `[system]\n${info.systemPrompt}\n\n[user]\n${info.userPrompt}`,
                });
              },
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
        logOperation({
          level: 'success',
          scope: 'stage',
          message: `Stage "${stage.name}" completed and produced a candidate output`,
          chunkId: chunk.id,
          stageId: stage.id,
          meta: capturedUsage ? { ...capturedUsage } : undefined,
        });
      } catch (error: unknown) {
        if (isStreamCancelledError(error)) {
          updateChunkStage(chunk.id, stage.id, { content: '', status: 'idle' });
          updateChunkStatus(chunk.id, 'ready');
          logOperation({
            level: 'warn',
            scope: 'stage',
            message: `Stage "${stage.name}" was cancelled while streaming`,
            chunkId: chunk.id,
            stageId: stage.id,
          });
          return 'cancelled';
        }
        const msg = friendlyError(error instanceof Error ? error.message : String(error));
        updateChunkStage(chunk.id, stage.id, {
          content: '', status: 'error', error: msg,
        });
        updateChunkStatus(chunk.id, 'error');
        logOperation({
          level: 'error',
          scope: 'stage',
          message: `Stage "${stage.name}" failed and this chunk stopped here`,
          chunkId: chunk.id,
          stageId: stage.id,
          meta: { error: msg },
        });
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
      const auditOutcome = await runJudgeForChunk(chunk, lastResult, lastEffectiveConfig);
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
    effectiveConfig?: typeof config,
  ): Promise<ChunkOutcome> => {
    if (!textToAudit) return 'skipped';
    // We do NOT short-circuit on cancelRequested here — once we have a
    // complete translation for this chunk, finishing the audit costs
    // nothing extra and matches the documented "stop after the current
    // chunk" behaviour. The outer loops still check cancel between chunks.

    updateChunkStatus(chunk.id, 'processing');
    logOperation({
      level: 'info',
      scope: 'audit',
      message: 'Judge started evaluating the final candidate for this chunk',
      chunkId: chunk.id,
      meta: { provider: (effectiveConfig ?? config).judgeProvider, model: (effectiveConfig ?? config).judgeModel },
    });
    updateChunkJudge(chunk.id, {
      content: '', status: 'processing', rating: qualityDefault(), issues: [],
    });
    try {
      const judgeData = await withRetry(
        () => llmService.judgeTranslation(chunk.sourceProcessingText, textToAudit, effectiveConfig ?? config),
        { label: 'Audit' },
      );
      const judgeTokenUsage =
        judgeData.inputTokens !== undefined && judgeData.outputTokens !== undefined
          ? { inputTokens: judgeData.inputTokens, outputTokens: judgeData.outputTokens }
          : undefined;
      const judgePromptInfo =
        judgeData.systemPrompt !== undefined && judgeData.userPrompt !== undefined
          ? { systemPrompt: judgeData.systemPrompt, userPrompt: judgeData.userPrompt }
          : undefined;
      if (judgePromptInfo) {
        logOperation({
          level: 'info',
          scope: 'audit',
          message: `prompt → ${(effectiveConfig ?? config).judgeProvider}/${(effectiveConfig ?? config).judgeModel}`,
          chunkId: chunk.id,
          detail: `[system]\n${judgePromptInfo.systemPrompt}\n\n[user]\n${judgePromptInfo.userPrompt}`,
        });
      }
      updateChunkJudge(chunk.id, {
        ...judgeData,
        content: textToAudit,
        status: 'completed',
        ...(judgeTokenUsage ? { tokenUsage: judgeTokenUsage } : {}),
        ...(judgePromptInfo ? { promptInfo: judgePromptInfo } : {}),
      } as JudgeResult);
      updateChunkStatus(chunk.id, 'completed');
      logOperation({
        level: 'success',
        scope: 'audit',
        message: 'Judge completed and stored the audit result',
        chunkId: chunk.id,
        meta: judgeTokenUsage ? { ...judgeTokenUsage } : undefined,
      });
      return 'completed';
    } catch (error: unknown) {
      const msg = friendlyError(error instanceof Error ? error.message : String(error));
      updateChunkJudge(chunk.id, {
        content: textToAudit,
        status: 'error',
        rating: qualityFailure(),
        issues: [],
        error: msg,
      });
      updateChunkStatus(chunk.id, 'error');
      logOperation({
        level: 'error',
        scope: 'audit',
        message: 'Judge failed while auditing this chunk',
        chunkId: chunk.id,
        meta: { error: msg },
      });
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
    logOperation({
      level: 'info',
      scope: 'pipeline',
      message: 'Batch pipeline run started',
      meta: { chunks: liveChunks.length, stages: config.stages.filter((stage) => stage.enabled).length },
    });
    if (!(await ensureOllamaReady([
      ...config.stages.filter((stage) => stage.enabled).map((stage) => ({ provider: stage.provider, model: stage.model })),
      { provider: config.judgeProvider, model: config.judgeModel },
    ]))) return;
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
        previousTranslation = fresh?.translationProcessingText || undefined;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      logOperation({ level: 'warn', scope: 'pipeline', message: 'Batch pipeline run was cancelled by the user' });
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      logOperation({ level: 'success', scope: 'pipeline', message: 'Batch pipeline run completed successfully' });
      toast.success(t('errors.pipelineCompleted'));
    } else {
      logOperation({
        level: 'warn',
        scope: 'pipeline',
        message: 'Batch pipeline run completed, but some chunks failed',
        meta: { errorCount },
      });
      toast.warning(t('errors.pipelineCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages, ensureOllamaReady]);

  const runSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    logOperation({ level: 'info', scope: 'pipeline', message: 'Single chunk pipeline run started', chunkId });
    if (!(await ensureOllamaReady([
      ...config.stages.filter((stage) => stage.enabled).map((stage) => ({ provider: stage.provider, model: stage.model })),
      { provider: config.judgeProvider, model: config.judgeModel },
    ]))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    // Force a redo even if this chunk was already completed — the user
    // explicitly asked for it via the per-chunk action menu.
    const outcome = await executePipelineForChunk(chunk, { skipIfCompleted: false });

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      logOperation({ level: 'warn', scope: 'pipeline', message: 'Single chunk pipeline run was cancelled', chunkId });
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      logOperation({ level: 'success', scope: 'pipeline', message: 'Single chunk pipeline run completed', chunkId });
      toast.success(t('pipeline.singleChunkCompleted'));
    } else if (outcome === 'failed') {
      // Per-chunk failure already raised a toast inside the helper; no
      // extra summary toast is needed.
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages, ensureOllamaReady]);

  const runAuditOnly = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    if (liveChunks.length === 0) return;
    logOperation({ level: 'info', scope: 'audit', message: 'Batch audit run started', meta: { chunks: liveChunks.length } });
    if (!(await ensureOllamaReady([{ provider: config.judgeProvider, model: config.judgeModel }]))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of liveChunks) {
      if (useChunksStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }

      const outcome = await runJudgeForChunk(chunk, chunk.translationProcessingText);
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
      logOperation({ level: 'warn', scope: 'audit', message: 'Batch audit run was cancelled by the user' });
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      logOperation({ level: 'success', scope: 'audit', message: 'Batch audit run completed successfully' });
      toast.success(t('errors.reEvalCompleted'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus, ensureOllamaReady]);

  const auditSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    if (!chunk.translationProcessingText) {
      toast.message(t('pipeline.auditSkippedNoDraft'));
      return;
    }
    if (!(await ensureOllamaReady([{ provider: config.judgeProvider, model: config.judgeModel }]))) return;
    logOperation({ level: 'info', scope: 'audit', message: 'Single chunk audit started', chunkId });
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    const outcome = await runJudgeForChunk(chunk, chunk.translationProcessingText);

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      logOperation({ level: 'warn', scope: 'audit', message: 'Single chunk audit was cancelled', chunkId });
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      logOperation({ level: 'success', scope: 'audit', message: 'Single chunk audit completed', chunkId });
      toast.success(t('pipeline.singleChunkAudited'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus, ensureOllamaReady]);

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
    if (!(await ensureOllamaReady([{ provider: config.judgeProvider, model: config.judgeModel }]))) return;
    logOperation({ level: 'info', scope: 'coherence', message: 'Cross-chunk coherence audit started', meta: { chunks: liveChunks.length } });

    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (let i = 0; i < liveChunks.length; i++) {
      const chunk = liveChunks[i];
      if (!chunk.translationProcessingText?.trim()) continue;
      if (useChunksStore.getState().cancelRequested) { cancelled = true; break; }

      const prevChunk = liveChunks[i - 1];
      const nextChunk = liveChunks[i + 1];
      const prevContext = prevChunk?.translationProcessingText ? lastNWords(prevChunk.translationProcessingText, 300) : undefined;
      const nextContext = nextChunk?.translationProcessingText ? firstNWords(nextChunk.translationProcessingText, 300) : undefined;

      updateChunkCoherence(chunk.id, { status: 'processing', issues: [] });
      logOperation({ level: 'info', scope: 'coherence', message: 'Coherence check started for this chunk against its neighbors', chunkId: chunk.id });

      try {
        const result = await withRetry(
          () => llmService.runCoherenceForChunk(
            { original: chunk.sourceProcessingText, translation: chunk.translationProcessingText, prevContext, nextContext },
            config,
          ),
          { label: 'Coherence audit' },
        );
        const tokenUsage =
          result.inputTokens !== undefined && result.outputTokens !== undefined
            ? { inputTokens: result.inputTokens, outputTokens: result.outputTokens }
            : undefined;
        const coherencePromptInfo =
          result.systemPrompt !== undefined && result.userPrompt !== undefined
            ? { systemPrompt: result.systemPrompt, userPrompt: result.userPrompt }
            : undefined;
        if (coherencePromptInfo) {
          logOperation({
            level: 'info',
            scope: 'coherence',
            message: `prompt → ${config.judgeProvider}/${config.judgeModel}`,
            chunkId: chunk.id,
            detail: `[system]\n${coherencePromptInfo.systemPrompt}\n\n[user]\n${coherencePromptInfo.userPrompt}`,
          });
        }
        updateChunkCoherence(chunk.id, {
          status: 'completed',
          issues: result.issues as Issue[],
          ...(tokenUsage ? { tokenUsage } : {}),
          ...(coherencePromptInfo ? { promptInfo: coherencePromptInfo } : {}),
        });
        logOperation({
          level: 'success',
          scope: 'coherence',
          message: 'Coherence check completed for this chunk',
          chunkId: chunk.id,
          meta: { issues: result.issues.length, ...tokenUsage },
        });
      } catch (error: unknown) {
        const msg = friendlyError(error instanceof Error ? error.message : String(error));
        updateChunkCoherence(chunk.id, { status: 'error', issues: [], error: msg });
        logOperation({
          level: 'error',
          scope: 'coherence',
          message: 'Coherence check failed for this chunk',
          chunkId: chunk.id,
          meta: { error: msg },
        });
        errorCount++;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      logOperation({ level: 'warn', scope: 'coherence', message: 'Cross-chunk coherence audit was cancelled' });
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      logOperation({ level: 'success', scope: 'coherence', message: 'Cross-chunk coherence audit completed' });
      toast.success(t('coherence.auditCompleted'));
    } else {
      logOperation({
        level: 'warn',
        scope: 'coherence',
        message: 'Cross-chunk coherence audit completed with errors',
        meta: { errorCount },
      });
      toast.warning(t('coherence.auditCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkCoherence, ensureOllamaReady]);

  const cancelPipeline = useCallback(() => {
    requestCancel();
    logOperation({ level: 'warn', scope: 'pipeline', message: 'Cancellation requested; the current in-flight work is being asked to stop' });
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
