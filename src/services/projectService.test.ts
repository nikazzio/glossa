import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineConfig } from '../types';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const {
  getProjectConfig,
  saveProjectConfig,
  saveProjectState,
  loadTranslations,
} = await import('./projectService');

describe('projectService glossary persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.runInTransaction.mockImplementation(
      async (fn: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<unknown>) =>
        fn(dbMocks.execute),
    );
  });

  it('saves the active glossary with the project config', async () => {
    const config: PipelineConfig = {
      sourceLanguage: 'Italian',
      targetLanguage: 'English',
      stages: [],
      judgePrompt: 'Judge',
      judgeModel: 'gemini-3-flash-preview',
      judgeProvider: 'gemini',
      glossary: [
        { id: 'entry-1', term: 'virtute', translation: 'virtue', notes: 'Keep ethical sense' },
        { id: 'entry-2', term: '', translation: 'ignored' },
      ],
      useChunking: true,
      targetChunkCount: 8,
    };

    await saveProjectConfig('proj-1', config, 'document');

    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pipeline_configs SET'),
      expect.arrayContaining([8, 'proj-1']),
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('view_mode = $3'),
      ['Italian', 'English', 'document', 'proj-1'],
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO glossaries'),
      expect.arrayContaining(['glossary-proj-1']),
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM glossary_entries WHERE glossary_id = $1'),
      ['glossary-proj-1'],
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO glossary_entries'),
      expect.arrayContaining(['entry-1', 'glossary-proj-1', 'virtute', 'virtue', 'Keep ethical sense']),
    );
    expect(dbMocks.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO glossary_entries'),
      expect.arrayContaining(['entry-2']),
    );
  });

  it('restores glossary ids and target chunk count from a saved config', async () => {
    dbMocks.select
      .mockResolvedValueOnce([
        {
          source_language: 'Latin',
          target_language: 'English',
          source_text: 'Arma virumque cano',
          stages: '[]',
          judge_prompt: 'Judge',
          judge_model: 'gemini-3-flash-preview',
          judge_provider: 'gemini',
          use_chunking: 1,
          target_chunk_count: 5,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'entry-1',
          term: 'virtute',
          translation: 'virtue',
          notes: 'Keep ethical sense',
        },
      ]);

    const config = await getProjectConfig('proj-1');

    expect(config?.sourceLanguage).toBe('Latin');
    expect(config?.targetLanguage).toBe('English');
    expect(config?.inputText).toBe('Arma virumque cano');
    expect(config?.targetChunkCount).toBe(5);
    expect(config?.glossary).toEqual([
      {
        id: 'entry-1',
        term: 'virtute',
        translation: 'virtue',
        notes: 'Keep ethical sense',
      },
    ]);
  });

  it('saves source text and chunk positions atomically', async () => {
    await saveProjectState({
      projectId: 'proj-1',
      inputText: 'Alpha\n\nBeta',
      config: {
        sourceLanguage: 'Latin',
        targetLanguage: 'English',
        stages: [],
        judgePrompt: 'Judge',
        judgeModel: 'gemini-3-flash-preview',
        judgeProvider: 'gemini',
        glossary: [],
        useChunking: true,
        targetChunkCount: 2,
      },
      viewMode: 'document',
      chunks: [
        {
          id: 'chunk-b',
          originalText: 'Beta',
          currentDraft: 'Beta translated',
          status: 'completed',
          stageResults: {},
          judgeResult: {
            content: 'Beta translated',
            status: 'completed',
            rating: 'good',
            issues: [],
          },
        },
        {
          id: 'chunk-a',
          originalText: 'Alpha',
          currentDraft: 'Alpha translated',
          status: 'completed',
          stageResults: {},
          judgeResult: {
            content: 'Alpha translated',
            status: 'completed',
            rating: 'excellent',
            issues: [],
          },
        },
      ],
    });

    expect(dbMocks.runInTransaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('source_text = $7'),
      expect.arrayContaining([
        'Judge',
        'gemini-3-flash-preview',
        'gemini',
        2,
        'Alpha\n\nBeta',
        'proj-1',
      ]),
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('position'),
      ['chunk-b', 'proj-1', 'Beta', 'Beta translated', 0, 'completed', '{}', 'completed', 'good', '[]'],
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('position'),
      ['chunk-a', 'proj-1', 'Alpha', 'Alpha translated', 1, 'completed', '{}', 'completed', 'excellent', '[]'],
    );
  });

  it('rolls back the transaction when a chunk save fails', async () => {
    dbMocks.execute.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO translations')) {
        throw new Error('disk full');
      }
    });

    await expect(
      saveProjectState({
        projectId: 'proj-1',
        inputText: 'Alpha',
        config: {
          sourceLanguage: 'Latin',
          targetLanguage: 'English',
          stages: [],
          judgePrompt: 'Judge',
          judgeModel: 'gemini-3-flash-preview',
          judgeProvider: 'gemini',
          glossary: [],
          useChunking: true,
          targetChunkCount: 1,
        },
        viewMode: 'document',
        chunks: [
          {
            id: 'chunk-a',
            originalText: 'Alpha',
            currentDraft: 'Alpha translated',
            status: 'completed',
            stageResults: {},
            judgeResult: {
              content: 'Alpha translated',
              status: 'completed',
              rating: 'excellent',
              issues: [],
            },
          },
        ],
      }),
    ).rejects.toThrow('disk full');

    expect(dbMocks.runInTransaction).toHaveBeenCalledTimes(1);
  });

  it('loads translations ordered by explicit position before timestamps', async () => {
    dbMocks.select.mockResolvedValueOnce([]);

    await loadTranslations('proj-1');

    expect(dbMocks.select).toHaveBeenCalledWith(
      'SELECT * FROM translations WHERE project_id = $1 ORDER BY CASE WHEN position IS NULL THEN 1 ELSE 0 END, position ASC, created_at ASC',
      ['proj-1'],
    );
  });
});
