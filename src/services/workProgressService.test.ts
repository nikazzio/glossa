import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STAGES } from '../constants';
import type { PipelineConfig } from '../types';
import type { TranscriptionCatalogEntry } from './transcriptionCatalogService';
import type { TranslationCatalogEntry } from './translationCatalogService';

const mocks = vi.hoisted(() => ({ transcriptions: vi.fn(), translations: vi.fn(), output: vi.fn(), remaining: vi.fn(), configs: vi.fn() }));
vi.mock('./transcriptionCatalogService', () => ({ listTranscriptionCatalog: mocks.transcriptions }));
vi.mock('./translationCatalogService', () => ({ listTranslationCatalog: mocks.translations }));
vi.mock('./statsService', () => ({ loadDailyOutput: mocks.output, loadRemainingChunks: mocks.remaining }));
vi.mock('./pipelineService', () => ({ loadPipelineEstimateConfigs: mocks.configs }));
import { loadWorkProgress } from './workProgressService';

const translation = (id: string, overrides: Partial<TranslationCatalogEntry> = {}): TranslationCatalogEntry => ({
  id, name: id, workspaceId: 'w1', workspaceName: 'One', sourceLanguage: 'ita', targetLanguage: 'eng',
  updatedAt: '2026-10-01 10:00:00', chunkCount: 10, translatedChunks: 3, verifiedChunks: 1, ...overrides,
});
const transcription = (id: string, done: number, total: number | null, status = 'active'): TranscriptionCatalogEntry => ({
  document: { id, title: id, workspace_id: 'w1', status },
  work: total === null ? null : { expectedPages: total },
  pagesWithText: done, verifiedPages: 1, createdAt: '2026-01-01', lastEditedAt: '2026-10-02 10:00:00',
} as TranscriptionCatalogEntry);
const config: PipelineConfig = {
  pipelineId: 'pi', stages: DEFAULT_STAGES.map((stage) => ({ ...stage, provider: 'ollama', model: 'local', enabled: true })),
  judgePrompt: '', judgeProvider: 'ollama', judgeModel: 'local', glossary: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transcriptions.mockResolvedValue([]);
  mocks.translations.mockResolvedValue([]);
  mocks.output.mockResolvedValue({ transcriptions: [], translations: [] });
  mocks.remaining.mockResolvedValue([]);
  mocks.configs.mockResolvedValue(new Map());
});

describe('work progress', () => {
  it('includes only started, incomplete work in the selected workspace with a known total', async () => {
    mocks.transcriptions.mockResolvedValue([
      transcription('partial', 2, 8), transcription('complete', 8, 8), transcription('empty', 0, 8),
      transcription('unknown', 2, null), transcription('archived', 2, 8, 'archived'),
    ]);
    mocks.translations.mockResolvedValue([
      translation('active'), translation('complete', { translatedChunks: 10 }),
      translation('empty', { translatedChunks: 0 }), translation('other', { workspaceId: 'w2' }),
    ]);
    const items = await loadWorkProgress('w1');
    expect(items.map((item) => item.id)).toEqual(['partial', 'active']);
    expect(items[0]).toMatchObject({ done: 2, verified: 1, total: 8, forecast: null });
    expect(mocks.remaining).toHaveBeenCalledWith(['active']);
  });

  it('limits to the six most recent mixed items before loading remaining work', async () => {
    mocks.transcriptions.mockResolvedValue([transcription('latest', 1, 5)]);
    mocks.translations.mockResolvedValue(Array.from({ length: 8 }, (_, index) => translation(`p${index}`, { updatedAt: `2026-09-${String(index + 1).padStart(2, '0')} 10:00:00` })));
    const items = await loadWorkProgress(null);
    expect(items.map((item) => item.id)).toEqual(['latest', 'p7', 'p6', 'p5', 'p4', 'p3']);
    expect(mocks.remaining).toHaveBeenCalledTimes(1);
    expect(mocks.remaining).toHaveBeenCalledWith(['p7', 'p6', 'p5', 'p4', 'p3']);
    expect(mocks.configs).toHaveBeenCalledTimes(1);
  });

  it('uses worked days for forecasts and the remaining pipeline for cost', async () => {
    mocks.translations.mockResolvedValue([translation('p')]);
    mocks.output.mockResolvedValue({ transcriptions: [], translations: [1, 2, 3].map((day) => ({ id: 'p', day: `2026-09-0${day}`, count: 1 })) });
    mocks.remaining.mockResolvedValue([{ project_id: 'p', pipeline_id: 'pi', source_text: 'remaining words' }]);
    mocks.configs.mockResolvedValue(new Map([['pi', config]]));
    const [item] = await loadWorkProgress('w1');
    expect(item.workedDays).toBe(3);
    expect(item.forecast).not.toBeNull();
    expect(item.costToFinish).toEqual({ usd: 0, free: true });
    expect(mocks.configs).toHaveBeenCalledWith(['pi']);
  });
});
