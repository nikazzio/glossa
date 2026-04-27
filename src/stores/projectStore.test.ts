import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useProjectStore } from './projectStore';
import { useUiStore } from './uiStore';
import type { SavedTranslation } from '../services/projectService';

const projectServiceMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectConfig: vi.fn(),
  saveProjectConfig: vi.fn(),
  saveTranslations: vi.fn(),
  saveProjectState: vi.fn(),
  loadTranslations: vi.fn(),
}));

vi.mock('../services/projectService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/projectService')>(
      '../services/projectService',
    );
  return {
    ...actual,
    ...projectServiceMocks,
  };
});

describe('projectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useProjectStore.setState({
      projects: [],
      currentProjectId: null,
      showProjectPanel: false,
      saveState: 'idle',
      lastSaveError: null,
      trackedSnapshot: null,
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
        targetChunkCount: 0,
      },
    }));
  });

  it('opens a project and restores chunks plus document mode', async () => {
    projectServiceMocks.getProjectConfig.mockResolvedValue({
      sourceLanguage: 'Latin',
      targetLanguage: 'Italian',
      inputText: 'Original paragraph',
      viewMode: 'document',
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
      targetChunkCount: 0,
      glossary: [{ term: 'logos', translation: 'logos', notes: 'retain Greek' }],
    });

    const savedTranslations: SavedTranslation[] = [
      {
        id: 'chunk-0',
        project_id: 'proj-1',
        original_text: 'Original paragraph',
        final_translation: 'Translated paragraph',
        chunk_status: 'completed',
        stage_results: JSON.stringify({
          'stg-1': {
            content: 'Translated paragraph',
            status: 'completed',
          },
        }),
        judge_status: 'completed',
        judge_rating: 'excellent',
        judge_issues: JSON.stringify([]),
        created_at: '2026-04-19T00:00:00Z',
      },
    ];

    projectServiceMocks.loadTranslations.mockResolvedValue(savedTranslations);

    await useProjectStore.getState().openProject('proj-1');

    expect(useProjectStore.getState().currentProjectId).toBe('proj-1');
    expect(usePipelineStore.getState().config.sourceLanguage).toBe('Latin');
    expect(useChunksStore.getState().chunks[0].currentDraft).toBe('Translated paragraph');
    expect(useUiStore.getState().viewMode).toBe('document');
    expect(useUiStore.getState().selectedChunkId).toBe('chunk-0');
  });

  it('derives sandbox mode when no explicit view mode is saved and there are no chunks', async () => {
    projectServiceMocks.getProjectConfig.mockResolvedValue({
      sourceLanguage: 'English',
      targetLanguage: 'Italian',
      inputText: 'Unchunked draft source',
      viewMode: null,
      stages: [],
      judgePrompt: '',
      judgeModel: '',
      judgeProvider: '',
      useChunking: true,
      targetChunkCount: 0,
      glossary: [],
    });
    projectServiceMocks.loadTranslations.mockResolvedValue([]);

    await useProjectStore.getState().openProject('proj-empty');

    expect(useChunksStore.getState().chunks).toEqual([]);
    expect(usePipelineStore.getState().inputText).toBe('Unchunked draft source');
    expect(useUiStore.getState().viewMode).toBe('sandbox');
  });

  it('saves current project with input text, chunk data and current view mode', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    useUiStore.getState().setViewMode('document');
    usePipelineStore.getState().setInputText('Original source draft');

    await useProjectStore.getState().saveCurrentProject('snapshot-1');

    expect(projectServiceMocks.saveProjectState).toHaveBeenCalledWith({
      projectId: 'proj-1',
      inputText: 'Original source draft',
      config: expect.objectContaining({
        sourceLanguage: 'English',
        targetLanguage: 'Italian',
      }),
      viewMode: 'document',
      chunks: [],
    });
    expect(useProjectStore.getState().saveState).toBe('saved');
    expect(useProjectStore.getState().trackedSnapshot).toBe('snapshot-1');
  });

  it('refuses to save while the pipeline is processing', async () => {
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    useChunksStore.getState().setIsProcessing(true);

    await expect(useProjectStore.getState().saveCurrentProject()).rejects.toThrow(
      'Cannot save while the pipeline is processing.',
    );
    expect(projectServiceMocks.saveProjectState).not.toHaveBeenCalled();
  });

  it('creates a new project and persists the current sandbox state immediately', async () => {
    projectServiceMocks.createProject.mockResolvedValue('proj-new');
    usePipelineStore.getState().setInputText('Unchunked text to preserve');
    useUiStore.getState().setViewMode('sandbox');

    await useProjectStore.getState().createAndOpen('New Project');

    expect(projectServiceMocks.saveProjectState).toHaveBeenCalledWith({
      projectId: 'proj-new',
      inputText: 'Unchunked text to preserve',
      config: expect.objectContaining({
        sourceLanguage: 'English',
        targetLanguage: 'Italian',
      }),
      viewMode: 'sandbox',
      chunks: [],
    });
    expect(useProjectStore.getState().saveState).toBe('saved');
    expect(useProjectStore.getState().trackedSnapshot).toBeTruthy();
  });
});
