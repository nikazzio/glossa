import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useProjectStore } from './projectStore';
import { useUiStore } from './uiStore';
import type { SavedTranslation } from '../services/projectService';
import type { Pipeline } from '../types';
import { buildProjectSnapshot } from '../utils/projectSnapshot';

// ── DB mock (runInTransaction, loadOperationLogs) ─────────────────────

const dbMocks = vi.hoisted(() => ({
  runInTransaction: vi.fn(),
  loadOperationLogs: vi.fn(),
}));

vi.mock('../services/dbService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/dbService')>('../services/dbService');
  return { ...actual, ...dbMocks };
});

// ── projectService mock ───────────────────────────────────────────────

const projectServiceMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectSource: vi.fn(),
  saveProjectSource: vi.fn(),
}));

vi.mock('../services/projectService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/projectService')>(
      '../services/projectService',
    );
  return { ...actual, ...projectServiceMocks };
});

// ── pipelineService mock ──────────────────────────────────────────────

const pipelineServiceMocks = vi.hoisted(() => ({
  listPipelines: vi.fn(),
  getPipelineConfig: vi.fn(),
  loadTranslations: vi.fn(),
  saveFullState: vi.fn(),
  createPipeline: vi.fn(),
  renamePipeline: vi.fn(),
  duplicatePipeline: vi.fn(),
  deletePipeline: vi.fn(),
}));

vi.mock('../services/pipelineService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/pipelineService')>(
      '../services/pipelineService',
    );
  return { ...actual, ...pipelineServiceMocks };
});

// ── helpers ───────────────────────────────────────────────────────────

const makePipeline = (overrides: Partial<Pipeline> = {}): Pipeline => ({
  id: 'pipeline-1',
  projectId: 'proj-1',
  name: 'Default',
  sourceLanguage: 'Latin',
  targetLanguage: 'Italian',
  mode: 'standard',
  runStatus: 'idle',
  lastRunConfig: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('projectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // runInTransaction calls its callback with a no-op execute
    dbMocks.runInTransaction.mockImplementation(
      async (fn: (run: (...args: unknown[]) => Promise<void>) => Promise<unknown>) =>
        fn(vi.fn().mockResolvedValue(undefined)),
    );
    dbMocks.loadOperationLogs.mockResolvedValue([]);

    projectServiceMocks.listProjects.mockResolvedValue([]);
    projectServiceMocks.saveProjectSource.mockResolvedValue(undefined);
    pipelineServiceMocks.saveFullState.mockResolvedValue(undefined);

    useProjectStore.setState({
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
    });

    useUiStore.setState({
      viewMode: 'document',
      documentLayout: 'auto',
      selectedChunkId: null,
      showSettings: false,
      showHelp: false,
      ollamaModels: [],
      ollamaStatus: 'unknown',
    });

    useChunksStore.setState({
      chunks: [],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    usePipelineStore.setState((state) => ({
      ...state,
      inputText: '',
      inputProcessingText: '',
      sourceFootnotes: [],
      config: {
        ...state.config,
        sourceLanguage: 'English',
        targetLanguage: 'Italian',
        stages: [
          {
            id: 'default-stage',
            name: 'Default Stage',
            prompt: 'Default prompt',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
        ],
        judgePrompt: 'Default judge prompt',
        judgeModel: 'gemini-3-flash-preview',
        judgeProvider: 'gemini',
        glossary: [],
        useChunking: true,
        wordsPerChunk: 0,
      },
    }));
  });

  it('opens a project and restores chunks plus document mode', async () => {
    const pipeline = makePipeline();

    projectServiceMocks.getProjectSource.mockResolvedValue({
      sourceDisplayText: 'Original paragraph',
      sourceProcessingText: 'Original paragraph',
      sourceFootnotes: [],
      documentFormat: 'markdown',
      renderProfile: 'markdown',
      markdownAware: true,
      experimentalImport: 'docx-markdown',
      viewMode: 'document',
    });
    pipelineServiceMocks.listPipelines.mockResolvedValue([pipeline]);
    pipelineServiceMocks.getPipelineConfig.mockResolvedValue({
      pipeline,
      config: {
        sourceLanguage: 'Latin',
        targetLanguage: 'Italian',
        mode: 'standard',
        stages: [
          {
            id: 'stg-1',
            name: 'Literal Draft',
            prompt: 'Translate literally',
            model: 'gpt-4o-mini',
            provider: 'openai',
            enabled: true,
          },
        ],
        judgePrompt: 'Judge carefully',
        judgeModel: 'claude-3-5-sonnet',
        judgeProvider: 'anthropic',
        useChunking: false,
        wordsPerChunk: 0,
        documentFormat: 'plain',
        renderProfile: 'plain-text',
        markdownAware: false,
        experimentalImport: null,
        glossary: [{ id: 'g-1', term: 'logos', translation: 'logos', notes: 'retain Greek' }],
        assignedGlossaryId: null,
      },
      sourceFootnotes: [],
    });

    const savedTranslations: SavedTranslation[] = [
      {
        id: 'chunk-0',
        project_id: 'proj-1',
        original_text: 'Original paragraph',
        final_translation: 'Translated paragraph',
        source_display_text: 'Original paragraph',
        source_processing_text: 'Original paragraph',
        translation_display_text: 'Translated paragraph',
        translation_processing_text: 'Translated paragraph',
        chunk_status: 'completed',
        stage_results: JSON.stringify({ 'stg-1': { content: 'Translated paragraph', status: 'completed' } }),
        judge_status: 'completed',
        judge_rating: 'excellent',
        judge_issues: JSON.stringify([]),
        created_at: '2026-04-19T00:00:00Z',
      },
    ];
    pipelineServiceMocks.loadTranslations.mockResolvedValue(savedTranslations);

    await useProjectStore.getState().openProject('proj-1');

    expect(useProjectStore.getState().currentProjectId).toBe('proj-1');
    expect(usePipelineStore.getState().config.sourceLanguage).toBe('Latin');
    expect(usePipelineStore.getState().config.documentFormat).toBe('markdown');
    expect(usePipelineStore.getState().config.markdownAware).toBe(true);
    expect(useChunksStore.getState().chunks[0]?.currentDraft).toBe('Translated paragraph');
    expect(useUiStore.getState().viewMode).toBe('document');
    expect(useUiStore.getState().selectedChunkId).toBe('chunk-0');
  });

  it('derives sandbox mode when no explicit view mode is saved and there are no chunks', async () => {
    const pipeline = makePipeline({ projectId: 'proj-empty', id: 'pipeline-empty' });

    projectServiceMocks.getProjectSource.mockResolvedValue({
      sourceDisplayText: 'Unchunked draft source',
      sourceProcessingText: 'Unchunked draft source',
      sourceFootnotes: [],
      documentFormat: 'plain',
      renderProfile: 'plain-text',
      markdownAware: false,
      experimentalImport: null,
      viewMode: null,
    });
    pipelineServiceMocks.listPipelines.mockResolvedValue([pipeline]);
    pipelineServiceMocks.getPipelineConfig.mockResolvedValue({
      pipeline,
      config: {
        sourceLanguage: 'English',
        targetLanguage: 'Italian',
        mode: 'standard',
        stages: [],
        judgePrompt: '',
        judgeModel: '',
        judgeProvider: '',
        useChunking: true,
        wordsPerChunk: 0,
        documentFormat: 'plain',
        renderProfile: 'plain-text',
        markdownAware: false,
        experimentalImport: null,
        glossary: [],
        assignedGlossaryId: null,
      },
      sourceFootnotes: [],
    });
    pipelineServiceMocks.loadTranslations.mockResolvedValue([]);

    await useProjectStore.getState().openProject('proj-empty');

    expect(useChunksStore.getState().chunks).toEqual([]);
    expect(usePipelineStore.getState().inputText).toBe('Unchunked draft source');
    expect(useUiStore.getState().viewMode).toBe('sandbox');
  });

  it('saves current project with input text, chunk data and current view mode', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });
    useUiStore.getState().setViewMode('document');
    usePipelineStore.getState().setInputText('Original source draft');

    await useProjectStore.getState().saveCurrentProject();

    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-1',
      'Original source draft',
      'Original source draft',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
      'document',
    );
    expect(pipelineServiceMocks.saveFullState).toHaveBeenCalledWith(
      'proj-1',
      'pipeline-1',
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
      [],
      expect.any(Function),
    );
    expect(useProjectStore.getState().saveState).toBe('saved');
  });

  it('creates a new project on first save when a name is provided', async () => {
    projectServiceMocks.createProject.mockResolvedValue('proj-first-save');
    pipelineServiceMocks.listPipelines.mockResolvedValue([
      makePipeline({ id: 'pipeline-first-save', projectId: 'proj-first-save' }),
    ]);
    usePipelineStore.getState().setInputText('Draft text');
    useUiStore.getState().setViewMode('sandbox');

    await useProjectStore.getState().saveCurrentProject('My Draft');

    expect(projectServiceMocks.createProject).toHaveBeenCalledWith('My Draft', 'English', 'Italian');
    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-first-save',
      'Draft text',
      'Draft text',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
      'sandbox',
    );
    expect(pipelineServiceMocks.saveFullState).toHaveBeenCalledWith(
      'proj-first-save',
      'pipeline-first-save',
      expect.any(Object),
      [],
      expect.any(Function),
    );
    expect(useProjectStore.getState().currentProjectId).toBe('proj-first-save');
    expect(useProjectStore.getState().saveState).toBe('saved');
  });

  it('rejects first save without a project name', async () => {
    usePipelineStore.getState().setInputText('Draft text');

    await expect(useProjectStore.getState().saveCurrentProject()).rejects.toThrow(
      'Project name required for first save.',
    );

    expect(projectServiceMocks.createProject).not.toHaveBeenCalled();
    expect(projectServiceMocks.saveProjectSource).not.toHaveBeenCalled();
  });

  it('refuses to save while the pipeline is processing', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    useChunksStore.getState().setIsProcessing(true);

    await expect(useProjectStore.getState().saveCurrentProject()).rejects.toThrow(
      'Cannot save while the pipeline is processing.',
    );
    expect(projectServiceMocks.saveProjectSource).not.toHaveBeenCalled();
  });

  it('creates a new project and persists the current sandbox state immediately', async () => {
    projectServiceMocks.createProject.mockResolvedValue('proj-new');
    pipelineServiceMocks.listPipelines.mockResolvedValue([
      makePipeline({ id: 'pipeline-new', projectId: 'proj-new' }),
    ]);
    usePipelineStore.getState().setInputText('Unchunked text to preserve');
    useUiStore.getState().setViewMode('sandbox');

    await useProjectStore.getState().createAndOpen('New Project');

    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-new',
      'Unchunked text to preserve',
      'Unchunked text to preserve',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
      'sandbox',
    );
    expect(pipelineServiceMocks.saveFullState).toHaveBeenCalledWith(
      'proj-new',
      'pipeline-new',
      expect.any(Object),
      [],
      expect.any(Function),
    );
    expect(useProjectStore.getState().saveState).toBe('saved');
    expect(useProjectStore.getState().trackedSnapshot).toBeTruthy();
    expect(projectServiceMocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it('does not fail the save when refreshing the project list fails', async () => {
    projectServiceMocks.listProjects.mockRejectedValueOnce(new Error('refresh failed'));
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });

    await expect(useProjectStore.getState().saveCurrentProject()).resolves.toBeUndefined();
    expect(useProjectStore.getState().saveState).toBe('saved');
  });

  it('computes the tracked snapshot that includes input text, config, and view mode', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });
    useUiStore.getState().setViewMode('document');
    usePipelineStore.getState().setInputText('Sample text');

    await useProjectStore.getState().saveCurrentProject();

    const expectedSnapshot = buildProjectSnapshot({
      inputText: 'Sample text',
      inputProcessingText: 'Sample text',
      sourceFootnotes: [],
      config: usePipelineStore.getState().config,
      chunks: [],
      viewMode: 'document',
    });
    expect(useProjectStore.getState().trackedSnapshot).toBe(expectedSnapshot);
  });
});
