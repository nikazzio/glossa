import { create } from 'zustand';
import type { EmbeddingJobStatus, PhraseMatch, TextProvenance } from '../types';

export type PhraseMemorySearchStatus = 'idle' | 'searching' | 'done' | 'error';

export type PhraseMemoryMatch = {
  id: string;
  sourcePhrase: string;
  targetPhrase: string;
  score: number;
  confidence: number;
  author?: string;
  work?: string;
  createdAt: string;
  /** Provenienza: workspace di casa (`null` = senza workspace), traduzione e
   *  frammento (`null` = frase importata). */
  workspaceId: string | null;
  projectId: string | null;
  chunkId: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  sourceLanguageVariety: string | null;
  targetLanguageVariety: string | null;
  provenance?: TextProvenance;
  embeddingModel?: string;
  dimensions?: number;
};

export type ChunkPhraseMatches = {
  chunkId: string;
  matches: PhraseMemoryMatch[];
  enabledMatchIds: Set<string>;
};

type PhraseMemoryState = {
  matchesByChunk: Map<string, ChunkPhraseMatches>;
  jobStatus: EmbeddingJobStatus;
  searchStatus: PhraseMemorySearchStatus;
  setMatches: (chunkId: string, matches: PhraseMatch[]) => void;
  clearMatches: (chunkId: string) => void;
  toggleMatchEnabled: (chunkId: string, matchId: string) => void;
  setEnabledMatchIds: (chunkId: string, ids: Set<string>) => void;
  setJobStatus: (status: EmbeddingJobStatus) => void;
  setSearchStatus: (status: PhraseMemorySearchStatus) => void;
  reset: () => void;
};

function toMemoryMatch(m: PhraseMatch): PhraseMemoryMatch {
  return {
    id: m.phraseMemoryId,
    sourcePhrase: m.sourcePhrase,
    targetPhrase: m.targetPhrase,
    score: Math.max(0, Math.min(1, 1 - m.distance)),
    confidence: Math.max(0, Math.min(1, m.confidence)),
    createdAt: new Date().toISOString(),
    workspaceId: m.workspaceId,
    projectId: m.projectId,
    chunkId: m.chunkId,
    sourceLanguage: m.sourceLanguage,
    targetLanguage: m.targetLanguage,
    sourceLanguageVariety: m.sourceLanguageVariety,
    targetLanguageVariety: m.targetLanguageVariety,
    provenance: m.provenance,
    embeddingModel: m.embeddingModel,
    dimensions: m.dimensions,
  };
}

export const usePhraseMemoryStore = create<PhraseMemoryState>((set) => ({
  matchesByChunk: new Map(),
  jobStatus: { kind: 'idle' },
  searchStatus: 'idle',

  setMatches: (chunkId, raw) => {
    const matches = raw.map(toMemoryMatch);
    set((state) => {
      const previousEnabled = state.matchesByChunk.get(chunkId)?.enabledMatchIds ?? new Set<string>();
      const nextIds = new Set(matches.map((m) => m.id));
      const enabledMatchIds = new Set([...previousEnabled].filter((id) => nextIds.has(id)));
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
      next.set(chunkId, { ...entry, enabledMatchIds: new Set(ids) });
      return { matchesByChunk: next };
    }),

  setJobStatus: (status) => set({ jobStatus: status }),

  setSearchStatus: (status) => set({ searchStatus: status }),

  reset: () => set({ matchesByChunk: new Map(), jobStatus: { kind: 'idle' }, searchStatus: 'idle' }),
}));
