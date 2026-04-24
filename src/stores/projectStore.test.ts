import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useProjectStore } from './projectStore';
import type { SavedTranslation } from '../services/projectService';

const projectServiceMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectConfig: vi.fn(),
  saveProjectConfig: vi.fn(),
  saveTranslations: vi.fn(),
  loadTranslations: vi.fn(),
}));

vi.mock('../services/projectService', async () => {
  const actual = await vi.importActual<typeof import('../services/projectService')>('../services/projectService');
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
    });

    const pipeline = usePipelineStore.getState();
    pipeline.setInputText('');
    pipeline.clearChunks();
    pipeline.setIsProcessing(false);
    pipeline.setShowSettings(false);
    pipeline.setOllamaModels([]);
    pipeline.setOllamaStatus('unknown');
    pipeline.setConfig((prev) => ({
      ...prev,
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
    }));
  });

  it('opens a project and restores saved chunks with stage and judge data', async () => {
    projectServiceMocks.getProjectConfig.mockResolvedValue({
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
        judge_issues: JSON.stringify([
          {
            type: 'fluency',
            severity: 'low',
            description: 'Minor smoothing needed',
          },
        ]),
        created_at: '2026-04-19T00:00:00Z',
      },
    ];

    projectServiceMocks.loadTranslations.mockResolvedValue(savedTranslations);

    await useProjectStore.getState().openProject('proj-1');

    const pipeline = usePipelineStore.getState();
    expect(useProjectStore.getState().currentProjectId).toBe('proj-1');
    expect(projectServiceMocks.loadTranslations).toHaveBeenCalledWith('proj-1');
    expect(pipeline.config.stages).toEqual([
      {
        id: 'stg-1',
        name: 'Literal Draft',
        prompt: 'Translate literally',
        model: 'gpt-4o-mini',
        provider: 'openai',
        enabled: true,
      },
    ]);
    expect(pipeline.config.judgeProvider).toBe('anthropic');
    expect(pipeline.config.useChunking).toBe(false);
    expect(pipeline.chunks).toEqual([
      {
        id: 'chunk-0',
        originalText: 'Original paragraph',
        status: 'completed',
        stageResults: {
          'stg-1': {
            content: 'Translated paragraph',
            status: 'completed',
          },
        },
        judgeResult: {
          content: 'Translated paragraph',
          status: 'completed',
          rating: 'excellent',
          issues: [
            {
              type: 'fluency',
              severity: 'low',
              description: 'Minor smoothing needed',
            },
          ],
        },
        currentDraft: 'Translated paragraph',
      },
    ]);
  });

  it('clears stale chunks when opening a project with no saved translations', async () => {
    projectServiceMocks.getProjectConfig.mockResolvedValue({
      stages: [],
      judgePrompt: '',
      judgeModel: '',
      judgeProvider: '',
      useChunking: true,
      targetChunkCount: 0,
      glossary: [],
    });
    projectServiceMocks.loadTranslations.mockResolvedValue([]);

    usePipelineStore.getState().setInputText('Stale text');
    usePipelineStore.getState().generateChunks();
    expect(usePipelineStore.getState().chunks).toHaveLength(1);

    await useProjectStore.getState().openProject('proj-empty');

    expect(useProjectStore.getState().currentProjectId).toBe('proj-empty');
    expect(usePipelineStore.getState().chunks).toEqual([]);
  });
});
