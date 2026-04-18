import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePipelineStore } from '../stores/pipelineStore';
import { llmService } from '../services/llmService';
import { withRetry, friendlyError } from '../utils/retry';
import type { JudgeResult } from '../types';

/**
 * Hook that encapsulates pipeline execution logic.
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
    updateChunkJudge,
    updateChunkDraft,
  } = usePipelineStore();

  const runPipeline = useCallback(async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);

    // Clear previous results
    setChunks((prev) =>
      prev.map((c) => ({
        ...c,
        stageResults: {},
        judgeResult: { content: '', status: 'idle' as const, score: 0, issues: [] },
        currentDraft: '',
      }))
    );

    let errorCount = 0;

    for (const chunk of chunks) {
      let lastResult = '';

      for (const stage of config.stages) {
        if (!stage.enabled) continue;

        updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
        try {
          const result = await withRetry(
            () => llmService.runStage(chunk.originalText, stage, config, lastResult),
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
          toast.error(`Stage "${stage.name}" failed`, { description: msg });
          break;
        }
      }

      if (lastResult) {
        updateChunkDraft(chunk.id, lastResult);
      }

      // Final Audit (Judge)
      if (lastResult) {
        updateChunkJudge(chunk.id, { content: '', status: 'processing', score: 0, issues: [] });
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
        } catch (error: any) {
          errorCount++;
          const msg = friendlyError(error.message ?? String(error));
          updateChunkJudge(chunk.id, {
            content: lastResult,
            status: 'error',
            score: 0,
            issues: [],
            error: msg,
          });
          toast.error('Audit failed', { description: msg });
        }
      }
    }

    setIsProcessing(false);

    if (errorCount === 0) {
      toast.success('Pipeline completed successfully');
    } else {
      toast.warning(`Pipeline completed with ${errorCount} error(s)`);
    }
  }, [chunks, config, setIsProcessing, setChunks, updateChunkStage, updateChunkJudge, updateChunkDraft]);

  const runAuditOnly = useCallback(async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);

    let errorCount = 0;

    for (const chunk of chunks) {
      const textToAudit = chunk.currentDraft;
      if (!textToAudit) continue;

      updateChunkJudge(chunk.id, { content: '', status: 'processing', score: 0, issues: [] });
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
      } catch (error: any) {
        errorCount++;
        const msg = friendlyError(error.message ?? String(error));
        updateChunkJudge(chunk.id, {
          content: textToAudit,
          status: 'error',
          score: 0,
          issues: [],
          error: msg,
        });
        toast.error('Audit failed', { description: msg });
      }
    }

    setIsProcessing(false);

    if (errorCount === 0) {
      toast.success('Re-evaluation completed');
    }
  }, [chunks, config, setIsProcessing, updateChunkJudge]);

  return { runPipeline, runAuditOnly, isProcessing };
}
