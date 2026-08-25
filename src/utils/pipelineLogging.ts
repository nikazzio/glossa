import { logOperation, type OperationLogEntry } from '../stores/operationLogStore';
import { usePricingStore } from '../stores/pricingStore';
import { costForEntry } from './operationLogStats';
import { incrementChunkUsageTotals } from '../services/pipelineService';
import { logger } from './logger';
import type { TokenUsage } from '../types';

interface ProviderRef {
  provider: string;
  model: string;
}

function usageMeta(usage?: TokenUsage): Record<string, unknown> {
  if (!usage) return {};
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
    ...(usage.cacheMissInputTokens !== undefined ? { cacheMissInputTokens: usage.cacheMissInputTokens } : {}),
  };
}

type UsageFields = Pick<
  OperationLogEntry,
  'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheMissInputTokens' | 'costUsd' | 'isFree'
>;

/**
 * Campi tipizzati di primo livello (oltre a `meta`, invariato per i lettori
 * già esistenti) — `costUsd` è calcolato QUI, con il listino prezzi in vigore
 * in questo momento, e resta congelato: non va più ricalcolato in lettura con
 * il listino di domani, altrimenti un'analisi storica dei costi userebbe
 * prezzi sbagliati per le chiamate passate.
 */
function usageFields(ref: ProviderRef, usage?: TokenUsage): UsageFields {
  const isFree = ref.provider === 'ollama';
  const pricingOverrides = usePricingStore.getState().overrides;
  const costUsd = isFree
    ? 0
    : costForEntry(
        { provider: ref.provider, model: ref.model, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens },
        pricingOverrides,
      );
  return {
    provider: ref.provider,
    model: ref.model,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    cachedInputTokens: usage?.cachedInputTokens,
    cacheMissInputTokens: usage?.cacheMissInputTokens,
    isFree,
    ...(costUsd != null ? { costUsd } : {}),
  };
}

/**
 * Accumula sul frammento il contatore ridondante (fonte robusta per il
 * numero semplice mostrato in UI, non dipende dal collegamento coi log di
 * dettaglio). Scrittura fire-and-forget come il resto del logging operazioni
 * — un fallimento qui non deve bloccare la pipeline, solo finire nei log
 * tecnici.
 */
function bumpChunkUsageTotals(chunkId: string, usage: TokenUsage | undefined, costUsd: number | null | undefined, durationMs: number): void {
  if (!usage) return;
  void incrementChunkUsageTotals(chunkId, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    usd: costUsd ?? 0,
    durationMs,
  }).catch((error: unknown) => {
    logger.warn('operationLog.chunkUsageTotals_failed', {
      chunkId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function promptDetail(systemPrompt: string, userPrompt: string): string {
  return `[system]\n${systemPrompt}\n\n[user]\n${userPrompt}`;
}

/**
 * Focused logging helpers for the pipeline runner. Each helper builds a
 * structured OperationLogEntry with the right scope, phase, durationMs, and
 * detailKind so the viewer can group and render events consistently.
 */
export const pipelineLog = {
  // ── Pipeline scope (batch / single, audit-only / pipeline / coherence) ──

  newRunMarker(chunkId?: string): void {
    logOperation({
      level: 'info',
      scope: 'pipeline',
      message: 'New run',
      meta: { runBoundary: true },
      ...(chunkId ? { chunkId } : {}),
    });
  },

  batchPipelineStart(chunkCount: number, enabledStageCount: number): void {
    logOperation({
      level: 'info',
      scope: 'pipeline',
      phase: 'start',
      message: 'Batch pipeline run started',
      meta: { chunks: chunkCount, stages: enabledStageCount },
    });
  },

  batchPipelineCancelled(): void {
    logOperation({ level: 'warn', scope: 'pipeline', phase: 'end', message: 'Batch pipeline run was cancelled by the user' });
  },

  batchPipelineCompleted(): void {
    logOperation({ level: 'success', scope: 'pipeline', phase: 'end', message: 'Batch pipeline run completed successfully' });
  },

  batchPipelineCompletedWithErrors(errorCount: number): void {
    logOperation({
      level: 'warn',
      scope: 'pipeline',
      phase: 'end',
      message: 'Batch pipeline run completed, but some chunks failed',
      meta: { errorCount },
    });
  },

  singlePipelineStart(chunkId: string): void {
    logOperation({ level: 'info', scope: 'pipeline', phase: 'start', message: 'Single chunk pipeline run started', chunkId });
  },

  singlePipelineCompleted(chunkId: string): void {
    logOperation({ level: 'success', scope: 'pipeline', phase: 'end', message: 'Single chunk pipeline run completed', chunkId });
  },

  singlePipelineCancelled(chunkId: string): void {
    logOperation({ level: 'warn', scope: 'pipeline', phase: 'end', message: 'Single chunk pipeline run was cancelled', chunkId });
  },

  cancelRequested(): void {
    logOperation({
      level: 'warn',
      scope: 'pipeline',
      message: 'Cancellation requested; the current in-flight work is being asked to stop',
    });
  },

  blobComputeFailed(error: string): void {
    logOperation({
      level: 'warn',
      scope: 'pipeline',
      message: 'Blob computation failed, continuing without blob context',
      meta: { error },
    });
  },

  // ── Preflight ──

  preflightStart(checks: string[]): void {
    logOperation({
      level: 'info',
      scope: 'preflight',
      phase: 'start',
      message: 'Running pre-flight provider checks',
      meta: { checks },
    });
  },

  preflightInfraFailed(error: string): void {
    logOperation({
      level: 'error',
      scope: 'preflight',
      phase: 'end',
      message: 'Pre-flight check itself failed to run',
      meta: { error },
    });
  },

  preflightProviderIssues(failures: string[]): void {
    logOperation({
      level: 'warn',
      scope: 'preflight',
      phase: 'end',
      message: 'Pre-flight check found provider configuration issues',
      meta: { failures },
    });
  },

  preflightPassed(): void {
    logOperation({
      level: 'success',
      scope: 'preflight',
      phase: 'end',
      message: 'Pre-flight check passed — all providers ready',
    });
  },

  // ── Chunk scope ──

  chunkStarted(chunkId: string): void {
    logOperation({
      level: 'info',
      scope: 'chunk',
      phase: 'start',
      message: 'Pipeline started',
      chunkId,
    });
  },

  // ── Stage scope ──

  stageStart(chunkId: string, stageId: string, stageName: string, ref: ProviderRef): void {
    logOperation({
      level: 'info',
      scope: 'stage',
      phase: 'start',
      message: `Stage "${stageName}" started`,
      chunkId,
      stageId,
      meta: { stageName, provider: ref.provider, model: ref.model },
    });
  },

  stagePrompt(chunkId: string, stageId: string, ref: ProviderRef, systemPrompt: string, userPrompt: string): void {
    logOperation({
      level: 'info',
      scope: 'stage',
      message: `prompt → ${ref.provider}/${ref.model}`,
      chunkId,
      stageId,
      detail: promptDetail(systemPrompt, userPrompt),
      detailKind: 'prompt',
    });
  },

  stageEnd(chunkId: string, stageId: string, stageName: string, ref: ProviderRef, durationMs: number, usage?: TokenUsage): void {
    const fields = usageFields(ref, usage);
    logOperation({
      level: 'success',
      scope: 'stage',
      phase: 'end',
      message: `Stage "${stageName}" completed`,
      chunkId,
      stageId,
      durationMs,
      meta: { stageName, provider: ref.provider, model: ref.model, ...usageMeta(usage) },
      ...fields,
    });
    bumpChunkUsageTotals(chunkId, usage, fields.costUsd, durationMs);
  },

  stageRetry(chunkId: string, stageId: string, attempt: number, total: number, error: string, delayMs: number): void {
    logOperation({
      level: 'warn',
      scope: 'stage',
      phase: 'retry',
      message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
      chunkId,
      stageId,
      meta: { error, attempt, total, delayMs },
      attemptNumber: attempt,
      maxAttempts: total,
    });
  },

  stageError(chunkId: string, stageId: string, stageName: string, error: string, durationMs?: number): void {
    logOperation({
      level: 'error',
      scope: 'stage',
      phase: 'end',
      message: `Stage "${stageName}" failed`,
      chunkId,
      stageId,
      ...(durationMs !== undefined ? { durationMs } : {}),
      meta: { error },
      detail: error,
      detailKind: 'error',
    });
  },

  stageCancelled(chunkId: string, stageId: string, stageName: string, durationMs?: number): void {
    logOperation({
      level: 'warn',
      scope: 'stage',
      phase: 'end',
      message: `Stage "${stageName}" was cancelled`,
      chunkId,
      stageId,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
  },

  stageNote(chunkId: string, stageId: string, level: 'info' | 'warn', message: string): void {
    logOperation({
      level,
      scope: 'stage',
      message,
      chunkId,
      stageId,
    });
  },

  // ── Audit scope (judge) ──

  auditBatchStart(chunkCount: number): void {
    logOperation({ level: 'info', scope: 'audit', phase: 'start', message: 'Batch audit run started', meta: { chunks: chunkCount } });
  },

  auditBatchCancelled(): void {
    logOperation({ level: 'warn', scope: 'audit', phase: 'end', message: 'Batch audit run was cancelled by the user' });
  },

  auditBatchCompleted(): void {
    logOperation({ level: 'success', scope: 'audit', phase: 'end', message: 'Batch audit run completed successfully' });
  },

  auditSingleStart(chunkId: string): void {
    logOperation({ level: 'info', scope: 'audit', phase: 'start', message: 'Single chunk audit started', chunkId });
  },

  auditSingleCancelled(chunkId: string): void {
    logOperation({ level: 'warn', scope: 'audit', phase: 'end', message: 'Single chunk audit was cancelled', chunkId });
  },

  auditSingleCompleted(chunkId: string): void {
    logOperation({ level: 'success', scope: 'audit', phase: 'end', message: 'Single chunk audit completed', chunkId });
  },

  auditStart(chunkId: string, ref: ProviderRef): void {
    logOperation({
      level: 'info',
      scope: 'audit',
      phase: 'start',
      message: 'Audit started',
      chunkId,
      meta: { provider: ref.provider, model: ref.model },
    });
  },

  auditPrompt(chunkId: string, ref: ProviderRef, systemPrompt: string, userPrompt: string): void {
    logOperation({
      level: 'info',
      scope: 'audit',
      message: `prompt → ${ref.provider}/${ref.model}`,
      chunkId,
      detail: promptDetail(systemPrompt, userPrompt),
      detailKind: 'prompt',
    });
  },

  auditResponse(chunkId: string, rawJson: string): void {
    logOperation({
      level: 'info',
      scope: 'audit',
      message: 'Audit response received',
      chunkId,
      detail: rawJson,
      detailKind: 'json',
    });
  },

  auditEnd(chunkId: string, ref: ProviderRef, durationMs: number, usage?: TokenUsage): void {
    const fields = usageFields(ref, usage);
    logOperation({
      level: 'success',
      scope: 'audit',
      phase: 'end',
      message: 'Audit completed',
      chunkId,
      durationMs,
      meta: { provider: ref.provider, model: ref.model, ...usageMeta(usage) },
      ...fields,
    });
    bumpChunkUsageTotals(chunkId, usage, fields.costUsd, durationMs);
  },

  auditRetry(chunkId: string, attempt: number, total: number, error: string, delayMs: number): void {
    logOperation({
      level: 'warn',
      scope: 'audit',
      phase: 'retry',
      message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
      chunkId,
      meta: { error, attempt, total, delayMs },
      attemptNumber: attempt,
      maxAttempts: total,
    });
  },

  auditError(chunkId: string, error: string, durationMs?: number): void {
    logOperation({
      level: 'error',
      scope: 'audit',
      phase: 'end',
      message: 'Audit failed',
      chunkId,
      ...(durationMs !== undefined ? { durationMs } : {}),
      meta: { error },
      detail: error,
      detailKind: 'error',
    });
  },

  // ── Coherence scope ──

  coherenceBatchStart(chunkCount: number): void {
    logOperation({
      level: 'info',
      scope: 'coherence',
      phase: 'start',
      message: 'Cross-chunk coherence audit started',
      meta: { chunks: chunkCount },
    });
  },

  coherenceBatchCancelled(): void {
    logOperation({ level: 'warn', scope: 'coherence', phase: 'end', message: 'Cross-chunk coherence audit was cancelled' });
  },

  coherenceBatchCompleted(): void {
    logOperation({ level: 'success', scope: 'coherence', phase: 'end', message: 'Cross-chunk coherence audit completed' });
  },

  coherenceBatchCompletedWithErrors(errorCount: number): void {
    logOperation({
      level: 'warn',
      scope: 'coherence',
      phase: 'end',
      message: 'Cross-chunk coherence audit completed with errors',
      meta: { errorCount },
    });
  },

  coherenceChunkStart(chunkId: string, ref: ProviderRef): void {
    logOperation({
      level: 'info',
      scope: 'coherence',
      phase: 'start',
      message: 'Coherence check started',
      chunkId,
      meta: { provider: ref.provider, model: ref.model },
    });
  },

  coherencePrompt(chunkId: string, ref: ProviderRef, systemPrompt: string, userPrompt: string): void {
    logOperation({
      level: 'info',
      scope: 'coherence',
      message: `prompt → ${ref.provider}/${ref.model}`,
      chunkId,
      detail: promptDetail(systemPrompt, userPrompt),
      detailKind: 'prompt',
    });
  },

  coherenceResponse(chunkId: string, rawJson: string): void {
    logOperation({
      level: 'info',
      scope: 'coherence',
      message: 'Coherence response received',
      chunkId,
      detail: rawJson,
      detailKind: 'json',
    });
  },

  coherenceChunkEnd(chunkId: string, ref: ProviderRef, durationMs: number, issueCount: number, usage?: TokenUsage): void {
    const fields = usageFields(ref, usage);
    logOperation({
      level: 'success',
      scope: 'coherence',
      phase: 'end',
      message: 'Coherence check completed',
      chunkId,
      durationMs,
      meta: { provider: ref.provider, model: ref.model, issues: issueCount, ...usageMeta(usage) },
      ...fields,
    });
    bumpChunkUsageTotals(chunkId, usage, fields.costUsd, durationMs);
  },

  coherenceRetry(chunkId: string, attempt: number, total: number, error: string, delayMs: number): void {
    logOperation({
      level: 'warn',
      scope: 'coherence',
      phase: 'retry',
      message: `Retry ${attempt}/${total} — waiting ${delayMs}ms`,
      chunkId,
      meta: { error, attempt, total, delayMs },
      attemptNumber: attempt,
      maxAttempts: total,
    });
  },

  coherenceChunkError(chunkId: string, error: string, durationMs?: number): void {
    logOperation({
      level: 'error',
      scope: 'coherence',
      phase: 'end',
      message: 'Coherence check failed',
      chunkId,
      ...(durationMs !== undefined ? { durationMs } : {}),
      meta: { error },
      detail: error,
      detailKind: 'error',
    });
  },

  // ── Idle/keep-alive (Ollama) ──

  idleGrace(scope: 'stage' | 'audit' | 'coherence', chunkId?: string, stageId?: string): void {
    logOperation({
      level: 'info',
      scope,
      message: 'Ollama still alive — idle grace check passed, waiting for more tokens',
      ...(chunkId ? { chunkId } : {}),
      ...(stageId ? { stageId } : {}),
    });
  },
};
