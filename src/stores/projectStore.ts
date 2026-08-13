import { create } from 'zustand';
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  getProjectSource,
  saveProjectSource,
  type Project,
} from '../services/projectService';
import {
  listPipelines,
  getPipelineConfig,
  createPipeline,
  savePipelineConfig,
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
import { useConfigStore } from './configStore';
import { useOperationLogStore } from './operationLogStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';
import { logger } from '../utils/logger';
import { runInTransaction } from '../services/dbService';
import { useWorkspaceStore } from './workspaceStore';
import { useAnnotationsStore } from './annotationsStore';
import type { Pipeline, PipelineConfig, TranslationChunk } from '../types';

let saveInFlight: Promise<void> | null = null;
let createPipelineInFlight: Promise<void> | null = null;

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  pipelines: Pipeline[];
  activePipelineId: string | null;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  lastSaveError: string | null;
  lastSavedAt: number | null;
  trackedSnapshot: string | null;
  runInterrupted: boolean;
  lastRunConfig: string | null;

  loadProjects: () => Promise<void>;
  createAndOpen: (name: string, workspaceId: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  openProjectInWorkspace: (id: string, workspaceId: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  renameCurrentProject: (name: string) => Promise<void>;
  closeProject: () => void;
  setRunInterrupted: (value: boolean) => void;
  clearResumeState: () => void;

  switchPipeline: (pipelineId: string) => Promise<void>;
  createNewPipeline: (name: string) => Promise<void>;
  deletePipeline: (pipelineId: string) => Promise<void>;
  renamePipeline: (pipelineId: string, name: string) => Promise<void>;
  duplicatePipeline: (pipelineId: string, newName: string) => Promise<void>;
}

// Ordina le richieste di caricamento progetti: se cambio workspace prima che
// la richiesta precedente risponda, quella risposta tardiva non deve più
// sovrascrivere l'elenco progetti del workspace corrente.
let loadProjectsRequestId = 0;

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  pipelines: [],
  activePipelineId: null,
  saveState: 'idle',
  lastSaveError: null,
  lastSavedAt: null,
  trackedSnapshot: null,
  runInterrupted: false,
  lastRunConfig: null,

  loadProjects: async () => {
    const { activeWorkspace } = useWorkspaceStore.getState();
    const requestId = ++loadProjectsRequestId;
    if (!activeWorkspace) {
      if (requestId === loadProjectsRequestId) set({ projects: [] });
      return;
    }
    const projects = await listProjects(activeWorkspace.id);
    if (requestId !== loadProjectsRequestId) return;
    set({ projects });
  },

  createAndOpen: async (name: string, workspaceId: string) => {
    const pipeline = usePipelineStore.getState();
    const chunks = useChunksStore.getState().chunks;
    const workspaceStore = useWorkspaceStore.getState();
    const workspace = workspaceStore.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error('Unknown workspace');
    if (workspaceStore.activeWorkspace?.id !== workspace.id) {
      await workspaceStore.setActive(workspace);
    }

    const id = await createProject(name, pipeline.config.sourceLanguage, pipeline.config.targetLanguage, workspace.id);

    const pipelines = await listPipelines(id);
    const activePipelineId = pipelines[0]?.id ?? null;

    // saveProjectSource uses execute() directly — must run outside the transaction
    // to avoid deadlocking on the shared write-serialization queue.
    await saveProjectSource(id, pipeline.inputText, pipeline.inputProcessingText, pipeline.sourceFootnotes, pipeline.config);
    if (activePipelineId) {
      await runInTransaction(async (run) => {
        await saveFullState(id, activePipelineId, pipeline.config, chunks, run);
      });
    }

    const trackedSnapshot = buildProjectSnapshot({
      inputText: pipeline.inputText,
      inputProcessingText: pipeline.inputProcessingText,
      sourceFootnotes: pipeline.sourceFootnotes,
      config: pipeline.config,
      chunks,
    });

    useOperationLogStore.getState().setContext(id, activePipelineId);
    set({ currentProjectId: id, activePipelineId, pipelines, saveState: 'saved', lastSaveError: null, lastSavedAt: Date.now(), trackedSnapshot });
    // Ricaricato **dopo** l'apertura e atteso: il nome del progetto vive
    // nell'elenco, e lasciando la ricarica per aria un progetto appena creato
    // resta senza nome in testata e in barra di stato finché non si cambia
    // sezione.
    await get().loadProjects().catch(() => {});
  },

  renameCurrentProject: async (name: string) => {
    const id = get().currentProjectId;
    const trimmed = name.trim();
    if (!id || !trimmed) return;
    await renameProject(id, trimmed);
    // Il database aggiorna anche `updated_at`, e gli elenchi ci si ordinano
    // sopra: senza allinearlo qui, dopo una rinomina l'ordine resta quello
    // vecchio fino alla ricarica successiva. Stesso formato di SQLite
    // (`CURRENT_TIMESTAMP`, UTC).
    const renamedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    set({
      projects: get().projects.map((project) =>
        project.id === id ? { ...project, name: trimmed, updated_at: renamedAt } : project,
      ),
    });
  },

  openProject: async (id: string) => {
    logger.info('openProject: start', { id });

    const [source, allPipelines] = await Promise.all([
      getProjectSource(id),
      listPipelines(id),
    ]);

    if (!source) throw new Error(`Project not found: ${id}`);

    const activePipelineId = allPipelines[0]?.id ?? null;

    let restoredChunks: TranslationChunk[] = [];

    if (activePipelineId) {
      const [pipelineData, savedTranslations] = await Promise.all([
        getPipelineConfig(activePipelineId),
        loadTranslations(activePipelineId),
      ]);

      await useOperationLogStore.getState().loadFromDb(id, activePipelineId);

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
            judgePrompt: config.judgePrompt,
            judgeModel: config.judgeModel || state.config.judgeModel,
            judgeProvider: (config.judgeProvider || state.config.judgeProvider) as import('../types').ModelProvider,
          },
        }));

        set({
          runInterrupted: pipeline.runStatus === 'running' || pipeline.runStatus === 'interrupted',
          lastRunConfig: pipeline.lastRunConfig,
        });
      }
    }

    useChunksStore.getState().setChunks(restoredChunks);

    if (activePipelineId) {
      const annStore = useAnnotationsStore.getState();
      annStore.clearAll();
      await annStore.loadAnnotations(activePipelineId);
    }

    useUiStore.getState().setSelectedChunkId(restoredChunks[0]?.id ?? null);

    set({
      currentProjectId: id,
      pipelines: allPipelines,
      activePipelineId,
      saveState: 'saved',
      lastSaveError: null,
      lastSavedAt: null,
      trackedSnapshot: null,
    });

    // L'elenco dei progetti è per workspace e può essere vuoto o vecchio quando
    // un progetto viene aperto da altrove (ricerca globale, ripresa dell'ultimo
    // aperto): senza questo, il nome del progetto non esiste da nessuna parte e
    // la barra di stato mostra un separatore che non separa niente.
    if (!get().projects.some((project) => project.id === id)) {
      await get().loadProjects();
    }

    logger.info('openProject: done', { id, activePipelineId, chunksCount: restoredChunks.length });
  },

  /** Apre un progetto di un workspace qualsiasi: attiva prima quel workspace se non è già quello attivo. */
  openProjectInWorkspace: async (id: string, workspaceId: string) => {
    const { activeWorkspace, workspaces, setActive } = useWorkspaceStore.getState();
    if (workspaceId !== activeWorkspace?.id) {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);
      get().closeProject();
      await setActive(ws);
      await get().loadProjects();
    }
    await get().openProject(id);
  },

  removeProject: async (id: string) => {
    await deleteProject(id);
    if (get().currentProjectId === id) {
      set({ currentProjectId: null, pipelines: [], activePipelineId: null, saveState: 'idle', lastSaveError: null, lastSavedAt: null, trackedSnapshot: null });
    }
    await get().loadProjects();
  },

  closeProject: () => {
    useUiStore.getState().setSelectedChunkId(null);
    useChunksStore.setState({ chunks: [], isProcessing: false, cancelRequested: false, activeStreamId: null });
    usePipelineStore.getState().resetToDefaults();
    useOperationLogStore.setState({ entries: [], currentProjectId: null, currentPipelineId: null });
    useAnnotationsStore.getState().clearAll();
    set({
      currentProjectId: null,
      pipelines: [],
      activePipelineId: null,
      saveState: 'idle',
      lastSaveError: null,
      lastSavedAt: null,
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
      const effectiveSnapshot = buildProjectSnapshot({
        inputText: pipeline.inputText,
        inputProcessingText: pipeline.inputProcessingText,
        sourceFootnotes: pipeline.sourceFootnotes,
        config: pipeline.config,
        chunks: chunksStore.chunks,
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
        let newPipelines: Pipeline[] | null = null;

        if (!currentProjectId) {
          if (!name?.trim()) throw new Error('Project name required for first save.');
          const { activeWorkspace } = useWorkspaceStore.getState();
          if (!activeWorkspace) throw new Error('No active workspace');
          currentProjectId = await createProject(name.trim(), pipeline.config.sourceLanguage, pipeline.config.targetLanguage, activeWorkspace.id);
          const pipelines = await listPipelines(currentProjectId);
          activePipelineId = pipelines[0]?.id ?? null;
          newPipelines = pipelines;
        }

        await saveProjectSource(
          currentProjectId,
          pipeline.inputText,
          pipeline.inputProcessingText,
          pipeline.sourceFootnotes,
          pipeline.config,
        );

        if (activePipelineId) {
          await runInTransaction(async (run) => {
            await saveFullState(currentProjectId!, activePipelineId!, pipeline.config, chunksStore.chunks, run);
          });
        }

        logger.info('saveCurrentProject: done', { projectId: currentProjectId });
        useOperationLogStore.getState().setContext(currentProjectId, activePipelineId);
        await get().loadProjects().catch(() => {});
        set({
          currentProjectId,
          saveState: 'saved',
          lastSaveError: null,
          lastSavedAt: Date.now(),
          trackedSnapshot: effectiveSnapshot,
          // Only set activePipelineId/pipelines when we just created the project —
          // otherwise we'd overwrite a switchPipeline that ran during the async save.
          ...(newPipelines !== null ? { activePipelineId, pipelines: newPipelines } : {}),
        });
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
    const { currentProjectId, activePipelineId } = get();
    if (!currentProjectId) return;

    // Persist current pipeline before switching to avoid losing unsaved edits
    if (activePipelineId && activePipelineId !== pipelineId) {
      const pipeline = usePipelineStore.getState();
      const chunks = useChunksStore.getState().chunks;
      await runInTransaction(async (run) => {
        await saveFullState(currentProjectId, activePipelineId, pipeline.config, chunks, run);
      });
    }

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
        judgePrompt: config.judgePrompt,
        judgeModel: config.judgeModel || state.config.judgeModel,
        judgeProvider: (config.judgeProvider || state.config.judgeProvider) as import('../types').ModelProvider,
      },
    }));

    useChunksStore.getState().setChunks(restoreTranslations(savedTranslations));

    const annStore = useAnnotationsStore.getState();
    annStore.clearAll();
    await annStore.loadAnnotations(pipelineId);

    await useOperationLogStore.getState().loadFromDb(currentProjectId, pipelineId);

    useUiStore.getState().setSelectedChunkId(null);

    set({
      activePipelineId: pipelineId,
      runInterrupted: pipeline.runStatus === 'running' || pipeline.runStatus === 'interrupted',
      lastRunConfig: pipeline.lastRunConfig,
    });
  },

  createNewPipeline: async (name: string) => {
    if (createPipelineInFlight) return;
    const op = (async () => {
      const { currentProjectId, pipelines, activePipelineId } = get();
      if (!currentProjectId) return;
      const { sourceLanguage, targetLanguage } = usePipelineStore.getState().config;
      const newId = await createPipeline(currentProjectId, name, sourceLanguage, targetLanguage);

      const initMode = useConfigStore.getState().newPipelineInit;
      if (initMode !== 'defaults' && pipelines.length > 0) {
        const sourcePipelineId = initMode === 'copy-first'
          ? pipelines[0].id
          : (activePipelineId ?? pipelines[0].id);
        const sourceData = await getPipelineConfig(sourcePipelineId);
        if (sourceData) {
          await savePipelineConfig(newId, sourceData.config);
        }
      }

      // Check if there is a document loaded before the switch clears chunks
      const hasDocument = useChunksStore.getState().chunks.length > 0;

      const updated = await listPipelines(currentProjectId);
      set({ pipelines: updated });
      await get().switchPipeline(newId);

      // Re-generate chunks from source text with fresh IDs — avoids ON CONFLICT(id)
      // overwriting the old pipeline's translations in the shared translations table.
      if (hasDocument) {
        useChunksStore.getState().generateChunks();
      }

      // switchPipeline (above) already loaded the new pipeline's (empty)
      // operation log — no separate clear/reload needed here, which also
      // means other pipelines' history in the project stays untouched.
    })();
    createPipelineInFlight = op.finally(() => { createPipelineInFlight = null; });
    return createPipelineInFlight;
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
