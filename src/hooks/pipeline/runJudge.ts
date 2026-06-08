import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { llmService } from '../../services/llmService';
import { withRetry, friendlyError } from '../../utils/retry';
import { qualityDefault, qualityFailure } from '../../utils';
import { pipelineLog } from '../../utils/pipelineLogging';
import { stripFootnoteMarkers } from '../../utils/footnoteExtractor';
import type { ChunkStatus, JudgeResult, PromptInfo, ResponseInfo, TranslationChunk } from '../../types';
import type { ChunkOutcome } from './blobContext';

export type JudgeActions = {
  updateChunkJudge: (id: string, result: JudgeResult) => void;
  updateChunkStatus: (id: string, status: ChunkStatus) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

/**
 * Run the judge call for a single chunk.
 *
 * Used both at the end of executePipelineForChunk (pipeline flow) and as the
 * body of runAuditOnly / auditSingleChunk (re-audit flow).
 *
 * `textToAudit` is what we send to the judge — for the pipeline flow this is
 * the latest stage output; for re-audit it is chunk.translationProcessingText.
 */
export async function runJudgeForChunk(
  chunk: TranslationChunk,
  textToAudit: string | undefined,
  actions: JudgeActions,
  effectiveConfig?: ReturnType<typeof usePipelineStore.getState>['config'],
): Promise<ChunkOutcome> {
  const config = usePipelineStore.getState().config;
  if (!textToAudit) return 'skipped';

  actions.updateChunkStatus(chunk.id, 'processing');
  const judgeRef = {
    provider: (effectiveConfig ?? config).judgeProvider,
    model: (effectiveConfig ?? config).judgeModel,
  };
  pipelineLog.auditStart(chunk.id, judgeRef);
  const auditStartedAt = Date.now();
  actions.updateChunkJudge(chunk.id, {
    content: '', status: 'processing', rating: qualityDefault(), issues: [],
  });

  try {
    const judgeData = await withRetry(
      () => llmService.judgeTranslation(
        stripFootnoteMarkers(chunk.sourceProcessingText),
        textToAudit,
        effectiveConfig ?? config,
        (info: PromptInfo) => pipelineLog.auditPrompt(chunk.id, judgeRef, info.systemPrompt, info.userPrompt),
        (info: ResponseInfo) => pipelineLog.auditResponse(chunk.id, info.rawJson),
      ),
      {
        label: 'Audit',
        onRetry: (attempt, total, error, delayMs) =>
          pipelineLog.auditRetry(chunk.id, attempt, total, error, delayMs),
      },
    );

    const judgeTokenUsage =
      judgeData.inputTokens !== undefined && judgeData.outputTokens !== undefined
        ? {
            inputTokens: judgeData.inputTokens,
            outputTokens: judgeData.outputTokens,
            cachedInputTokens: judgeData.cachedInputTokens,
            cacheMissInputTokens: judgeData.cacheMissInputTokens,
          }
        : undefined;

    actions.updateChunkJudge(chunk.id, {
      ...judgeData,
      content: textToAudit,
      status: 'completed',
      ...(judgeTokenUsage ? { tokenUsage: judgeTokenUsage } : {}),
    } as JudgeResult);
    actions.updateChunkStatus(chunk.id, 'completed');
    pipelineLog.auditEnd(chunk.id, judgeRef, Date.now() - auditStartedAt, judgeTokenUsage);
    return 'completed';
  } catch (error: unknown) {
    const msg = friendlyError(error instanceof Error ? error.message : String(error));
    actions.updateChunkJudge(chunk.id, {
      content: textToAudit,
      status: 'error',
      rating: qualityFailure(),
      issues: [],
      error: msg,
    });
    actions.updateChunkStatus(chunk.id, 'error');
    pipelineLog.auditError(chunk.id, msg, Date.now() - auditStartedAt);
    toast.error(actions.t('errors.auditFailed'), { description: msg });
    return 'failed';
  }
}
