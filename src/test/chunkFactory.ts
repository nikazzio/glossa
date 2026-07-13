import type { TranslationChunk } from '../types';

export function makeTranslationChunk(
  overrides: Partial<TranslationChunk> & Pick<TranslationChunk, 'id'>,
): TranslationChunk {
  const sourceDisplayText = overrides.sourceDisplayText ?? '';
  const sourceProcessingText =
    overrides.sourceProcessingText ?? sourceDisplayText;
  const translationDisplayText =
    overrides.translationDisplayText ?? '';
  const translationProcessingText =
    overrides.translationProcessingText ?? translationDisplayText;

  return {
    id: overrides.id,
    sourceDisplayText,
    sourceProcessingText,
    translationDisplayText,
    translationProcessingText,
    status: overrides.status ?? 'ready',
    stageResults: overrides.stageResults ?? {},
    judgeResult:
      overrides.judgeResult ?? {
        content: '',
        status: 'idle',
        rating: 'fair',
        issues: [],
      },
    coherenceResult: overrides.coherenceResult,
    translationLocked: overrides.translationLocked ?? false,
    footnotes: overrides.footnotes,
    blobId: overrides.blobId,
    blobOrder: overrides.blobOrder,
    blobReferenceChunkIds: overrides.blobReferenceChunkIds,
  };
}
