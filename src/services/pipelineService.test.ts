import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineConfig } from '../types';
import { makeTranslationChunk } from '../test/chunkFactory';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const {
  getPipelineConfig,
  savePipelineConfig,
  saveFullState,
  loadTranslations,
  restoreTranslations,
} = await import('./pipelineService');

const basePipelineRow = {
  id: 'pipeline-1',
  project_id: 'proj-1',
  name: 'Default',
  source_language: 'Latin',
  target_language: 'English',
  pipeline_mode: 'standard',
  stages: '[]',
  judge_prompt: 'Judge',
  judge_model: 'gemini-3-flash-preview',
  judge_provider: 'gemini',
  use_chunking: 1,
  words_per_chunk: 5,
  source_display_text: null,
  source_processing_text: null,
  source_footnotes: '[]',
  review_provider_options: null,
  persona: null,
  custom_source_language: null,
  custom_target_language: null,
  blob_budget_tokens: null,
  blob_overlap: null,
  run_status: 'idle',
  last_run_config: null,
  run_in_progress: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const baseConfig: PipelineConfig = {
  sourceLanguage: 'Italian',
  targetLanguage: 'English',
  stages: [],
  judgePrompt: 'Judge',
  judgeModel: 'gemini-3-flash-preview',
  judgeProvider: 'gemini',
  glossary: [
    { id: 'entry-1', term: 'virtute', translation: 'virtue', notes: 'Keep ethical sense' },
  ],
  useChunking: true,
  wordsPerChunk: 8,
  documentFormat: 'markdown',
  markdownAware: true,
  experimentalImport: 'docx-markdown',
  reviewProviderOptions: {
    ollama: { temperature: 0.1, keepAlive: '15m', think: false, numCtx: 8192 },
  },
  renderProfile: 'markdown',
};

describe('pipelineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.runInTransaction.mockImplementation(
      async (fn: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<unknown>) =>
        fn(dbMocks.execute),
    );
  });

  // ── savePipelineConfig ───────────────────────────────────────────────

  describe('savePipelineConfig', () => {
    it('updates the pipelines table without touching glossary tables', async () => {
      await savePipelineConfig('pipeline-1', baseConfig);

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pipelines SET'),
        expect.any(Array),
      );
      expect(dbMocks.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO glossaries'),
        expect.any(Array),
      );
      expect(dbMocks.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO glossary_entries'),
        expect.any(Array),
      );
      expect(dbMocks.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM glossary_entries'),
        expect.any(Array),
      );
    });

    it('serializes reviewProviderOptions as JSON', async () => {
      await savePipelineConfig('pipeline-1', baseConfig);

      const [, params] = dbMocks.execute.mock.calls[0] as [string, unknown[]];
      expect(params).toContain(
        '{"ollama":{"temperature":0.1,"keepAlive":"15m","think":false,"numCtx":8192}}',
      );
    });
  });

  // ── getPipelineConfig ────────────────────────────────────────────────

  describe('getPipelineConfig', () => {
    it('restores glossary ids and target chunk count from saved config', async () => {
      dbMocks.select
        .mockResolvedValueOnce([
          {
            ...basePipelineRow,
            review_provider_options:
              '{"ollama":{"temperature":0.1,"keepAlive":"15m","think":false,"numCtx":8192}}',
          },
        ])
        .mockResolvedValueOnce([{ glossary_id: 'glossary-proj-1' }])
        .mockResolvedValueOnce([
          { id: 'entry-1', term: 'virtute', translation: 'virtue', notes: 'Keep ethical sense' },
        ]);

      const result = await getPipelineConfig('pipeline-1');

      expect(result).not.toBeNull();
      expect(result?.config.sourceLanguage).toBe('Latin');
      expect(result?.config.targetLanguage).toBe('English');
      expect(result?.config.wordsPerChunk).toBe(5);
      expect(result?.config.reviewProviderOptions).toEqual({
        ollama: { temperature: 0.1, keepAlive: '15m', think: false, numCtx: 8192 },
      });
      expect(result?.config.assignedGlossaryId).toBe('glossary-proj-1');
      expect(result?.config.glossary).toEqual([
        { id: 'entry-1', term: 'virtute', translation: 'virtue', notes: 'Keep ethical sense' },
      ]);
    });

    it('returns null when the pipeline does not exist', async () => {
      dbMocks.select.mockResolvedValueOnce([]);

      const result = await getPipelineConfig('pipeline-missing');

      expect(result).toBeNull();
    });

    it('returns empty stages array when the stored stages column is corrupted JSON', async () => {
      dbMocks.select
        .mockResolvedValueOnce([{ ...basePipelineRow, stages: '{{not valid json}}' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getPipelineConfig('pipeline-1');

      expect(result).not.toBeNull();
      expect(result?.config.stages).toEqual([]);
    });

    it('returns empty sourceFootnotes when the column is null', async () => {
      dbMocks.select
        .mockResolvedValueOnce([{ ...basePipelineRow, source_footnotes: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getPipelineConfig('pipeline-1');

      expect(result?.sourceFootnotes).toEqual([]);
    });
  });

  // ── saveFullState ────────────────────────────────────────────────────

  describe('saveFullState', () => {
    it('updates the pipeline row and writes chunk translations', async () => {
      const run = vi.fn().mockResolvedValue(undefined);
      const chunks = [
        makeTranslationChunk({
          id: 'chunk-b',
          originalText: 'Beta',
          currentDraft: 'Beta translated',
          status: 'completed',
          translationLocked: true,
          blobId: 'blob-1',
          blobOrder: 1,
          blobReferenceChunkIds: ['chunk-a', 'chunk-b'],
          stageResults: {},
          judgeResult: { content: 'Beta translated', status: 'completed', rating: 'good', issues: [] },
        }),
        makeTranslationChunk({
          id: 'chunk-a',
          originalText: 'Alpha',
          currentDraft: 'Alpha translated',
          status: 'completed',
          stageResults: {},
          judgeResult: { content: 'Alpha translated', status: 'completed', rating: 'excellent', issues: [] },
        }),
      ];

      await saveFullState('proj-1', 'pipeline-1', baseConfig, chunks, run);

      expect(run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pipelines SET'),
        expect.any(Array),
      );
      expect(run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO translations'),
        expect.arrayContaining(['chunk-b', 'pipeline-1']),
      );
      expect(run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO translations'),
        expect.arrayContaining(['chunk-a', 'pipeline-1']),
      );
    });

    it('propagates errors thrown by the run function', async () => {
      let callCount = 0;
      const run = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('disk full');
      });

      await expect(
        saveFullState('proj-1', 'pipeline-1', baseConfig, [
          makeTranslationChunk({
            id: 'chunk-a',
            originalText: 'Alpha',
            currentDraft: 'Alpha translated',
            status: 'completed',
            stageResults: {},
            judgeResult: { content: 'Alpha translated', status: 'completed', rating: 'excellent', issues: [] },
          }),
        ], run),
      ).rejects.toThrow('disk full');
    });

    it('skips translation writes when chunks array is empty', async () => {
      const run = vi.fn().mockResolvedValue(undefined);

      await saveFullState('proj-1', 'pipeline-1', baseConfig, [], run);

      // Only the UPDATE pipelines call; no INSERT INTO translations
      expect(run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pipelines SET'),
        expect.any(Array),
      );
      expect(run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO translations'),
        expect.any(Array),
      );
    });
  });

  // ── loadTranslations ─────────────────────────────────────────────────

  describe('loadTranslations', () => {
    it('queries by pipeline_id ordered by position then created_at', async () => {
      dbMocks.select.mockResolvedValueOnce([]);

      await loadTranslations('pipeline-1');

      expect(dbMocks.select).toHaveBeenCalledWith(
        expect.stringContaining('WHERE pipeline_id = $1'),
        ['pipeline-1'],
      );
      expect(dbMocks.select).toHaveBeenCalledWith(
        expect.stringContaining('position ASC, created_at ASC'),
        expect.any(Array),
      );
    });
  });

  // ── restoreTranslations ──────────────────────────────────────────────

  describe('restoreTranslations', () => {
    it('returns empty display fields when new columns are absent', () => {
      const restored = restoreTranslations([
        {
          id: 'chunk-1',
          project_id: 'proj-1',
          original_text: 'Source',
          final_translation: 'Old translation',
          chunk_status: 'completed',
          stage_results: JSON.stringify({ 'stg-1': { content: 'Stage translation', status: 'completed' } }),
          judge_status: 'completed',
          judge_rating: 'good',
          judge_issues: '[]',
          created_at: '2026-04-29T00:00:00Z',
        },
      ]);

      expect(restored[0]?.translationDisplayText).toBe('');
      expect(restored[0]?.translationProcessingText).toBe('');
      expect(restored[0]?.currentDraft).toBe('');
      expect(restored[0]?.sourceDisplayText).toBe('');
      expect(restored[0]?.sourceProcessingText).toBe('');
    });

    it('maps source_display_text and translation_display_text to chunk fields', () => {
      const restored = restoreTranslations([
        {
          id: 'chunk-1',
          project_id: 'proj-1',
          original_text: 'Legacy source',
          final_translation: 'Legacy translation',
          source_display_text: 'Display source',
          source_processing_text: 'Processing source',
          translation_display_text: 'Display translation',
          translation_processing_text: 'Processing translation',
          chunk_status: 'completed',
          stage_results: '{}',
          judge_status: 'idle',
          judge_rating: 'fair',
          judge_issues: '[]',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      expect(restored[0]?.sourceDisplayText).toBe('Display source');
      expect(restored[0]?.sourceProcessingText).toBe('Processing source');
      expect(restored[0]?.translationDisplayText).toBe('Display translation');
      expect(restored[0]?.translationProcessingText).toBe('Processing translation');
      expect(restored[0]?.originalText).toBe('Legacy source');
      expect(restored[0]?.currentDraft).toBe('Display translation');
    });

    it('restores persisted blob reference windows', () => {
      const restored = restoreTranslations([
        {
          id: 'chunk-1',
          project_id: 'proj-1',
          original_text: 'Source',
          final_translation: 'Translation',
          source_display_text: 'Source',
          source_processing_text: 'Source',
          translation_display_text: 'Translation',
          translation_processing_text: 'Translation',
          chunk_status: 'completed',
          stage_results: '{}',
          judge_status: 'completed',
          judge_rating: 'good',
          judge_issues: '[]',
          blob_id: 'blob-1',
          blob_order: 2,
          blob_reference_chunk_ids: '["chunk-0","chunk-1","chunk-2"]',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      expect(restored[0]?.blobId).toBe('blob-1');
      expect(restored[0]?.blobOrder).toBe(2);
      expect(restored[0]?.blobReferenceChunkIds).toEqual(['chunk-0', 'chunk-1', 'chunk-2']);
    });
  });
});
