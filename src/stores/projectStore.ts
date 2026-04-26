import { create } from 'zustand';
import {
  listProjects,
  createProject,
  deleteProject,
  getProjectConfig,
  loadTranslations,
  restoreTranslations,
  saveProjectConfig,
  saveTranslations,
  type Project,
} from '../services/projectService';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useUiStore } from './uiStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  showProjectPanel: boolean;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  lastSaveError: string | null;
  trackedSnapshot: string | null;

  setShowProjectPanel: (show: boolean) => void;
  loadProjects: () => Promise<void>;
  createAndOpen: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  saveCurrentProject: (snapshot?: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  showProjectPanel: false,
  saveState: 'idle',
  lastSaveError: null,
  trackedSnapshot: null,

  setShowProjectPanel: (show) => {
    set({ showProjectPanel: show });
    if (show) {
      const ui = useUiStore.getState();
      if (ui.showSettings) ui.setShowSettings(false);
      if (ui.showHelp) ui.setShowHelp(false);
    }
  },

  loadProjects: async () => {
    const projects = await listProjects();
    set({ projects });
  },

  createAndOpen: async (name: string) => {
    const pipeline = usePipelineStore.getState();
    const ui = useUiStore.getState();
    const id = await createProject(name, pipeline.config.sourceLanguage, pipeline.config.targetLanguage);
    await saveProjectConfig(id, pipeline.config, ui.viewMode);
    await get().loadProjects();
    set({
      currentProjectId: id,
      saveState: 'saved',
      lastSaveError: null,
      trackedSnapshot: null,
    });
  },

  openProject: async (id: string) => {
    const [config, savedTranslations] = await Promise.all([
      getProjectConfig(id),
      loadTranslations(id),
    ]);
    if (!config) return;

    const pipeline = usePipelineStore.getState();
    const chunksStore = useChunksStore.getState();
    const ui = useUiStore.getState();
    const restoredChunks = restoreTranslations(savedTranslations);
    pipeline.setConfig({
      ...pipeline.config,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: config.targetLanguage,
      stages: config.stages.length > 0 ? config.stages : pipeline.config.stages,
      judgePrompt: config.judgePrompt || pipeline.config.judgePrompt,
      judgeModel: config.judgeModel || pipeline.config.judgeModel,
      judgeProvider: (config.judgeProvider as any) || pipeline.config.judgeProvider,
      useChunking: config.useChunking,
      targetChunkCount: config.targetChunkCount,
      glossary: config.glossary,
    });
    chunksStore.setChunks(restoredChunks);
    pipeline.setInputText(restoredChunks.map((chunk) => chunk.originalText).join('\n\n'));
    ui.setViewMode(config.viewMode ?? 'document');
    ui.setSelectedChunkId(restoredChunks[0]?.id ?? null);

    set({
      currentProjectId: id,
      saveState: 'saved',
      lastSaveError: null,
      trackedSnapshot: null,
    });
  },

  removeProject: async (id: string) => {
    await deleteProject(id);
    const state = get();
    if (state.currentProjectId === id) {
      set({
        currentProjectId: null,
        saveState: 'idle',
        lastSaveError: null,
        trackedSnapshot: null,
      });
    }
    await state.loadProjects();
  },

  saveCurrentProject: async (snapshot) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;

    const chunksStore = useChunksStore.getState();
    if (chunksStore.isProcessing) {
      throw new Error('Cannot save while the pipeline is processing.');
    }

    const pipeline = usePipelineStore.getState();
    const ui = useUiStore.getState();
    const effectiveSnapshot =
      snapshot ??
      buildProjectSnapshot({
        inputText: pipeline.inputText,
        config: pipeline.config,
        chunks: chunksStore.chunks,
        viewMode: ui.viewMode,
      });

    set({ saveState: 'saving', lastSaveError: null });

    try {
      await saveProjectConfig(currentProjectId, pipeline.config, ui.viewMode);
      await saveTranslations(currentProjectId, chunksStore.chunks);
      set({
        saveState: 'saved',
        lastSaveError: null,
        trackedSnapshot: effectiveSnapshot,
      });
    } catch (error: any) {
      set({
        saveState: 'error',
        lastSaveError: error?.message ?? 'Failed to save project.',
      });
      throw error;
    }
  },
}));
