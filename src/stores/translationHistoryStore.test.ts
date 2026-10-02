import { describe, expect, it } from 'vitest';
import { unversionedChunks } from './translationHistoryStore';
import { makeTranslationChunk } from '../test/chunkFactory';

describe('unversionedChunks', () => {
  it('lists only translated, unverified pages whose text is not the last version', () => {
    const chunks = [
      makeTranslationChunk({ id: 'same', translationDisplayText: 'A' }),
      makeTranslationChunk({ id: 'changed', translationDisplayText: 'B2' }),
      makeTranslationChunk({ id: 'never', translationDisplayText: 'C' }),
      makeTranslationChunk({ id: 'empty', translationDisplayText: '' }),
      makeTranslationChunk({ id: 'verified', translationDisplayText: 'D2', translationLocked: true }),
    ];

    const ids = unversionedChunks(chunks, { same: 'A', changed: 'B', verified: 'D' }).map((c) => c.id);

    expect(ids).toEqual(['changed', 'never']);
  });
});
