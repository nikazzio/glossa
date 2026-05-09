import type { TranslationChunk } from '../types';

export function makeTranslationChunk(
  overrides: Partial<TranslationChunk> & Pick<TranslationChunk, 'id'>,
): TranslationChunk {
  const sourceDisplayText = overrides.sourceDisplayText ?? overrides.originalText ?? '';
  const sourceProcessingText =
    overrides.sourceProcessingText ?? sourceDisplayText;
  const translationDisplayText =
    overrides.translationDisplayText ?? overrides.currentDraft ?? '';
  const translationProcessingText =
    overrides.translationProcessingText ?? translationDisplayText;

  return {
    id: overrides.id,
    sourceDisplayText,
    sourceProcessingText,
    translationDisplayText,
    translationProcessingText,
    originalText: overrides.originalText ?? sourceDisplayText,
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
    currentDraft: overrides.currentDraft ?? translationDisplayText,
    translationLocked: overrides.translationLocked ?? false,
    footnotes: overrides.footnotes,
  };
}
