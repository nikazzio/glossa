import { create } from 'zustand';
import type { EmbeddingJobStatus, PhraseMatch } from '../types';

type PhraseMemoryState = {
  matchesByChunkId: Record<string, PhraseMatch[]>;
  jobStatus: EmbeddingJobStatus;
  setMatches: (chunkId: string, matches: PhraseMatch[]) => void;
  clearMatches: (chunkId: string) => void;
  setJobStatus: (status: EmbeddingJobStatus) => void;
  reset: () => void;
};

const INITIAL_STATE = {
  matchesByChunkId: {} as Record<string, PhraseMatch[]>,
  jobStatus: { kind: 'idle' } as EmbeddingJobStatus,
};

export const usePhraseMemoryStore = create<PhraseMemoryState>((set) => ({
  ...INITIAL_STATE,

  setMatches: (chunkId, matches) =>
    set((state) => ({ matchesByChunkId: { ...state.matchesByChunkId, [chunkId]: matches } })),

  clearMatches: (chunkId) =>
    set((state) => {
      const { [chunkId]: _removed, ...rest } = state.matchesByChunkId;
      return { matchesByChunkId: rest };
    }),

  setJobStatus: (status) => set({ jobStatus: status }),

  reset: () => set({ ...INITIAL_STATE }),
}));
