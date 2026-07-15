import { create } from 'zustand';
import { generateId } from '../utils';

export type PhraseCandidateOrigin = 'ai' | 'manual';

export interface PhraseCandidateDraft {
  id: string;
  sourcePhrase: string;
  targetPhrase: string;
  confidence: number;
  origin: PhraseCandidateOrigin;
  accepted: boolean;
}

export type MemoryExtractionStatus = 'idle' | 'extracting' | 'reviewing' | 'saving' | 'error';

export interface DraftEntry {
  status: MemoryExtractionStatus;
  candidates: PhraseCandidateDraft[];
}

type PhraseMemoryDraftState = {
  draftsByChunk: Map<string, DraftEntry>;
  setDraftStatus: (chunkId: string, status: MemoryExtractionStatus) => void;
  setDraftCandidates: (chunkId: string, candidates: PhraseCandidateDraft[]) => void;
  updateCandidate: (
    chunkId: string,
    candidateId: string,
    changes: Partial<Pick<PhraseCandidateDraft, 'sourcePhrase' | 'targetPhrase'>>,
  ) => void;
  toggleAccepted: (chunkId: string, candidateId: string) => void;
  removeCandidate: (chunkId: string, candidateId: string) => void;
  addManualCandidate: (chunkId: string) => void;
  clearDraft: (chunkId: string) => void;
  reset: () => void;
};

function updateEntry(
  state: PhraseMemoryDraftState,
  chunkId: string,
  update: (entry: DraftEntry) => DraftEntry,
): Map<string, DraftEntry> {
  const current = state.draftsByChunk.get(chunkId) ?? { status: 'idle' as MemoryExtractionStatus, candidates: [] };
  const next = new Map(state.draftsByChunk);
  next.set(chunkId, update(current));
  return next;
}

export const usePhraseMemoryDraftStore = create<PhraseMemoryDraftState>((set) => ({
  draftsByChunk: new Map(),

  setDraftStatus: (chunkId, status) =>
    set((state) => ({ draftsByChunk: updateEntry(state, chunkId, (entry) => ({ ...entry, status })) })),

  setDraftCandidates: (chunkId, candidates) =>
    set((state) => ({
      draftsByChunk: updateEntry(state, chunkId, () => ({ status: 'reviewing', candidates })),
    })),

  updateCandidate: (chunkId, candidateId, changes) =>
    set((state) => ({
      draftsByChunk: updateEntry(state, chunkId, (entry) => ({
        ...entry,
        candidates: entry.candidates.map((c) => (c.id === candidateId ? { ...c, ...changes } : c)),
      })),
    })),

  toggleAccepted: (chunkId, candidateId) =>
    set((state) => ({
      draftsByChunk: updateEntry(state, chunkId, (entry) => ({
        ...entry,
        candidates: entry.candidates.map((c) =>
          c.id === candidateId ? { ...c, accepted: !c.accepted } : c),
      })),
    })),

  removeCandidate: (chunkId, candidateId) =>
    set((state) => ({
      draftsByChunk: updateEntry(state, chunkId, (entry) => ({
        ...entry,
        candidates: entry.candidates.filter((c) => c.id !== candidateId),
      })),
    })),

  addManualCandidate: (chunkId) =>
    set((state) => ({
      draftsByChunk: updateEntry(state, chunkId, (entry) => ({
        status: 'reviewing',
        candidates: [
          ...entry.candidates,
          {
            id: generateId('pmcand'),
            sourcePhrase: '',
            targetPhrase: '',
            confidence: 1,
            origin: 'manual',
            accepted: true,
          },
        ],
      })),
    })),

  clearDraft: (chunkId) =>
    set((state) => {
      const next = new Map(state.draftsByChunk);
      next.delete(chunkId);
      return { draftsByChunk: next };
    }),

  reset: () => set({ draftsByChunk: new Map() }),
}));
