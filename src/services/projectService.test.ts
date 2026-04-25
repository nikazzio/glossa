import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineConfig } from '../types';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { getProjectConfig, saveProjectConfig } = await import('./projectService');

describe('projectService glossary persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    await saveProjectConfig('proj-1', config);

    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pipeline_configs SET'),
      expect.arrayContaining([8, 'proj-1']),
    );
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE projects SET source_language = $1, target_language = $2'),
      ['Italian', 'English', 'proj-1'],
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
});
