import { create } from 'zustand';
import type {
  DocumentLayoutPreference,
  OllamaStatus,
  ViewMode,
} from '../types';

interface UiState {
  viewMode: ViewMode;
  documentLayout: DocumentLayoutPreference;
  selectedChunkId: string | null;
  showSettings: boolean;
  showHelp: boolean;
  ollamaModels: string[];
  ollamaStatus: OllamaStatus;

  setViewMode: (mode: ViewMode) => void;
  setDocumentLayout: (layout: DocumentLayoutPreference) => void;
  setSelectedChunkId: (chunkId: string | null) => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean) => void;
  setOllamaModels: (models: string[]) => void;
  setOllamaStatus: (status: OllamaStatus) => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: 'sandbox',
  documentLayout: 'auto',
  selectedChunkId: null,
  showSettings: false,
  showHelp: false,
  ollamaModels: [],
  ollamaStatus: 'unknown',

  setViewMode: (mode) => set({ viewMode: mode }),
  setDocumentLayout: (layout) => set({ documentLayout: layout }),
  setSelectedChunkId: (chunkId) => set({ selectedChunkId: chunkId }),
  setShowSettings: (show) =>
    set((state) => ({
      showSettings: show,
      showHelp: show ? false : state.showHelp,
    })),
  setShowHelp: (show) =>
    set((state) => ({
      showHelp: show,
      showSettings: show ? false : state.showSettings,
    })),
  setOllamaModels: (models) => set({ ollamaModels: models }),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),
}));
