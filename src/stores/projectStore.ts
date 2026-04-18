import { create } from 'zustand';
import {
  listProjects,
  createProject,
  deleteProject,
  getProjectConfig,
  saveProjectConfig,
  saveTranslations,
  type Project,
} from '../services/projectService';
import { usePipelineStore } from './pipelineStore';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  showProjectPanel: boolean;

  setShowProjectPanel: (show: boolean) => void;
  loadProjects: () => Promise<void>;
  createAndOpen: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  showProjectPanel: false,

  setShowProjectPanel: (show) => set({ showProjectPanel: show }),

  loadProjects: async () => {
    const projects = await listProjects();
    set({ projects });
  },

  createAndOpen: async (name: string) => {
    const pipeline = usePipelineStore.getState();
    const id = await createProject(name, pipeline.config.sourceLanguage, pipeline.config.targetLanguage);
    await saveProjectConfig(id, pipeline.config);
    await get().loadProjects();
    set({ currentProjectId: id });
  },

  openProject: async (id: string) => {
    const config = await getProjectConfig(id);
    if (!config) return;

    const pipeline = usePipelineStore.getState();
    pipeline.setConfig({
      ...pipeline.config,
      stages: config.stages.length > 0 ? config.stages : pipeline.config.stages,
      judgePrompt: config.judgePrompt || pipeline.config.judgePrompt,
      judgeModel: config.judgeModel || pipeline.config.judgeModel,
      judgeProvider: (config.judgeProvider as any) || pipeline.config.judgeProvider,
      useChunking: config.useChunking,
      glossary: config.glossary,
    });

    set({ currentProjectId: id });
  },

  removeProject: async (id: string) => {
    await deleteProject(id);
    const state = get();
    if (state.currentProjectId === id) {
      set({ currentProjectId: null });
    }
    await state.loadProjects();
  },

  saveCurrentProject: async () => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;

    const pipeline = usePipelineStore.getState();
    await saveProjectConfig(currentProjectId, pipeline.config);

    if (pipeline.chunks.length > 0) {
      await saveTranslations(currentProjectId, pipeline.chunks);
    }
  },
}));
