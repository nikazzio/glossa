import { useMemo } from 'react';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

interface UsePhraseMemoryMatchesResult {
  matches: PhraseMemoryMatch[];
  enabledMatchIds: Set<string>;
  selectedMatches: PhraseMemoryMatch[];
  hasMatches: boolean;
  toggleEnabled: (matchId: string) => void;
}

export function usePhraseMemoryMatches(chunkId: string | null): UsePhraseMemoryMatchesResult {
  const { matchesByChunk, toggleMatchEnabled } = usePhraseMemoryStore();

  const chunkData = chunkId != null ? matchesByChunk.get(chunkId) : undefined;
  const matches = chunkData?.matches ?? [];
  const enabledMatchIds = chunkData?.enabledMatchIds ?? new Set<string>();

  const selectedMatches = useMemo(
    () => matches.filter((m) => enabledMatchIds.has(m.id)),
    [matches, enabledMatchIds],
  );

  const toggleEnabled = (matchId: string) => {
    if (chunkId != null) toggleMatchEnabled(chunkId, matchId);
  };

  return { matches, enabledMatchIds, selectedMatches, hasMatches: matches.length > 0, toggleEnabled };
}
