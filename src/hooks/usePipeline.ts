import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { llmService, isStreamCancelledError } from '../services/llmService';
import { withRetry, friendlyError } from '../utils/retry';
import { qualityDefault, qualityFailure } from '../utils';
import type { JudgeResult } from '../types';

/**
 * Hook that encapsulates pipeline execution logic.
 * Uses streaming for translation stages, non-streaming for judge.
 * Includes retry with exponential backoff and toast notifications.
 */
export function usePipeline() {
  const {
    config,
    isProcessing,
    setIsProcessing,
    updateChunkStage,
    appendChunkStageContent,
    updateChunkJudge,
    updateChunkDraft,
    updateChunkStatus,
    clearChunkStages,
    requestCancel,
  } = usePipelineStore();
  const { t } = useTranslation();

  const runPipeline = useCallback(async () => {
    if (usePipelineStore.getState().isProcessing) return;
    // Read chunks from the store at invocation time so callers that
    // mutate the store right before invoking us (e.g. the "Re-run all"
    // button which resetCompletedChunks() then runPipeline()) see the
    // freshest state instead of a stale useCallback closure.
    const liveChunks = usePipelineStore.getState().chunks;
    if (liveChunks.length === 0) return;
    usePipelineStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of liveChunks) {
      if (usePipelineStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }

      // Skip already-translated chunks. The user can call
      // resetCompletedChunks() ("Re-run all" button) before runPipeline
      // if they really want to redo everything; otherwise we preserve
      // their work.
      if (chunk.status === 'completed') continue;

      // Reset only the chunk we are about to process. Siblings keep
      // their existing translations and audits. Wipe stage results
      // too so a previous run's later-stage output doesn't linger
      // when the new run fails or cancels at an earlier stage.
      clearChunkStages(chunk.id);
      updateChunkJudge(chunk.id, {
        content: '', status: 'idle', rating: qualityDefault(), issues: [],
      });
      updateChunkDraft(chunk.id, '');

      let lastResult = '';
      let hadStageFailure = false;
      updateChunkStatus(chunk.id, 'processing');

      for (const stage of config.stages) {
        if (!stage.enabled) continue;

        updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
        try {
          const result = await withRetry(
            async () => {
              // Reset content for each retry attempt
              updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
              return llmService.runStageStream(
                chunk.originalText, stage, config, lastResult || undefined,
                (token) => appendChunkStageContent(chunk.id, stage.id, token),
              );
            },
            { label: `Stage "${stage.name}"` },
          );
          lastResult = result;
          updateChunkStage(chunk.id, stage.id, { content: result, status: 'completed' });
        } catch (error: any) {
          if (isStreamCancelledError(error)) {
            // User-initiated cancel: clear the in-flight stage placeholder
            // and reset the chunk status so the UI does not show a stuck
            // "processing" badge after the toast confirms the stop.
            updateChunkStage(chunk.id, stage.id, { content: '', status: 'idle' });
            updateChunkStatus(chunk.id, 'ready');
            cancelled = true;
            break;
          }
          errorCount++;
          const msg = friendlyError(error.message ?? String(error));
          updateChunkStage(chunk.id, stage.id, {
            content: '',
            status: 'error',
            error: msg,
          });
          updateChunkStatus(chunk.id, 'error');
          hadStageFailure = true;
          toast.error(t('errors.stageFailed', { name: stage.name }), { description: msg });
          break;
        }
      }
      if (cancelled) break;

      if (lastResult) {
        updateChunkDraft(chunk.id, lastResult);
      }

      // Final Audit (Judge) — non-streaming since it returns structured JSON
      if (lastResult) {
        updateChunkJudge(chunk.id, { content: '', status: 'processing', rating: qualityDefault(), issues: [] });
        try {
          const judgeData = await withRetry(
            () => llmService.judgeTranslation(chunk.originalText, lastResult, config),
            { label: 'Audit' },
          );
          updateChunkJudge(chunk.id, {
            ...judgeData,
            content: lastResult,
            status: 'completed',
          } as JudgeResult);
          updateChunkStatus(chunk.id, 'completed');
        } catch (error: any) {
          errorCount++;
          const msg = friendlyError(error.message ?? String(error));
          updateChunkJudge(chunk.id, {
            content: lastResult,
            status: 'error',
            rating: qualityFailure(),
            issues: [],
            error: msg,
          });
          updateChunkStatus(chunk.id, 'error');
          toast.error(t('errors.auditFailed'), { description: msg });
        }
      }

      if (!lastResult && !hadStageFailure) {
        updateChunkStatus(chunk.id, 'ready');
      }

      if (usePipelineStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }
    }

    setIsProcessing(false);
    usePipelineStore.getState().clearCancelRequest();

    if (cancelled) {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      toast.success(t('errors.pipelineCompleted'));
    } else {
      toast.warning(t('errors.pipelineCompletedWithErrors', { count: errorCount }));
    }
  }, [config, t, setIsProcessing, updateChunkStage, appendChunkStageContent, updateChunkJudge, updateChunkDraft, updateChunkStatus, clearChunkStages]);

  const runAuditOnly = useCallback(async () => {
    if (usePipelineStore.getState().isProcessing) return;
    const liveChunks = usePipelineStore.getState().chunks;
    if (liveChunks.length === 0) return;
    usePipelineStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of liveChunks) {
      if (usePipelineStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }

      const textToAudit = chunk.currentDraft;
      if (!textToAudit) continue;

      updateChunkStatus(chunk.id, 'processing');
      updateChunkJudge(chunk.id, { content: '', status: 'processing', rating: qualityDefault(), issues: [] });
      try {
        const judgeData = await withRetry(
          () => llmService.judgeTranslation(chunk.originalText, textToAudit, config),
          { label: 'Audit' },
        );
        updateChunkJudge(chunk.id, {
          ...judgeData,
          content: textToAudit,
          status: 'completed',
        } as JudgeResult);
        updateChunkStatus(chunk.id, 'completed');
      } catch (error: any) {
        errorCount++;
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
      }

      if (usePipelineStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }
    }

    setIsProcessing(false);
    usePipelineStore.getState().clearCancelRequest();

    if (cancelled) {
      toast.message(t('pipeline.stopConfirmed'));
    } else if (errorCount === 0) {
      toast.success(t('errors.reEvalCompleted'));
    }
  }, [config, t, setIsProcessing, updateChunkJudge, updateChunkStatus]);

  const cancelPipeline = useCallback(() => {
    requestCancel();
    const streamId = usePipelineStore.getState().activeStreamId;
    if (streamId) {
      // Best-effort: tell the backend to drop the in-flight HTTP request
      // so the provider stops billing immediately. Failures are silent
      // because the cancelRequested flag will still stop the loop between
      // chunks.
      llmService.cancelStream(streamId).catch(() => {});
    }
    toast.message(t('pipeline.stopRequested'));
  }, [requestCancel, t]);

  return { runPipeline, runAuditOnly, cancelPipeline, isProcessing };
}
