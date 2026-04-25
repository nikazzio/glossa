import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../stores/pipelineStore';
import { llmService } from '../services/llmService';
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
    chunks,
    isProcessing,
    setIsProcessing,
    setChunks,
    updateChunkStage,
    appendChunkStageContent,
    updateChunkJudge,
    updateChunkDraft,
    updateChunkStatus,
    requestCancel,
  } = usePipelineStore();
  const { t } = useTranslation();

  const runPipeline = useCallback(async () => {
    if (chunks.length === 0) return;
    usePipelineStore.getState().clearCancelRequest();
    setIsProcessing(true);

    // Clear previous results
    setChunks((prev) =>
      prev.map((c) => ({
        ...c,
        status: 'ready' as const,
        stageResults: {},
        judgeResult: { content: '', status: 'idle' as const, rating: qualityDefault(), issues: [] },
        currentDraft: '',
      }))
    );

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of chunks) {
      if (usePipelineStore.getState().cancelRequested) {
        cancelled = true;
        break;
      }

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
  }, [chunks, config, t, setIsProcessing, setChunks, updateChunkStage, appendChunkStageContent, updateChunkJudge, updateChunkDraft, updateChunkStatus]);

  const runAuditOnly = useCallback(async () => {
    if (chunks.length === 0) return;
    usePipelineStore.getState().clearCancelRequest();
    setIsProcessing(true);

    let errorCount = 0;
    let cancelled = false;

    for (const chunk of chunks) {
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
  }, [chunks, config, t, setIsProcessing, updateChunkJudge, updateChunkStatus]);

  const cancelPipeline = useCallback(() => {
    requestCancel();
    toast.message(t('pipeline.stopRequested'));
  }, [requestCancel, t]);

  return { runPipeline, runAuditOnly, cancelPipeline, isProcessing };
}
