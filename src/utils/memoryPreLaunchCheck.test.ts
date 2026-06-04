import { describe, it, expect } from 'vitest';
import { getChunksWithAllMatchesDisabled } from './memoryPreLaunchCheck';
import type { ChunkPhraseMatches } from '../stores/phraseMemoryStore';

const makeChunkMatches = (enabled: string[]): ChunkPhraseMatches => ({
  chunkId: 'c1',
  matches: [
    { id: 'm1', sourcePhrase: 's', targetPhrase: 't', score: 0.9, createdAt: '' },
    { id: 'm2', sourcePhrase: 's2', targetPhrase: 't2', score: 0.85, createdAt: '' },
  ],
  enabledMatchIds: new Set(enabled),
});

describe('getChunksWithAllMatchesDisabled', () => {
  it('returns empty when all chunks with matches have at least one enabled', () => {
    const map = new Map([['c1', makeChunkMatches(['m1'])]]);
    expect(getChunksWithAllMatchesDisabled(map)).toEqual([]);
  });

  it('returns chunkIds where matches exist but all are disabled', () => {
    const map = new Map([['c1', makeChunkMatches([])]]);
    expect(getChunksWithAllMatchesDisabled(map)).toEqual(['c1']);
  });

  it('returns empty when no chunks have matches', () => {
    expect(getChunksWithAllMatchesDisabled(new Map())).toEqual([]);
  });
});
