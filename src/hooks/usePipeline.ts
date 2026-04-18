import { useCallback } from 'react';
import { usePipelineStore } from '../stores/pipelineStore';
import { llmService } from '../services/llmService';
import type { JudgeResult } from '../types';

/**
 * Hook that encapsulates pipeline execution logic.
 * Returns `runPipeline`, `runAuditOnly`, and the processing state.
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

    for (const chunk of chunks) {
      let lastResult = '';

      for (const stage of config.stages) {
        if (!stage.enabled) continue;

        updateChunkStage(chunk.id, stage.id, { content: '', status: 'processing' });
        try {
          const result = await llmService.runStage(chunk.originalText, stage, config, lastResult);
          lastResult = result;
          updateChunkStage(chunk.id, stage.id, { content: result, status: 'completed' });
        } catch (error: any) {
          updateChunkStage(chunk.id, stage.id, {
            content: '',
            status: 'error',
            error: error.message,
          });
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
          const judgeData = await llmService.judgeTranslation(chunk.originalText, lastResult, config);
          updateChunkJudge(chunk.id, {
            ...judgeData,
            content: lastResult,
            status: 'completed',
          } as JudgeResult);
        } catch (error: any) {
          updateChunkJudge(chunk.id, {
            content: lastResult,
            status: 'error',
            score: 0,
            issues: [],
            error: error.message,
          });
        }
      }
    }

    setIsProcessing(false);
  }, [chunks, config, setIsProcessing, setChunks, updateChunkStage, updateChunkJudge, updateChunkDraft]);

  const runAuditOnly = useCallback(async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);

    for (const chunk of chunks) {
      const textToAudit = chunk.currentDraft;
      if (!textToAudit) continue;

      updateChunkJudge(chunk.id, { content: '', status: 'processing', score: 0, issues: [] });
      try {
        const judgeData = await llmService.judgeTranslation(chunk.originalText, textToAudit, config);
        updateChunkJudge(chunk.id, {
          ...judgeData,
          content: textToAudit,
          status: 'completed',
        } as JudgeResult);
      } catch (error: any) {
        updateChunkJudge(chunk.id, {
          content: textToAudit,
          status: 'error',
          score: 0,
          issues: [],
          error: error.message,
        });
      }
    }

    setIsProcessing(false);
  }, [chunks, config, setIsProcessing, updateChunkJudge]);

  return { runPipeline, runAuditOnly, isProcessing };
}
