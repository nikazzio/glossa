import { create } from 'zustand';
import {
  listProjects,
  createProject,
  deleteProject,
  getProjectConfig,
  loadTranslations,
  restoreTranslations,
  saveProjectState,
  type Project,
} from '../services/projectService';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useUiStore } from './uiStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';
import { logger } from '../utils/logger';

let saveInFlight: Promise<void> | null = null;

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
  saveCurrentProject: (name?: string) => Promise<void>;
  closeProject: () => void;
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
    await persistCurrentState({ set, get, name });
  },

  openProject: async (id: string) => {
    logger.info('openProject: start', { id });
    const [config, savedTranslations] = await Promise.all([
      getProjectConfig(id),
      loadTranslations(id),
    ]);
    if (!config) throw new Error(`Project config not found for id: ${id}`);
    logger.info('openProject: loaded from db', {
      id,
      sourceLen: config.inputText?.length ?? 0,
      savedTranslationsCount: savedTranslations.length,
    });

    const pipeline = usePipelineStore.getState();
    const chunksStore = useChunksStore.getState();
    const ui = useUiStore.getState();
    const restoredChunks = restoreTranslations(savedTranslations);
    const restoredInputText =
      config.inputText || restoredChunks.map((chunk) => chunk.originalText).join('\n\n');
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
      documentFormat: config.documentFormat ?? 'plain',
      markdownAware: config.markdownAware ?? false,
      experimentalImport: config.experimentalImport ?? null,
      glossary: config.glossary,
      assignedGlossaryId: config.assignedGlossaryId,
    });
    chunksStore.setChunks(restoredChunks);
    pipeline.setInputText(restoredInputText);
    ui.setViewMode(
      config.viewMode ?? (restoredChunks.length === 0 && restoredInputText.trim() ? 'sandbox' : 'document'),
    );
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

  closeProject: () => {
    useUiStore.getState().setSelectedChunkId(null);
    useUiStore.getState().setViewMode('document');
    useChunksStore.setState({ chunks: [], isProcessing: false, cancelRequested: false, activeStreamId: null });
    usePipelineStore.getState().resetToDefaults();
    set({
      currentProjectId: null,
      saveState: 'idle',
      lastSaveError: null,
      trackedSnapshot: null,
    });
  },

  saveCurrentProject: async (name?: string) => {
    if (saveInFlight) {
      logger.debug('saveCurrentProject: skipped, save already in flight');
      return saveInFlight;
    }

    const operation = (async () => {
      const chunksStore = useChunksStore.getState();
      if (chunksStore.isProcessing) {
        throw new Error('Cannot save while the pipeline is processing.');
      }

      const pipeline = usePipelineStore.getState();
      const ui = useUiStore.getState();
      const inputText =
        chunksStore.chunks.length > 0
          ? chunksStore.chunks.map((chunk) => chunk.originalText).join('\n\n')
          : pipeline.inputText;
      const effectiveSnapshot = buildProjectSnapshot({
        inputText,
        config: pipeline.config,
        chunks: chunksStore.chunks,
        viewMode: ui.viewMode,
      });

      logger.info('saveCurrentProject: start', {
        trigger: name ? 'first-save' : 'manual-or-autosave',
        currentProjectId: get().currentProjectId,
        chunksCount: chunksStore.chunks.length,
        inputTextLen: inputText.length,
        isProcessing: chunksStore.isProcessing,
      });
      set({ saveState: 'saving', lastSaveError: null });

      try {
        const currentProjectId =
          get().currentProjectId ??
          (name?.trim()
            ? await createProject(
                name.trim(),
                pipeline.config.sourceLanguage,
                pipeline.config.targetLanguage,
              )
            : null);

        if (!currentProjectId) {
          throw new Error('Project name required for first save.');
        }

        await saveProjectState({
          projectId: currentProjectId,
          inputText,
          config: pipeline.config,
          viewMode: ui.viewMode,
          chunks: chunksStore.chunks,
        });
        logger.info('saveCurrentProject: done', {
          projectId: currentProjectId,
          chunksCount: chunksStore.chunks.length,
          inputTextLen: inputText.length,
        });
        await get().loadProjects();
        set({
          currentProjectId,
          saveState: 'saved',
          lastSaveError: null,
          trackedSnapshot: effectiveSnapshot,
        });
      } catch (error: any) {
        logger.error('saveCurrentProject: failed', { message: error?.message });
        set({
          saveState: 'error',
          lastSaveError: error?.message ?? 'Failed to save project.',
        });
        throw error;
      }
    })();

    saveInFlight = operation.finally(() => {
      saveInFlight = null;
    });

    return saveInFlight;
  },
}));

async function persistCurrentState({
  set,
  get,
  name,
}: {
  set: (partial: Partial<ProjectState>) => void;
  get: () => ProjectState;
  name: string;
}) {
  const pipeline = usePipelineStore.getState();
  const ui = useUiStore.getState();
  const chunks = useChunksStore.getState().chunks;
  const inputText =
    chunks.length > 0
      ? chunks.map((chunk) => chunk.originalText).join('\n\n')
      : pipeline.inputText;
  const trackedSnapshot = buildProjectSnapshot({
    inputText,
    config: pipeline.config,
    chunks,
    viewMode: ui.viewMode,
  });
  const id = await createProject(
    name,
    pipeline.config.sourceLanguage,
    pipeline.config.targetLanguage,
  );
  await saveProjectState({
    projectId: id,
    inputText,
    config: pipeline.config,
    viewMode: ui.viewMode,
    chunks,
  });
  void get().loadProjects().catch(() => {});
  set({
    currentProjectId: id,
    saveState: 'saved',
    lastSaveError: null,
    trackedSnapshot,
  });
}
