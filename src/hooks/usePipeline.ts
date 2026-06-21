import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { llmService, isStreamCancelledError } from '../services/llmService';
import { deeplService } from '../services/deeplService';
import { useConfigStore } from '../stores/configStore';
import { showPreflightDialog } from '../stores/preflightStore';
import { withRetry, friendlyError, is429Error } from '../utils/retry';
import { pipelineLog } from '../utils/pipelineLogging';
import { useOperationLogStore } from '../stores/operationLogStore';
import type { PromptInfo, TokenUsage, TranslationChunk } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';
import { buildMemoryInjection } from '../services/phraseMemoryInjection';
import { getChunksWithAllMatchesDisabled } from '../utils/memoryPreLaunchCheck';
import { saveChunkCheckpoint, setPipelineRunState } from '../services/pipelineService';
import { buildPipelineFingerprint } from '../utils/pipelineFingerprint';
import { calculateBlobBudget } from '../models/catalog';
import { stripFootnoteMarkers } from '../utils/footnoteExtractor';
import { buildBlobContext } from './pipeline/blobContext';
import type { BatchRunMode, ChunkOutcome, FinalChunkStatus } from './pipeline/blobContext';
import { runJudgeForChunk } from './pipeline/runJudge';
import { usePipelineAudit } from './usePipelineAudit';
import { logger } from '../utils/logger';

type ProviderCheck = { provider: string; model: string; label: string };

function buildProviderChecks(config: ReturnType<typeof usePipelineStore.getState>['config']): ProviderCheck[] {
  return [
    ...config.stages
      .filter((s) => s.enabled && s.provider !== 'deepl') // DeepL non usa preflight LLM
      .map((s, i) => ({
        provider: s.provider,
        model: s.model,
        label: `${s.name || `Stage ${i + 1}`} — ${s.provider} ${s.model}`,
      })),
    {
      provider: config.judgeProvider,
      model: config.judgeModel,
      label: `Judge — ${config.judgeProvider} ${config.judgeModel}`,
    },
  ];
}

function appendMemoryBlock(
  config: ReturnType<typeof usePipelineStore.getState>['config'],
  memoryBlock?: string,
) {
  if (!memoryBlock) return config.stages;
  return config.stages.map((stage) =>
    stage.enabled ? { ...stage, prompt: `${stage.prompt}\n\n${memoryBlock}` } : stage,
  );
}

/**
 * Hook that encapsulates pipeline execution logic.
 * Uses streaming for translation stages, non-streaming for judge.
 * Includes retry with exponential backoff and toast notifications.
 *
 * Public surface:
 *  - runPipeline / runAuditOnly: iterate over every chunk
 *  - runSingleChunk / auditSingleChunk: same logic restricted to one chunk
 *  - runDryRun: test-mode batch run
 *  - runCoherenceAudit: coherence check across all chunks
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
    clearChunkStages,
    requestCancel,
    setIsProcessing,
    setBlobAssignments,
  } = useChunksStore();
  const { config } = usePipelineStore();
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const { t } = useTranslation();

  const judgeActions = { updateChunkJudge, updateChunkStatus, t };

  /**
   * Run pre-flight checks for all providers referenced by the given list of
   * (provider, model, label) entries. Deduplicates by (provider, model).
   *
   * Returns true if the pipeline can proceed, false if it should be aborted.
   */
  const ensureProvidersReady = useCallback(async (checks: ProviderCheck[]) => {
    if (checks.length === 0) return true;

    const seen = new Set<string>();
    const dedupedChecks = checks.filter((c) => {
      const key = `${c.provider}:${c.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    pipelineLog.preflightStart(dedupedChecks.map((c) => `${c.provider}/${c.model}`));

    const toastId = toast.loading(t('preflight.checking'));

    let results: Awaited<ReturnType<typeof llmService.preflightPipeline>>;
    try {
      results = await llmService.preflightPipeline(dedupedChecks);
    } catch (error: unknown) {
      toast.dismiss(toastId);
      const msg = friendlyError(error instanceof Error ? error.message : String(error));
      pipelineLog.preflightInfraFailed(msg);
      toast.error(t('preflight.checkFailed'), { description: msg });
      return false;
    }

    toast.dismiss(toastId);

    const ollamaResults = results.filter((r) => r.provider === 'ollama');
    if (ollamaResults.length > 0) {
      const ollamaReachable = ollamaResults.some((r) => r.reachable === true);
      const allOllamaOk = ollamaResults.every((r) => r.ok);
      useConfigStore.getState().setOllamaStatus(ollamaReachable || allOllamaOk ? 'connected' : 'disconnected');
      const allModels = [...new Set(ollamaResults.flatMap((r) => r.availableModels ?? []))];
      if (allModels.length > 0) {
        useConfigStore.getState().setOllamaModels(allModels);
      } else if (!ollamaReachable) {
        useConfigStore.getState().setOllamaModels([]);
      }
    }

    const hasFailures = results.some((r) => !r.ok);
    if (hasFailures) {
      pipelineLog.preflightProviderIssues(
        results.filter((r) => !r.ok).map((r) => `${r.provider}/${r.model}: ${r.error}`),
      );
      return showPreflightDialog(results);
    }

    pipelineLog.preflightPassed();
    return true;
  }, [t]);

  // ── Audit sub-hook ──────────────────────────────────────────────────
  const { runAuditOnly, auditSingleChunk, runCoherenceAudit } = usePipelineAudit(ensureProvidersReady);

  // ── Internal helpers ────────────────────────────────────────────────

  const getChunkMemoryBlock = (chunkId: string): string | undefined => {
    if (!usePipelineStore.getState().config.usePhraseMemory) return undefined;
    const entry = usePhraseMemoryStore.getState().matchesByChunk.get(chunkId);
    if (!entry || entry.matches.length === 0) return undefined;
    const selected = entry.matches.filter((m) => entry.enabledMatchIds.has(m.id));
    return buildMemoryInjection(selected) ?? undefined;
  };

  const warnAsyncFailure = useCallback((scope: string, error: unknown, context?: Record<string, unknown>) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(scope, { ...context, error: message });
  }, []);

  const persistPipelineStatus = useCallback((pipelineId: string | null, status: 'running' | 'completed' | 'interrupted', fingerprint?: string) => {
    if (!pipelineId) return;
    void setPipelineRunState(pipelineId, status, fingerprint).catch((error: unknown) => {
      warnAsyncFailure('pipeline.runState.persist_failed', error, { pipelineId, status });
    });
  }, [warnAsyncFailure]);

  const persistChunkCheckpoint = useCallback((
    projectId: string | null,
    pipelineId: string | null,
    chunk: TranslationChunk | undefined,
    position: number,
  ) => {
    if (!projectId || !pipelineId || !chunk) return;
    void saveChunkCheckpoint(projectId, pipelineId, chunk, position).catch((error: unknown) => {
      warnAsyncFailure('pipeline.checkpoint.persist_failed', error, {
        projectId,
        pipelineId,
        chunkId: chunk.id,
        position,
      });
    });
  }, [warnAsyncFailure]);

  const computeBlobAssignments = useCallback(async (
    pipelineConfig: ReturnType<typeof usePipelineStore.getState>['config'],
    chunks: TranslationChunk[],
  ) => {
    try {
      const budget = (pipelineConfig.blobBudgetTokens ?? 0) > 0
        ? pipelineConfig.blobBudgetTokens!
        : calculateBlobBudget(pipelineConfig.stages).budget;
      const assignments = await llmService.computeBlobs(
        chunks.map((c) => ({ id: c.id, text: c.sourceProcessingText })),
        budget,
        pipelineConfig.blobOverlap ?? 1,
      );
      setBlobAssignments(assignments);
    } catch (error: unknown) {
      setBlobAssignments([]);
      const msg = error instanceof Error ? error.message : String(error);
      pipelineLog.blobComputeFailed(msg);
      toast.warning(t('pipeline.blobComputeFailed'), { description: msg });
    }
  }, [setBlobAssignments, t]);

  const runChunkExecution = useCallback(async (
    chunkId: string,
    options?: { finalStatus?: FinalChunkStatus; memoryBlock?: string },
  ) => {
    const finalStatus = options?.finalStatus ?? 'completed';
    const config = usePipelineStore.getState().config;
    if (useChunksStore.getState().isProcessing) return;
    const chunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    useOperationLogStore.getState().clearChunk(chunkId);
    pipelineLog.newRunMarker(chunkId);
    pipelineLog.singlePipelineStart(chunkId);
    if (!(await ensureProvidersReady(buildProviderChecks(config)))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    await computeBlobAssignments(config, useChunksStore.getState().chunks);

    const freshChunk = useChunksStore.getState().chunks.find((c) => c.id === chunkId) ?? chunk;
    const outcome = await executePipelineForChunk(freshChunk, {
      memoryBlock: options?.memoryBlock ?? getChunkMemoryBlock(chunkId),
    });

    if (outcome === 'completed' && finalStatus === 'preview') {
      updateChunkStatus(chunkId, 'preview');
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (outcome === 'cancelled') {
      pipelineLog.singlePipelineCancelled(chunkId);
      toast.message(t('pipeline.stopConfirmed'));
    } else if (outcome === 'completed') {
      pipelineLog.singlePipelineCompleted(chunkId);
      toast.success(finalStatus === 'preview' ? t('pipeline.dryRunChunkCompleted') : t('pipeline.singleChunkCompleted'));
    }
  }, [computeBlobAssignments, ensureProvidersReady, executePipelineForChunk, setIsProcessing, t, updateChunkStatus]);

  /**
   * Run all enabled translation stages and the audit for a single chunk.
   * Returns an outcome so the caller can aggregate batch counters.
   */
  async function executePipelineForChunk(
    chunk: TranslationChunk,
    options: { batchMode?: BatchRunMode; memoryBlock?: string },
  ): Promise<ChunkOutcome> {
    const config = usePipelineStore.getState().config;
    if (useChunksStore.getState().cancelRequested) return 'cancelled';
    if (options.batchMode === 'resume' && chunk.status === 'completed' && !chunk.translationStale) return 'skipped';
    if (options.batchMode === 'rerun-unlocked' && chunk.translationLocked) return 'skipped';

    clearChunkStages(chunk.id);
    pipelineLog.chunkStarted(chunk.id);
    updateChunkJudge(chunk.id, {
      content: '', status: 'idle', rating: 'fair', issues: [],
    });
    updateChunkDraft(chunk.id, '');

    let lastResult = '';
    let lastEffectiveConfig = config;
    let producedOutput = false;
    updateChunkStatus(chunk.id, 'processing');

    const stages = appendMemoryBlock(config, options.memoryBlock);

    for (const stage of stages) {
      if (!stage.enabled) continue;

      const liveChunks = useChunksStore.getState().chunks;
      const stageRole = stage.role ?? 'translation';
      const isFormatStage = stageRole === 'format';
      const blobContext = isFormatStage
        ? undefined
        : buildBlobContext(liveChunks, chunk.id, (c) => c.sourceProcessingText || undefined);
      const effectiveConfig = {
        ...config,
        ...(!config.persona && stage.sourceLanguage ? { sourceLanguage: stage.sourceLanguage } : {}),
        ...(!config.persona && stage.targetLanguage ? { targetLanguage: stage.targetLanguage } : {}),
        ...(blobContext ? { blobContext, blobCurrentChunkId: chunk.id } : {}),
      };
      lastEffectiveConfig = effectiveConfig;

      updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
      const stageRef = { provider: stage.provider, model: stage.model };
      pipelineLog.stageStart(chunk.id, stage.id, stage.name, stageRef);
      const stageStartedAt = Date.now();

      const onPrompt = (info: PromptInfo) => {
        setChunkStagePromptInfo(chunk.id, stage.id, info);
        pipelineLog.stagePrompt(chunk.id, stage.id, stageRef, info.systemPrompt, info.userPrompt);
      };
      const onIdleGrace = () => pipelineLog.idleGrace('stage', chunk.id, stage.id);

      const stageText = isFormatStage ? lastResult : stripFootnoteMarkers(chunk.sourceProcessingText);
      const stagePrevious = isFormatStage ? undefined : (lastResult || undefined);

      try {
        let capturedUsage: TokenUsage | undefined;
        let capturedBilledCharacters: number | undefined;
        const stageResult = await withRetry(
          async () => {
            capturedUsage = undefined;
            capturedBilledCharacters = undefined;
            updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
            if (stage.provider === 'deepl') {
              const deeplResult = await deeplService.runDeeplStage({
                text: stageText,
                sourceLang: effectiveConfig.sourceLanguage || undefined,
                targetLang: effectiveConfig.targetLanguage,
                deeplConfig: stage.providerOptions?.deepl,
              });
              capturedBilledCharacters = deeplResult.billedCharacters;
              return { content: deeplResult.content };
            }
            if (stage.provider === 'ollama') {
              const text = await llmService.runStageStream(
                stageText, stage, effectiveConfig, stagePrevious,
                (token) => appendChunkStageContent(chunk.id, stage.id, token),
                (usage) => { capturedUsage = usage; },
                onPrompt,
                onIdleGrace,
              );
              return { content: text };
            }
            return llmService.runStage(
              stageText, stage, effectiveConfig, stagePrevious,
              undefined,
              onPrompt,
              onIdleGrace,
            );
          },
          {
            label: `Stage "${stage.name}"`,
            onRetry: (attempt, total, error, delayMs) => {
              if (is429Error(error)) {
                updateChunkStage(chunk.id, stage.id, { content: '', status: 'retrying', retryInfo: { attempt, total, delayMs } });
              }
              pipelineLog.stageRetry(chunk.id, stage.id, attempt, total, error, delayMs);
            },
          },
        );
        const rawResult = stageResult.content;
        const result = isFormatStage && !rawResult.trim() ? stageText : rawResult;
        if (isFormatStage && !rawResult.trim() && stageText.trim()) {
          pipelineLog.stageNote(chunk.id, stage.id, 'warn', 'Format stage returned empty output; using previous stage output');
        }
        if (!capturedUsage && stageResult.inputTokens !== undefined && stageResult.outputTokens !== undefined) {
          capturedUsage = {
            inputTokens: stageResult.inputTokens,
            outputTokens: stageResult.outputTokens,
            cachedInputTokens: stageResult.cachedInputTokens,
            cacheMissInputTokens: stageResult.cacheMissInputTokens,
          };
        }
        if (result) {
          lastResult = result;
          producedOutput = true;
        }
        updateChunkStage(chunk.id, stage.id, {
          content: result,
          status: 'completed',
          ...(capturedUsage ? { tokenUsage: capturedUsage } : {}),
          ...(capturedBilledCharacters !== undefined ? { billedCharacters: capturedBilledCharacters } : {}),
        });
        pipelineLog.stageEnd(chunk.id, stage.id, stage.name, stageRef, Date.now() - stageStartedAt, capturedUsage);
      } catch (error: unknown) {
        const stageDurationMs = Date.now() - stageStartedAt;
        if (isStreamCancelledError(error)) {
          updateChunkStage(chunk.id, stage.id, { content: '', status: 'idle' });
          updateChunkStatus(chunk.id, 'ready');
          pipelineLog.stageCancelled(chunk.id, stage.id, stage.name, stageDurationMs);
          return 'cancelled';
        }
        const rawError = error instanceof Error ? error.message : String(error);
        const msg = friendlyError(rawError);
        updateChunkStage(chunk.id, stage.id, { content: '', status: 'error', error: msg });
        updateChunkStatus(chunk.id, 'error');
        pipelineLog.stageError(chunk.id, stage.id, stage.name, rawError, stageDurationMs);
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
      const auditOutcome = await runJudgeForChunk(chunk, lastResult, judgeActions, lastEffectiveConfig);
      if (auditOutcome === 'failed') return 'failed';
      if (auditOutcome === 'cancelled') return 'cancelled';
    }

    return 'completed';
  }

  // ── Exported callables ──────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const allChunks = useChunksStore.getState().chunks;
    if (allChunks.length === 0) return;

    const { pipelineMode, pipelineTestChunkCount } = useConfigStore.getState();
    const isTestMode = pipelineMode === 'test';
    const liveChunks = isTestMode ? allChunks.slice(0, pipelineTestChunkCount) : allChunks;
    if (config.usePhraseMemory) {
      const liveChunkIds = new Set(liveChunks.map((chunk) => chunk.id));
      const blockedChunks = getChunksWithAllMatchesDisabled(
        usePhraseMemoryStore.getState().matchesByChunk,
      ).filter((chunkId) => liveChunkIds.has(chunkId));
      if (blockedChunks.length > 0) {
        toast.warning(t('memory.prelaunchWarning', { count: blockedChunks.length }));
      }
    }

    pipelineLog.newRunMarker();
    pipelineLog.batchPipelineStart(liveChunks.length, config.stages.filter((s) => s.enabled).length);
    if (!(await ensureProvidersReady(buildProviderChecks(config)))) return;
    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);

    const pipelineState = usePipelineStore.getState();
    const batchMode: BatchRunMode = isTestMode || pipelineState.runStatus === 'completed'
      ? 'rerun-unlocked'
      : 'resume';
    const activePipelineId = useProjectStore.getState().activePipelineId;
    usePipelineStore.setState({
      runStatus: 'running',
      lastRunOutcome: null,
      lastRunConfig: buildPipelineFingerprint(config),
    });
    persistPipelineStatus(activePipelineId, 'running', buildPipelineFingerprint(config));
    await computeBlobAssignments(config, liveChunks);

    let errorCount = 0;
    let cancelled = false;

    try {
      for (const chunk of liveChunks) {
        const outcome = await executePipelineForChunk(chunk, { batchMode, memoryBlock: getChunkMemoryBlock(chunk.id) });
        if (outcome === 'cancelled') { cancelled = true; break; }
        if (outcome === 'failed') errorCount++;
        if ((outcome === 'completed' || outcome === 'failed') && activePipelineId) {
          const fresh = useChunksStore.getState().chunks.find((c) => c.id === chunk.id);
          const position = liveChunks.indexOf(chunk);
          const currentProjectId = useProjectStore.getState().currentProjectId;
          persistChunkCheckpoint(currentProjectId, activePipelineId, fresh, position);
        }
      }
    } finally {
      setIsProcessing(false);
      useChunksStore.getState().clearCancelRequest();
      const finalStatus = cancelled || errorCount > 0 ? 'interrupted' : 'completed';
      usePipelineStore.setState({
        runStatus: finalStatus,
        lastRunOutcome: cancelled ? 'cancelled' : errorCount > 0 ? 'error' : 'completed',
        lastRunConfig: buildPipelineFingerprint(config),
      });
      if (finalStatus === 'interrupted') {
        useProjectStore.getState().setRunInterrupted(true);
      }
      persistPipelineStatus(activePipelineId, finalStatus);
    }

    if (cancelled) {
      pipelineLog.batchPipelineCancelled();
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      pipelineLog.batchPipelineCompleted();
      toast.success(t('errors.pipelineCompleted'));
    } else {
      pipelineLog.batchPipelineCompletedWithErrors(errorCount);
      toast.warning(t('errors.pipelineCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages, ensureProvidersReady, setBlobAssignments]);

  const runSingleChunk = useCallback(async (chunkId: string, finalStatus: FinalChunkStatus = 'completed') => {
    await runChunkExecution(chunkId, { finalStatus });
  }, [runChunkExecution]);

  const runDryRun = useCallback(async () => {
    if (useChunksStore.getState().isProcessing) return;
    const allChunks = useChunksStore.getState().chunks;
    if (allChunks.length === 0) return;

    const requestedTestChunks = Math.max(1, useConfigStore.getState().pipelineTestChunkCount);
    const targets = allChunks
      .filter((c) => c.status === 'ready')
      .slice(0, requestedTestChunks);

    if (targets.length === 0) {
      toast.message(t('pipeline.dryRunNoTarget'));
      return;
    }

    pipelineLog.newRunMarker();
    pipelineLog.batchPipelineStart(targets.length, config.stages.filter((s) => s.enabled).length);
    if (!(await ensureProvidersReady(buildProviderChecks(config)))) return;

    useChunksStore.getState().clearCancelRequest();
    setIsProcessing(true);
    await computeBlobAssignments(config, allChunks);

    let completedPreviewCount = 0;
    let errorCount = 0;
    let cancelled = false;

    for (const target of targets) {
      const freshTarget = useChunksStore.getState().chunks.find((c) => c.id === target.id) ?? target;
      const outcome = await executePipelineForChunk(freshTarget, { memoryBlock: getChunkMemoryBlock(freshTarget.id) });

      if (outcome === 'cancelled') { cancelled = true; break; }

      if (outcome === 'completed') {
        updateChunkStatus(target.id, 'preview');
        const pipelineId = useProjectStore.getState().activePipelineId;
        const currentProjectId = useProjectStore.getState().currentProjectId;
        if (pipelineId && currentProjectId) {
          const saved = useChunksStore.getState().chunks.find((c) => c.id === target.id);
          const position = allChunks.indexOf(target);
          persistChunkCheckpoint(currentProjectId, pipelineId, saved, position);
        }
        completedPreviewCount++;
      } else if (outcome === 'failed') {
        errorCount++;
      }
    }

    setIsProcessing(false);
    useChunksStore.getState().clearCancelRequest();

    if (cancelled) {
      pipelineLog.batchPipelineCancelled();
      toast.message(t('pipeline.stopConfirmed'));
    } else if (completedPreviewCount > 0 && errorCount === 0) {
      pipelineLog.batchPipelineCompleted();
      toast.success(
        completedPreviewCount === 1
          ? t('pipeline.dryRunCompleted')
          : t('pipeline.dryRunCompletedMany', { count: completedPreviewCount }),
      );
    } else if (errorCount > 0) {
      pipelineLog.batchPipelineCompletedWithErrors(errorCount);
      toast.warning(
        completedPreviewCount > 0
          ? t('pipeline.dryRunCompletedMany', { count: completedPreviewCount })
          : t('errors.pipelineCompletedWithErrors', { count: errorCount }),
        completedPreviewCount > 0
          ? { description: t('errors.pipelineCompletedWithErrors', { count: errorCount }) }
          : undefined,
      );
    }
  }, [computeBlobAssignments, config, t, setIsProcessing, updateChunkStatus, updateChunkStage, appendChunkStageContent, setChunkStagePromptInfo, updateChunkJudge, updateChunkDraft, clearChunkStages, ensureProvidersReady, persistChunkCheckpoint]);

  const cancelPipeline = useCallback(() => {
    requestCancel();
    pipelineLog.cancelRequested();
    const streamId = useChunksStore.getState().activeStreamId;
    if (streamId) {
      void llmService.cancelStream(streamId).catch((error: unknown) => {
        warnAsyncFailure('pipeline.cancel.backend_failed', error, { streamId });
      });
    }
    toast.message(t('pipeline.stopRequested'));
  }, [requestCancel, t, warnAsyncFailure]);

  const rerunChunkWithMemory = useCallback(async (
    chunkId: string,
    selectedMatches: PhraseMemoryMatch[],
  ) => {
    const memoryBlock = buildMemoryInjection(selectedMatches);
    await runChunkExecution(chunkId, { memoryBlock: memoryBlock ?? undefined });
  }, [runChunkExecution]);

  return {
    runPipeline,
    runSingleChunk,
    rerunChunkWithMemory,
    runDryRun,
    runAuditOnly,
    auditSingleChunk,
    runCoherenceAudit,
    cancelPipeline,
    isProcessing,
  };
}
