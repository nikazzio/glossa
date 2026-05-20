import { create } from 'zustand';
import {
  listProjects,
  createProject,
  deleteProject,
  getProjectSource,
  saveProjectSource,
  type Project,
} from '../services/projectService';
import {
  listPipelines,
  getPipelineConfig,
  createPipeline,
  renamePipeline,
  duplicatePipeline,
  deletePipeline,
  saveFullState,
  loadTranslations,
  restoreTranslations,
} from '../services/pipelineService';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useUiStore } from './uiStore';
import { useOperationLogStore } from './operationLogStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';
import { logger } from '../utils/logger';
import { runInTransaction } from '../services/dbService';
import type { Pipeline, PipelineConfig } from '../types';

let saveInFlight: Promise<void> | null = null;

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  pipelines: Pipeline[];
  activePipelineId: string | null;
  showProjectPanel: boolean;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  lastSaveError: string | null;
  trackedSnapshot: string | null;
  runInterrupted: boolean;
  lastRunConfig: string | null;

  setShowProjectPanel: (show: boolean) => void;
  loadProjects: () => Promise<void>;
  createAndOpen: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  closeProject: () => void;
  setRunInterrupted: (value: boolean) => void;
  clearResumeState: () => void;

  switchPipeline: (pipelineId: string) => Promise<void>;
  createNewPipeline: (name: string) => Promise<void>;
  deletePipeline: (pipelineId: string) => Promise<void>;
  renamePipeline: (pipelineId: string, name: string) => Promise<void>;
  duplicatePipeline: (pipelineId: string, newName: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  pipelines: [],
  activePipelineId: null,
  showProjectPanel: false,
  saveState: 'idle',
  lastSaveError: null,
  trackedSnapshot: null,
  runInterrupted: false,
  lastRunConfig: null,

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
    const chunks = useChunksStore.getState().chunks;

    const id = await createProject(name, pipeline.config.sourceLanguage, pipeline.config.targetLanguage);

    const pipelines = await listPipelines(id);
    const activePipelineId = pipelines[0]?.id ?? null;

    if (activePipelineId) {
      await runInTransaction(async (run) => {
        await saveProjectSource(id, pipeline.inputText, pipeline.inputProcessingText, pipeline.sourceFootnotes, pipeline.config, ui.viewMode);
        await saveFullState(activePipelineId, pipeline.config, chunks, run);
      });
    }

    const trackedSnapshot = buildProjectSnapshot({
      inputText: pipeline.inputText,
      inputProcessingText: pipeline.inputProcessingText,
      sourceFootnotes: pipeline.sourceFootnotes,
      config: pipeline.config,
      chunks,
      viewMode: ui.viewMode,
    });

    void get().loadProjects().catch(() => {});
    set({ currentProjectId: id, activePipelineId, pipelines, saveState: 'saved', lastSaveError: null, trackedSnapshot });
  },

  openProject: async (id: string) => {
    logger.info('openProject: start', { id });

    const [source, allPipelines] = await Promise.all([
      getProjectSource(id),
      listPipelines(id),
    ]);

    if (!source) throw new Error(`Project not found: ${id}`);

    const activePipelineId = allPipelines[0]?.id ?? null;

    let restoredChunks = useChunksStore.getState().chunks.filter(() => false); // empty typed array

    if (activePipelineId) {
      const [pipelineData, savedTranslations] = await Promise.all([
        getPipelineConfig(activePipelineId),
        loadTranslations(activePipelineId),
      ]);

      await useOperationLogStore.getState().loadFromDb(id);

      restoredChunks = restoreTranslations(savedTranslations);

      if (pipelineData) {
        const { pipeline, config } = pipelineData;
        const mergedConfig: PipelineConfig = {
          ...config,
          documentFormat: source.documentFormat,
          renderProfile: source.renderProfile,
          markdownAware: source.markdownAware,
          experimentalImport: source.experimentalImport,
        };

        usePipelineStore.setState((state) => ({
          runStatus: pipeline.runStatus,
          lastRunConfig: pipeline.lastRunConfig,
          inputText: source.sourceDisplayText,
          inputProcessingText: source.sourceProcessingText,
          sourceFootnotes: source.sourceFootnotes,
          config: {
            ...state.config,
            ...mergedConfig,
            stages: config.stages.length > 0 ? config.stages : state.config.stages,
            judgePrompt: config.judgePrompt || state.config.judgePrompt,
            judgeModel: config.judgeModel || state.config.judgeModel,
            judgeProvider: config.judgeProvider || state.config.judgeProvider,
          },
        }));

        set({
          runInterrupted: pipeline.runStatus === 'running' || pipeline.runStatus === 'interrupted',
          lastRunConfig: pipeline.lastRunConfig,
        });
      }
    }

    useChunksStore.getState().setChunks(restoredChunks);
    useUiStore.getState().setViewMode(
      source.viewMode ?? (restoredChunks.length === 0 && source.sourceDisplayText.trim() ? 'sandbox' : 'document'),
    );
    useUiStore.getState().setSelectedChunkId(restoredChunks[0]?.id ?? null);

    set({
      currentProjectId: id,
      pipelines: allPipelines,
      activePipelineId,
      saveState: 'saved',
      lastSaveError: null,
      trackedSnapshot: null,
    });

    logger.info('openProject: done', { id, activePipelineId, chunksCount: restoredChunks.length });
  },

  removeProject: async (id: string) => {
    await deleteProject(id);
    if (get().currentProjectId === id) {
      set({ currentProjectId: null, pipelines: [], activePipelineId: null, saveState: 'idle', lastSaveError: null, trackedSnapshot: null });
    }
    await get().loadProjects();
  },

  closeProject: () => {
    useUiStore.getState().setSelectedChunkId(null);
    useUiStore.getState().setViewMode('document');
    useChunksStore.setState({ chunks: [], isProcessing: false, cancelRequested: false, activeStreamId: null });
    usePipelineStore.getState().resetToDefaults();
    useOperationLogStore.setState({ entries: [], currentProjectId: null });
    set({
      currentProjectId: null,
      pipelines: [],
      activePipelineId: null,
      saveState: 'idle',
      lastSaveError: null,
      trackedSnapshot: null,
      runInterrupted: false,
      lastRunConfig: null,
    });
  },

  setRunInterrupted: (value) => set({ runInterrupted: value }),
  clearResumeState: () => set({ runInterrupted: false, lastRunConfig: null }),

  saveCurrentProject: async (name?: string) => {
    if (saveInFlight) {
      logger.debug('saveCurrentProject: skipped, save already in flight');
      return saveInFlight;
    }

    const operation = (async () => {
      const chunksStore = useChunksStore.getState();
      if (chunksStore.isProcessing) throw new Error('Cannot save while the pipeline is processing.');

      const pipeline = usePipelineStore.getState();
      const ui = useUiStore.getState();
      const effectiveSnapshot = buildProjectSnapshot({
        inputText: pipeline.inputText,
        inputProcessingText: pipeline.inputProcessingText,
        sourceFootnotes: pipeline.sourceFootnotes,
        config: pipeline.config,
        chunks: chunksStore.chunks,
        viewMode: ui.viewMode,
      });

      logger.info('saveCurrentProject: start', {
        trigger: name ? 'first-save' : 'manual-or-autosave',
        currentProjectId: get().currentProjectId,
        chunksCount: chunksStore.chunks.length,
      });
      set({ saveState: 'saving', lastSaveError: null });

      try {
        let currentProjectId = get().currentProjectId;
        let activePipelineId = get().activePipelineId;

        if (!currentProjectId) {
          if (!name?.trim()) throw new Error('Project name required for first save.');
          currentProjectId = await createProject(name.trim(), pipeline.config.sourceLanguage, pipeline.config.targetLanguage);
          const pipelines = await listPipelines(currentProjectId);
          activePipelineId = pipelines[0]?.id ?? null;
          set({ pipelines });
        }

        await saveProjectSource(
          currentProjectId,
          pipeline.inputText,
          pipeline.inputProcessingText,
          pipeline.sourceFootnotes,
          pipeline.config,
          ui.viewMode,
        );

        if (activePipelineId) {
          await runInTransaction(async (run) => {
            await saveFullState(activePipelineId!, pipeline.config, chunksStore.chunks, run);
          });
        }

        logger.info('saveCurrentProject: done', { projectId: currentProjectId });
        await get().loadProjects().catch(() => {});
        set({ currentProjectId, activePipelineId, saveState: 'saved', lastSaveError: null, trackedSnapshot: effectiveSnapshot });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to save project.';
        logger.error('saveCurrentProject: failed', { message });
        set({ saveState: 'error', lastSaveError: message });
        throw error;
      }
    })();

    saveInFlight = operation.finally(() => { saveInFlight = null; });
    return saveInFlight;
  },

  // ── Pipeline management ──────────────────────────────────────────────

  switchPipeline: async (pipelineId: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;

    const [pipelineData, savedTranslations, source] = await Promise.all([
      getPipelineConfig(pipelineId),
      loadTranslations(pipelineId),
      getProjectSource(currentProjectId),
    ]);

    if (!pipelineData || !source) return;

    const { pipeline, config } = pipelineData;
    const mergedConfig: PipelineConfig = {
      ...config,
      documentFormat: source.documentFormat,
      renderProfile: source.renderProfile,
      markdownAware: source.markdownAware,
      experimentalImport: source.experimentalImport,
    };

    usePipelineStore.setState((state) => ({
      runStatus: pipeline.runStatus,
      lastRunConfig: pipeline.lastRunConfig,
      config: {
        ...state.config,
        ...mergedConfig,
        stages: config.stages.length > 0 ? config.stages : state.config.stages,
        judgePrompt: config.judgePrompt || state.config.judgePrompt,
        judgeModel: config.judgeModel || state.config.judgeModel,
        judgeProvider: config.judgeProvider || state.config.judgeProvider,
      },
    }));

    useChunksStore.getState().setChunks(restoreTranslations(savedTranslations));
    useUiStore.getState().setSelectedChunkId(null);

    set({
      activePipelineId: pipelineId,
      runInterrupted: pipeline.runStatus === 'running' || pipeline.runStatus === 'interrupted',
      lastRunConfig: pipeline.lastRunConfig,
    });
  },

  createNewPipeline: async (name: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    await createPipeline(currentProjectId, name);
    const pipelines = await listPipelines(currentProjectId);
    set({ pipelines });
  },

  deletePipeline: async (pipelineId: string) => {
    const { currentProjectId, activePipelineId, pipelines } = get();
    if (!currentProjectId || pipelines.length <= 1) return;
    await deletePipeline(pipelineId);
    const updated = await listPipelines(currentProjectId);
    const nextActive = activePipelineId === pipelineId ? (updated[0]?.id ?? null) : activePipelineId;
    set({ pipelines: updated, activePipelineId: nextActive });
    if (activePipelineId === pipelineId && nextActive) {
      await get().switchPipeline(nextActive);
    }
  },

  renamePipeline: async (pipelineId: string, name: string) => {
    await renamePipeline(pipelineId, name);
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    const pipelines = await listPipelines(currentProjectId);
    set({ pipelines });
  },

  duplicatePipeline: async (pipelineId: string, newName: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    await duplicatePipeline(pipelineId, newName);
    const pipelines = await listPipelines(currentProjectId);
    set({ pipelines });
  },
}));
