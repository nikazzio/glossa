import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { OllamaStatus } from '../types';

export type WorkMode = 'chunk' | 'all';

interface ConfigState {
  /** null = nessun limite, la modalità "Blocchi multipli" elabora tutti i frammenti */
  repeatChunkCount: number | null;
  setRepeatChunkCount: (count: number | null) => void;

  workMode: WorkMode;
  setWorkMode: (mode: WorkMode) => void;

  ollamaStatus: OllamaStatus;
  setOllamaStatus: (status: OllamaStatus) => void;

  ollamaModels: string[];
  setOllamaModels: (models: string[]) => void;

  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;

  /** Se attivo, all'avvio dell'app prova a raggiungere il server Ollama e a
   * leggere i modelli installati (senza attendere che l'utente lo faccia a
   * mano in Impostazioni) — sola verifica locale (localhost), nessun invio. */
  ollamaAutoDiscover: boolean;
  setOllamaAutoDiscover: (value: boolean) => void;

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
      workMode: 'chunk',
      setWorkMode: (mode) => set({ workMode: mode }),

      repeatChunkCount: null,
      setRepeatChunkCount: (count) => {
        if (count === null) {
          set({ repeatChunkCount: null });
          return;
        }
        const normalized = Number.isFinite(count) ? Math.floor(count) : 1;
        set({ repeatChunkCount: Math.max(1, normalized) });
      },

      ollamaStatus: 'unknown',
      setOllamaStatus: (status) => set({ ollamaStatus: status }),

      ollamaModels: [],
      setOllamaModels: (models) => set({ ollamaModels: models }),

      ollamaBaseUrl: 'http://localhost:11434',
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),

      ollamaAutoDiscover: true,
      setOllamaAutoDiscover: (value) => set({ ollamaAutoDiscover: value }),

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
      // ollamaStatus/ollamaModels are runtime-probed state, not persisted.
      migrate: (state) => state,
      partialize: (state) => ({
        repeatChunkCount: state.repeatChunkCount,
        ollamaBaseUrl: state.ollamaBaseUrl,
        newPipelineInit: state.newPipelineInit,
        maxPipelines: state.maxPipelines,
        chunkPresetShort: state.chunkPresetShort,
        chunkPresetMedium: state.chunkPresetMedium,
        chunkPresetLong: state.chunkPresetLong,
        ollamaAutoDiscover: state.ollamaAutoDiscover,
      }),
    },
  ),
);
