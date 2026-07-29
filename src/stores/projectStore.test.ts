import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useProjectStore } from './projectStore';
import { useUiStore } from './uiStore';
import { useConfigStore } from './configStore';
import { useOperationLogStore } from './operationLogStore';
import type { SavedTranslation } from '../services/projectService';
import type { Pipeline } from '../types';
import { buildProjectSnapshot } from '../utils/projectSnapshot';

// ── workspaceStore mock ───────────────────────────────────────────────

const TEST_WORKSPACE = {
  id: 'ws-test',
  name: 'Test',
  embeddingModel: 'text-embedding-3-small',
  memoryExtractorProvider: 'openai',
  memoryExtractorModel: 'gpt-5-nano',
  memoryExtractorPrompt: 'Extract',
  createdAt: '2024-01-01T00:00:00Z',
};

const workspaceState = vi.hoisted(() => ({
  activeWorkspace: null as null | { id: string; name: string },
  workspaces: [] as Array<{ id: string; name: string }>,
  setActive: vi.fn(),
}));

vi.mock('./workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => workspaceState,
  },
}));

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
    workspaceState.activeWorkspace = TEST_WORKSPACE;
    workspaceState.workspaces = [TEST_WORKSPACE];

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
      saveState: 'idle',
      lastSaveError: null,
      trackedSnapshot: null,
      runInterrupted: false,
      lastRunConfig: null,
    });

    useUiStore.setState({
      documentLayout: 'auto',
      selectedChunkId: null,
      showSettings: false,
      showHelp: false,
    });
    useConfigStore.setState({
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
    expect(useChunksStore.getState().chunks[0]?.translationDisplayText).toBe('Translated paragraph');
    expect(useUiStore.getState().selectedChunkId).toBe('chunk-0');
  });

  it('opens a project without saved chunks in the normal empty workspace', async () => {
    const pipeline = makePipeline({ projectId: 'proj-empty', id: 'pipeline-empty' });

    projectServiceMocks.getProjectSource.mockResolvedValue({
      sourceDisplayText: 'Unchunked draft source',
      sourceProcessingText: 'Unchunked draft source',
      sourceFootnotes: [],
      documentFormat: 'plain',
      renderProfile: 'plain-text',
      markdownAware: false,
      experimentalImport: null,
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
    expect(useUiStore.getState().selectedChunkId).toBeNull();
    expect(usePipelineStore.getState().inputText).toBe('Unchunked draft source');
  });

  it('saves current project with input text and chunk data', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });
    usePipelineStore.getState().setInputText('Original source draft');

    await useProjectStore.getState().saveCurrentProject();

    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-1',
      'Original source draft',
      'Original source draft',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
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

    await useProjectStore.getState().saveCurrentProject('My Draft');

    expect(projectServiceMocks.createProject).toHaveBeenCalledWith('My Draft', 'English', 'Italian', 'ws-test');
    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-first-save',
      'Draft text',
      'Draft text',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
    );
    expect(pipelineServiceMocks.saveFullState).toHaveBeenCalledWith(
      'proj-first-save',
      'pipeline-first-save',
      expect.any(Object),
      [],
      expect.any(Function),
    );
    expect(useProjectStore.getState().currentProjectId).toBe('proj-first-save');
    expect(useOperationLogStore.getState().currentProjectId).toBe('proj-first-save');
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

  it('creates a new project without recording a legacy screen state', async () => {
    projectServiceMocks.createProject.mockResolvedValue('proj-new');
    pipelineServiceMocks.listPipelines.mockResolvedValue([
      makePipeline({ id: 'pipeline-new', projectId: 'proj-new' }),
    ]);
    usePipelineStore.getState().setInputText('Unchunked text to preserve');

    await useProjectStore.getState().createAndOpen('New Project', 'ws-test');

    expect(projectServiceMocks.saveProjectSource).toHaveBeenCalledWith(
      'proj-new',
      'Unchunked text to preserve',
      'Unchunked text to preserve',
      [],
      expect.objectContaining({ sourceLanguage: 'English', targetLanguage: 'Italian' }),
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
    expect(useOperationLogStore.getState().currentProjectId).toBe('proj-new');
    expect(projectServiceMocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it('createAndOpen rejects an unknown workspace instead of falling back to activeWorkspace', async () => {
    workspaceState.activeWorkspace = TEST_WORKSPACE;
    workspaceState.workspaces = [TEST_WORKSPACE];

    await expect(useProjectStore.getState().createAndOpen('New Project', 'ws-unknown')).rejects.toThrow('Unknown workspace');
    expect(projectServiceMocks.createProject).not.toHaveBeenCalled();
  });

  it('createAndOpen creates in the explicitly chosen workspace, not the stale active one', async () => {
    const otherWorkspace = { ...TEST_WORKSPACE, id: 'ws-other', name: 'Other' };
    workspaceState.activeWorkspace = TEST_WORKSPACE;
    workspaceState.workspaces = [TEST_WORKSPACE, otherWorkspace];
    projectServiceMocks.createProject.mockResolvedValue('proj-other');
    pipelineServiceMocks.listPipelines.mockResolvedValue([
      makePipeline({ id: 'pipeline-other', projectId: 'proj-other' }),
    ]);

    await useProjectStore.getState().createAndOpen('New Project', 'ws-other');

    expect(projectServiceMocks.createProject).toHaveBeenCalledWith('New Project', 'English', 'Italian', 'ws-other');
    expect(workspaceState.setActive).toHaveBeenCalledWith(otherWorkspace);
  });

  it('does not fail the save when refreshing the project list fails', async () => {
    projectServiceMocks.listProjects.mockRejectedValueOnce(new Error('refresh failed'));
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });

    await expect(useProjectStore.getState().saveCurrentProject()).resolves.toBeUndefined();
    expect(useProjectStore.getState().saveState).toBe('saved');
  });

  it('computes the tracked snapshot that includes input text and config', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipeline-1' });
    usePipelineStore.getState().setInputText('Sample text');

    await useProjectStore.getState().saveCurrentProject();

    const expectedSnapshot = buildProjectSnapshot({
      inputText: 'Sample text',
      inputProcessingText: 'Sample text',
      sourceFootnotes: [],
      config: usePipelineStore.getState().config,
      chunks: [],
    });
    expect(useProjectStore.getState().trackedSnapshot).toBe(expectedSnapshot);
  });

  it('openProjectInWorkspace opens directly, without switching, when the project is already in the active workspace', async () => {
    const mockOpenProject = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ openProject: mockOpenProject });

    await useProjectStore.getState().openProjectInWorkspace('proj-1', 'ws-test');

    expect(mockOpenProject).toHaveBeenCalledWith('proj-1');
    expect(workspaceState.setActive).not.toHaveBeenCalled();
  });

  it('openProjectInWorkspace switches workspace first when the project belongs to a different one', async () => {
    const mockOpenProject = vi.fn().mockResolvedValue(undefined);
    const mockCloseProject = vi.fn();
    const mockLoadProjects = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({
      openProject: mockOpenProject,
      closeProject: mockCloseProject,
      loadProjects: mockLoadProjects,
    });
    workspaceState.workspaces = [{ id: 'ws-other', name: 'Other' }];
    workspaceState.setActive.mockResolvedValue(undefined);

    await useProjectStore.getState().openProjectInWorkspace('proj-2', 'ws-other');

    expect(mockCloseProject).toHaveBeenCalled();
    expect(workspaceState.setActive).toHaveBeenCalledWith({ id: 'ws-other', name: 'Other' });
    expect(mockLoadProjects).toHaveBeenCalled();
    expect(mockOpenProject).toHaveBeenCalledWith('proj-2');
  });

  it('openProjectInWorkspace throws without opening anything when the target workspace cannot be found', async () => {
    const mockOpenProject = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ openProject: mockOpenProject });
    workspaceState.workspaces = [];

    await expect(
      useProjectStore.getState().openProjectInWorkspace('proj-3', 'ws-missing'),
    ).rejects.toThrow('ws-missing');
    expect(mockOpenProject).not.toHaveBeenCalled();
  });
});
