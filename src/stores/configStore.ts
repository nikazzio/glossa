import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { OllamaStatus } from '../types';

export type RunPhase = 'test' | 'production';

interface ConfigState {
  pipelineMode: RunPhase;
  setPipelineMode: (mode: RunPhase) => void;

  pipelineTestChunkCount: number;
  setPipelineTestChunkCount: (count: number) => void;

  ollamaStatus: OllamaStatus;
  setOllamaStatus: (status: OllamaStatus) => void;

  ollamaModels: string[];
  setOllamaModels: (models: string[]) => void;

  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;

  newPipelineInit: 'copy-first' | 'copy-previous' | 'defaults';
  setNewPipelineInit: (value: 'copy-first' | 'copy-previous' | 'defaults') => void;

  maxPipelines: number;
  setMaxPipelines: (value: number) => void;

  chunkPresetShort: number;
  chunkPresetMedium: number;
  chunkPresetLong: number;
  setChunkPresetShort: (value: number) => void;
  setChunkPresetMedium: (value: number) => void;
  setChunkPresetLong: (value: number) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      pipelineMode: 'test',
      setPipelineMode: (mode) => set({ pipelineMode: mode }),

      pipelineTestChunkCount: 3,
      setPipelineTestChunkCount: (count) => {
        const normalized = Number.isFinite(count) ? Math.floor(count) : 1;
        set({ pipelineTestChunkCount: Math.max(1, normalized) });
      },

      ollamaStatus: 'unknown',
      setOllamaStatus: (status) => set({ ollamaStatus: status }),

      ollamaModels: [],
      setOllamaModels: (models) => set({ ollamaModels: models }),

      ollamaBaseUrl: 'http://localhost:11434',
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),

      newPipelineInit: 'copy-first',
      setNewPipelineInit: (value) => set({ newPipelineInit: value }),

      maxPipelines: 5,
      setMaxPipelines: (value) => set({ maxPipelines: Math.max(1, Math.min(20, value)) }),

      chunkPresetShort: 400,
      chunkPresetMedium: 700,
      chunkPresetLong: 1000,
      setChunkPresetShort: (value) =>
        set((state) => ({ chunkPresetShort: Math.min(Math.max(50, value), state.chunkPresetMedium - 1) })),
      setChunkPresetMedium: (value) =>
        set((state) => ({ chunkPresetMedium: Math.max(state.chunkPresetShort + 1, Math.min(value, state.chunkPresetLong - 1)) })),
      setChunkPresetLong: (value) =>
        set((state) => ({ chunkPresetLong: Math.max(state.chunkPresetMedium + 1, Math.max(50, value)) })),
    }),
    {
      name: 'glossa-config',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // pipelineMode resets to 'test' on reload (intentional safe default).
      // ollamaStatus/ollamaModels are runtime-probed state, not persisted.
      migrate: (state) => state,
      partialize: (state) => ({
        pipelineTestChunkCount: state.pipelineTestChunkCount,
        ollamaBaseUrl: state.ollamaBaseUrl,
        newPipelineInit: state.newPipelineInit,
        maxPipelines: state.maxPipelines,
        chunkPresetShort: state.chunkPresetShort,
        chunkPresetMedium: state.chunkPresetMedium,
        chunkPresetLong: state.chunkPresetLong,
      }),
    },
  ),
);
