import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { isStreamCancelledError, llmService } from '../../services/llmService';
import { withRetry, friendlyError } from '../../utils/retry';
import { qualityDefault, qualityFailure } from '../../utils';
import { pipelineLog } from '../../utils/pipelineLogging';
import { stripFootnoteMarkers } from '../../utils/footnoteExtractor';
import type { ChunkStatus, JudgeResult, PromptInfo, ResponseInfo, TranslationChunk } from '../../types';
import type { ChunkOutcome } from './blobContext';
import {
  recordFailedModelCall,
  recordJudgement,
  recordModelCall,
} from '../../services/pipelineProvenance';
import { revisionIdForText } from '../../services/translationRevisionsService';
import { contentHash } from '../../services/provenanceService';

/**
 * Lo stadio con cui il giudizio entra nel registro. Non è uno stadio della
 * pipeline: è una chiamata a sé, e come tale va contata.
 */
const JUDGE_STAGE_ID = 'judge';

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
  /**
   * Scrivere anche il **verdetto** come fatto.
   *
   * La pipeline lo scrive da sé, dopo aver salvato la revisione, così il
   * giudizio si lega a quella giusta. Rilanciando solo la revisione nessuno lo
   * faceva: il verdetto sovrascriveva le colonne del frammento e non lasciava
   * storia, che è il caso che D22 cita per nome.
   */
  recordVerdict = false,
): Promise<ChunkOutcome> {
  const config = effectiveConfig ?? usePipelineStore.getState().config;
  if (!textToAudit) return 'skipped';
  if (useChunksStore.getState().cancelRequested) return 'cancelled';

  actions.updateChunkStatus(chunk.id, 'processing');
  const judgeRef = {
    provider: config.judgeProvider,
    model: config.judgeModel,
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
        config,
        (info: PromptInfo) => pipelineLog.auditPrompt(chunk.id, judgeRef, info.systemPrompt, info.userPrompt),
        (info: ResponseInfo) => pipelineLog.auditResponse(chunk.id, info.rawJson),
      ),
      {
        label: 'Audit',
        shouldCancel: () => useChunksStore.getState().cancelRequested,
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
    const auditDuration = Date.now() - auditStartedAt;
    pipelineLog.auditEnd(chunk.id, judgeRef, auditDuration, judgeTokenUsage);
    // Anche il giudice è una chiamata a un modello, e costa: senza questa riga
    // il conto di un documento sarebbe più basso del vero. Il *verdetto*
    // è un fatto diverso, legato alla revisione giudicata.
    void recordModelCall({
      chunkId: chunk.id,
      stageId: JUDGE_STAGE_ID,
      stageName: JUDGE_STAGE_ID,
      provider: judgeRef.provider,
      model: judgeRef.model,
      usage: judgeTokenUsage,
      durationMs: auditDuration,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: config.targetLanguage,
      input: textToAudit,
      workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? null,
    }).catch(() => undefined);
    if (recordVerdict) {
      // Il giudizio si lega alla revisione che ha giudicato. Se quel testo non
      // è in archivio — un frammento corretto a mano e mai riapprovato — si usa
      // la sua impronta: dice comunque *cosa* è stato giudicato, senza fingere
      // una revisione che non esiste.
      void revisionIdForText(chunk.id, textToAudit)
        .then((revisionId) =>
          recordJudgement(
            chunk.id,
            revisionId ?? `hash:${contentHash(textToAudit)}`,
            {
              content: textToAudit,
              status: 'completed',
              rating: judgeData.rating,
              issues: judgeData.issues ?? [],
            } as JudgeResult,
            useWorkspaceStore.getState().activeWorkspace?.id ?? null,
          ),
        )
        .catch(() => undefined);
    }
    return 'completed';
  } catch (error: unknown) {
    if (!isStreamCancelledError(error)) {
      void recordFailedModelCall(
        {
          chunkId: chunk.id,
          stageId: JUDGE_STAGE_ID,
          stageName: JUDGE_STAGE_ID,
          provider: judgeRef.provider,
          model: judgeRef.model,
          durationMs: Date.now() - auditStartedAt,
          sourceLanguage: config.sourceLanguage,
          targetLanguage: config.targetLanguage,
          input: textToAudit,
          workspaceId: useWorkspaceStore.getState().activeWorkspace?.id ?? null,
        },
        error instanceof Error ? error.message : String(error),
      ).catch(() => undefined);
    }
    if (isStreamCancelledError(error)) {
      actions.updateChunkJudge(chunk.id, {
        content: textToAudit,
        status: 'idle',
        rating: qualityDefault(),
        issues: [],
      });
      actions.updateChunkStatus(chunk.id, 'ready');
      return 'cancelled';
    }
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
