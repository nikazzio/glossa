import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { llmService, isStreamCancelledError } from '../services/llmService';
import { useUiStore } from '../stores/uiStore';
import { logOperation } from '../stores/operationLogStore';
import { showPreflightDialog } from '../stores/preflightStore';
import { withRetry, friendlyError, is429Error } from '../utils/retry';
import { qualityDefault, qualityFailure } from '../utils';
import type { Issue, JudgeResult, PromptInfo, TokenUsage, TranslationChunk } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { saveChunkCheckpoint, setRunInProgress } from '../services/projectService';
import { buildPipelineFingerprint } from '../utils/pipelineFingerprint';

function assembleBlobContext(chunks: TranslationChunk[], chunkId: string): string | undefined {
  const current = chunks.find((c) => c.id === chunkId);
  if (!current?.blobId) return undefined;
  const siblings = chunks.filter((c) => c.blobId === current.blobId && c.id !== chunkId);
  if (siblings.length === 0) return undefined;
  return siblings.map((c) => c.sourceProcessingText).filter(Boolean).join('\n\n') || undefined;
}

function assembleTranslationBlobContext(chunks: TranslationChunk[], chunkId: string): string | undefined {
  const current = chunks.find((c) => c.id === chunkId);
  if (!current?.blobId) return undefined;
  const siblings = chunks.filter((c) => c.blobId === current.blobId && c.id !== chunkId && c.translationProcessingText?.trim());
  if (siblings.length === 0) return undefined;
  return siblings.map((c) => c.translationProcessingText).filter(Boolean).join('\n\n') || undefined;
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
    setChunkStagePromptInfo,
    updateChunkJudge,
    updateChunkDraft,
    updateChunkStatus,
    updateChunkCoherence,
    clearChunkStages,
    requestCancel,
    setIsProcessing,
    setBlobAssignments,
  } = useChunksStore();
  const { config } = usePipelineStore();
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const { t } = useTranslation();

  type ProviderCheck = { provider: string; model: string; label: string };

  /**
   * Run pre-flight checks for all providers referenced by the given list of
   * (provider, model, label) entries. Deduplicates by (provider, model).
   *
   * - Shows a loading toast while checks are in flight.
   * - Updates Ollama UI state from the check results.
   * - Opens the PreflightDialog when any check fails, letting the user decide
   *   whether to abort (fix config) or proceed anyway.
   *
   * Returns true if the pipeline can proceed, false if it should be aborted.
   */
  const ensureProvidersReady = useCallback(async (checks: ProviderCheck[]) => {
    if (checks.length === 0) return true;

    // Deduplicate by (provider, model) — preserves first occurrence's label.
    const seen = new Set<string>();
    const dedupedChecks = checks.filter((c) => {
      const key = `${c.provider}:${c.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logOperation({
      level: 'info',
      scope: 'preflight',
      message: 'Running pre-flight provider checks',
      meta: { checks: dedupedChecks.map((c) => `${c.provider}/${c.model}`) },
    });

    const toastId = toast.loading(t('preflight.checking'));

    let results: Awaited<ReturnType<typeof llmService.preflightPipeline>>;
    try {
      results = await llmService.preflightPipeline(dedupedChecks);
    } catch (error: unknown) {
      toast.dismiss(toastId);
      const msg = friendlyError(error instanceof Error ? error.message : String(error));
      logOperation({
        level: 'error',
        scope: 'preflight',
        message: 'Pre-flight check itself failed to run',
        meta: { error: msg },
      });
      toast.error(t('preflight.checkFailed'), { description: msg });
      return false;
    }

    toast.dismiss(toastId);

    // Keep Ollama status indicator and model list in sync.
    // Use `reachable` (not `ok`) so a missing-model failure doesn't incorrectly
    // mark Ollama as disconnected when it is actually running.
    const ollamaResults = results.filter((r) => r.provider === 'ollama');
    if (ollamaResults.length > 0) {
      const ollamaReachable = ollamaResults.some((r) => r.reachable === true);
      const allOllamaOk = ollamaResults.every((r) => r.ok);
      useUiStore.getState().setOllamaStatus(ollamaReachable || allOllamaOk ? 'connected' : 'disconnected');
      const allModels = [...new Set(ollamaResults.flatMap((r) => r.availableModels ?? []))];
      if (allModels.length > 0) {
        useUiStore.getState().setOllamaModels(allModels);
      } else if (!ollamaReachable) {
        useUiStore.getState().setOllamaModels([]);
      }
    }

    const hasFailures = results.some((r) => !r.ok);

    if (hasFailures) {
      logOperation({
        level: 'warn',
        scope: 'preflight',
        message: 'Pre-flight check found provider configuration issues',
        meta: { failures: results.filter((r) => !r.ok).map((r) => `${r.provider}/${r.model}: ${r.error}`) },
      });
      return showPreflightDialog(results);
    }

    logOperation({
      level: 'success',
      scope: 'preflight',
      message: 'Pre-flight check passed — all providers ready',
    });
    return true;
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
    options: { skipIfCompleted: boolean },
  ): Promise<ChunkOutcome> => {
    if (useChunksStore.getState().cancelRequested) return 'cancelled';
    if (options.skipIfCompleted && chunk.status === 'completed') return 'skipped';

    // Reset only this chunk so we don't carry over a previous run's
    // stage outputs / draft / audit if it cancels or fails early.
    clearChunkStages(chunk.id);
    logOperation({
      level: 'info',
      scope: 'chunk',
      message: 'Pipeline started',
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

      // Override global language pair with stage-specific one if set, but not when persona is active.
      // Also inject blob context (original texts of sibling chunks in the same blob).
      const liveChunks = useChunksStore.getState().chunks;
      const blobContext = assembleBlobContext(liveChunks, chunk.id);
      const effectiveConfig = {
        ...config,
        ...(!config.persona && stage.sourceLanguage ? { sourceLanguage: stage.sourceLanguage } : {}),
        ...(!config.persona && stage.targetLanguage ? { targetLanguage: stage.targetLanguage } : {}),
        ...(blobContext ? { blobContext } : {}),
      };
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
              () => logOperation({
                level: 'info',
                scope: 'stage',
                message: 'Ollama still alive — idle grace check passed, waiting for more tokens',
                chunkId: chunk.id,
                stageId: stage.id,
              }),
            );
          },
          {
            label: `Stage "${stage.name}"`,
            onRetry: (attempt, total, error, delayMs) => {
              if (is429Error(error)) {
                updateChunkStage(chunk.id, stage.id, { content: '', status: 'retrying', retryInfo: { attempt, total, delayMs } });
              }
              logOperation({
                level: 'warn',
                scope: 'stage',
                message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
                chunkId: chunk.id,
                stageId: stage.id,
                meta: { error },
              });
            },
          },
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
          message: `Stage "${stage.name}" completed`,
          chunkId: chunk.id,
          stageId: stage.id,
          meta: { provider: stage.provider, model: stage.model, ...(capturedUsage ?? {}) },
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
          message: `Stage "${stage.name}" failed`,
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
      message: 'Audit started',
      chunkId: chunk.id,
      meta: { provider: (effectiveConfig ?? config).judgeProvider, model: (effectiveConfig ?? config).judgeModel },
    });
    updateChunkJudge(chunk.id, {
      content: '', status: 'processing', rating: qualityDefault(), issues: [],
    });
    try {
      const judgeData = await withRetry(
        () => llmService.judgeTranslation(
          chunk.sourceProcessingText,
          textToAudit,
          effectiveConfig ?? config,
          (info: PromptInfo) => {
            logOperation({
              level: 'info',
              scope: 'audit',
              message: `prompt → ${(effectiveConfig ?? config).judgeProvider}/${(effectiveConfig ?? config).judgeModel}`,
              chunkId: chunk.id,
              detail: `[system]\n${info.systemPrompt}\n\n[user]\n${info.userPrompt}`,
            });
          },
          () => logOperation({
            level: 'info',
            scope: 'audit',
            message: 'Ollama still alive — idle grace check passed, waiting for more tokens',
            chunkId: chunk.id,
          }),
        ),
        {
          label: 'Audit',
          onRetry: (attempt, total, error, delayMs) => logOperation({
            level: 'warn',
            scope: 'audit',
            message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
            chunkId: chunk.id,
            meta: { error },
          }),
        },
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
      logOperation({
        level: 'success',
        scope: 'audit',
        message: 'Audit completed',
        chunkId: chunk.id,
        meta: {
          provider: (effectiveConfig ?? config).judgeProvider,
          model: (effectiveConfig ?? config).judgeModel,
          ...(judgeTokenUsage ?? {}),
        },
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
        message: 'Audit failed',
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
    if (!(await ensureProvidersReady([
      ...config.stages.filter((stage) => stage.enabled).map((stage, i) => ({
        provider: stage.provider,
        model: stage.model,
        label: `${stage.name || `Stage ${i + 1}`} — ${stage.provider} ${stage.model}`,
      })),
      { provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` },
    ]))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    const projectId = useProjectStore.getState().currentProjectId;
    if (projectId) {
      void setRunInProgress(projectId, true, buildPipelineFingerprint(config)).catch(() => {});
    }

    if ((config.blobBudgetTokens ?? 0) > 0) {
      try {
        const assignments = await llmService.computeBlobs(
          liveChunks.map((c) => ({ id: c.id, text: c.sourceProcessingText })),
          config.blobBudgetTokens!,
          config.blobOverlap ?? 1,
        );
        setBlobAssignments(assignments);
      } catch (error: unknown) {
        logOperation({
          level: 'warn',
          scope: 'pipeline',
          message: 'Blob computation failed, continuing without blob context',
          meta: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    let errorCount = 0;
    let cancelled = false;

    try {
      for (const chunk of liveChunks) {
        const outcome = await executePipelineForChunk(chunk, { skipIfCompleted: true });
        if (outcome === 'cancelled') { cancelled = true; break; }
        if (outcome === 'failed') errorCount++;
        if ((outcome === 'completed' || outcome === 'failed') && projectId) {
          const fresh = useChunksStore.getState().chunks.find((c) => c.id === chunk.id);
          const position = liveChunks.indexOf(chunk);
          if (fresh) {
            void saveChunkCheckpoint(projectId, fresh, position).catch(() => {});
          }
        }
      }
    } finally {
      setIsProcessing(false);
      useChunksStore.getState().clearCancelRequest();
      if (projectId) {
        void setRunInProgress(projectId, false).catch(() => {});
      }
    }

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
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages, ensureProvidersReady, setBlobAssignments]);

  const runSingleChunk = useCallback(async (chunkId: string) => {
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    logOperation({ level: 'info', scope: 'pipeline', message: 'Single chunk pipeline run started', chunkId });
    if (!(await ensureProvidersReady([
      ...config.stages.filter((stage) => stage.enabled).map((stage, i) => ({
        provider: stage.provider,
        model: stage.model,
        label: `${stage.name || `Stage ${i + 1}`} — ${stage.provider} ${stage.model}`,
      })),
      { provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` },
    ]))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    if ((config.blobBudgetTokens ?? 0) > 0) {
      const allChunks = useChunksStore.getState().chunks;
      try {
        const assignments = await llmService.computeBlobs(
          allChunks.map((c) => ({ id: c.id, text: c.sourceProcessingText })),
          config.blobBudgetTokens!,
          config.blobOverlap ?? 1,
        );
        setBlobAssignments(assignments);
      } catch {
        // Continue without blob context on failure
      }
    }

    // Force a redo even if this chunk was already completed — the user
    // explicitly asked for it via the per-chunk action menu.
    const freshChunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId) ?? chunk;
    const outcome = await executePipelineForChunk(freshChunk, { skipIfCompleted: false });

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
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages, ensureProvidersReady, setBlobAssignments]);

  const runAuditOnly = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const liveChunks = useChunksStore.getState().chunks;
    if (liveChunks.length === 0) return;
    logOperation({ level: 'info', scope: 'audit', message: 'Batch audit run started', meta: { chunks: liveChunks.length } });
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
    if (!(await ensureProvidersReady([{ provider: config.judgeProvider, model: config.judgeModel, label: `Judge — ${config.judgeProvider} ${config.judgeModel}` }]))) return;
    logOperation({ level: 'info', scope: 'coherence', message: 'Cross-chunk coherence audit started', meta: { chunks: liveChunks.length } });

    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (let i = 0; i < liveChunks.length; i++) {
      const chunk = liveChunks[i];
      if (!chunk.translationProcessingText?.trim()) continue;
      if (useChunksStore.getState().cancelRequested) { cancelled = true; break; }

      const blobContext = assembleTranslationBlobContext(liveChunks, chunk.id);

      updateChunkCoherence(chunk.id, { status: 'processing', issues: [] });
      logOperation({ level: 'info', scope: 'coherence', message: 'Coherence check started', chunkId: chunk.id, meta: { provider: config.judgeProvider, model: config.judgeModel } });

      try {
        const result = await withRetry(
          () => llmService.runCoherenceForChunk(
            { original: chunk.sourceProcessingText, translation: chunk.translationProcessingText, blobContext },
            config,
            (info: PromptInfo) => {
              logOperation({
                level: 'info',
                scope: 'coherence',
                message: `prompt → ${config.judgeProvider}/${config.judgeModel}`,
                chunkId: chunk.id,
                detail: `[system]\n${info.systemPrompt}\n\n[user]\n${info.userPrompt}`,
              });
            },
            () => logOperation({
              level: 'info',
              scope: 'coherence',
              message: 'Ollama still alive — idle grace check passed, waiting for more tokens',
              chunkId: chunk.id,
            }),
          ),
          {
            label: 'Coherence audit',
            onRetry: (attempt, total, error, delayMs) => logOperation({
              level: 'warn',
              scope: 'coherence',
              message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
              chunkId: chunk.id,
              meta: { error },
            }),
          },
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
        logOperation({
          level: 'success',
          scope: 'coherence',
          message: 'Coherence check completed',
          chunkId: chunk.id,
          meta: { provider: config.judgeProvider, model: config.judgeModel, issues: result.issues.length, ...(tokenUsage ?? {}) },
        });
      } catch (error: unknown) {
        const msg = friendlyError(error instanceof Error ? error.message : String(error));
        updateChunkCoherence(chunk.id, { status: 'error', issues: [], error: msg });
        logOperation({
          level: 'error',
          scope: 'coherence',
          message: 'Coherence check failed',
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
  }, [config, t, setIsProcessing, updateChunkCoherence, ensureProvidersReady]);

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
