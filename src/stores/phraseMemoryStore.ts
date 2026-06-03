import { create } from 'zustand';
import type { EmbeddingJobStatus, PhraseMatch } from '../types';

export type PhraseMemoryMatch = {
  id: string;
  sourcePhrase: string;
  targetPhrase: string;
  score: number;
  author?: string;
  work?: string;
  createdAt: string;
};

export type ChunkPhraseMatches = {
  chunkId: string;
  matches: PhraseMemoryMatch[];
  enabledMatchIds: Set<string>;
};

type PhraseMemoryState = {
  matchesByChunk: Map<string, ChunkPhraseMatches>;
  jobStatus: EmbeddingJobStatus;
  setMatches: (chunkId: string, matches: PhraseMatch[]) => void;
  clearMatches: (chunkId: string) => void;
  toggleMatchEnabled: (chunkId: string, matchId: string) => void;
  setEnabledMatchIds: (chunkId: string, ids: Set<string>) => void;
  setJobStatus: (status: EmbeddingJobStatus) => void;
  reset: () => void;
};

function toMemoryMatch(m: PhraseMatch): PhraseMemoryMatch {
  return {
    id: m.phraseMemoryId,
    sourcePhrase: m.sourcePhrase,
    targetPhrase: m.targetPhrase,
    score: Math.max(0, Math.min(1, 1 - m.distance)),
    createdAt: new Date().toISOString(),
  };
}

export const usePhraseMemoryStore = create<PhraseMemoryState>((set) => ({
  matchesByChunk: new Map(),
  jobStatus: { kind: 'idle' },

  setMatches: (chunkId, raw) => {
    const matches = raw.map(toMemoryMatch);
    const enabledMatchIds = new Set(matches.map((m) => m.id));
    set((state) => {
      const next = new Map(state.matchesByChunk);
      next.set(chunkId, { chunkId, matches, enabledMatchIds });
      return { matchesByChunk: next };
    });
  },

  clearMatches: (chunkId) =>
    set((state) => {
      const next = new Map(state.matchesByChunk);
      next.delete(chunkId);
      return { matchesByChunk: next };
    }),

  toggleMatchEnabled: (chunkId, matchId) =>
    set((state) => {
      const entry = state.matchesByChunk.get(chunkId);
      if (!entry) return {};
      const ids = new Set(entry.enabledMatchIds);
      if (ids.has(matchId)) ids.delete(matchId);
      else ids.add(matchId);
      const next = new Map(state.matchesByChunk);
      next.set(chunkId, { ...entry, enabledMatchIds: ids });
      return { matchesByChunk: next };
    }),

  setEnabledMatchIds: (chunkId, ids) =>
    set((state) => {
      const entry = state.matchesByChunk.get(chunkId);
      if (!entry) return {};
      const next = new Map(state.matchesByChunk);
      next.set(chunkId, { ...entry, enabledMatchIds: ids });
      return { matchesByChunk: next };
    }),

  setJobStatus: (status) => set({ jobStatus: status }),

  reset: () => set({ matchesByChunk: new Map(), jobStatus: { kind: 'idle' } }),
}));
