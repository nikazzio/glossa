import type { ChunkPhraseMatches } from '../stores/phraseMemoryStore';

/**
 * Returns chunkIds where phrase memory matches exist but ALL are disabled.
 * Used to show a pre-launch warning before running the full pipeline.
 */
export function checkAllChunksHaveEnabledMatches(
  matchesByChunk: Map<string, ChunkPhraseMatches>,
): string[] {
  const blocked: string[] = [];
  for (const [chunkId, data] of matchesByChunk) {
    if (data.matches.length > 0 && data.enabledMatchIds.size === 0) {
      blocked.push(chunkId);
    }
  }
  return blocked;
}
