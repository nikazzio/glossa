import { describe, it, expect, beforeEach } from 'vitest';
import { usePipelineStore } from './pipelineStore';

describe('pipelineStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    const store = usePipelineStore.getState();
    store.setInputText('');
    store.clearChunks();
    store.setIsProcessing(false);
    store.setShowSettings(false);
    store.setOllamaModels([]);
    store.setOllamaStatus('unknown');
    // Reset config to defaults (especially useChunking)
    store.setConfig((prev) => ({ ...prev, useChunking: true }));
  });

  describe('basic setters', () => {
    it('sets input text', () => {
      usePipelineStore.getState().setInputText('Hello world');
      expect(usePipelineStore.getState().inputText).toBe('Hello world');
    });

    it('toggles settings visibility', () => {
      usePipelineStore.getState().setShowSettings(true);
      expect(usePipelineStore.getState().showSettings).toBe(true);
    });

    it('sets processing state', () => {
      usePipelineStore.getState().setIsProcessing(true);
      expect(usePipelineStore.getState().isProcessing).toBe(true);
    });

    it('sets ollama models', () => {
      usePipelineStore.getState().setOllamaModels(['llama3', 'mistral']);
      expect(usePipelineStore.getState().ollamaModels).toEqual(['llama3', 'mistral']);
    });

    it('sets ollama status', () => {
      usePipelineStore.getState().setOllamaStatus('connected');
      expect(usePipelineStore.getState().ollamaStatus).toBe('connected');
    });
  });

  describe('config management', () => {
    it('updates config with object', () => {
      const newConfig = { ...usePipelineStore.getState().config, sourceLanguage: 'French' };
      usePipelineStore.getState().setConfig(newConfig);
      expect(usePipelineStore.getState().config.sourceLanguage).toBe('French');
    });

    it('updates config with function', () => {
      usePipelineStore.getState().setConfig((prev) => ({
        ...prev,
        targetLanguage: 'Spanish',
      }));
      expect(usePipelineStore.getState().config.targetLanguage).toBe('Spanish');
    });
  });

  describe('chunk generation', () => {
    it('generates chunks from paragraphs when chunking enabled', () => {
      usePipelineStore.getState().setInputText('Paragraph one.\n\nParagraph two.');
      usePipelineStore.getState().generateChunks();
      const chunks = usePipelineStore.getState().chunks;
      expect(chunks).toHaveLength(2);
      expect(chunks[0].originalText).toBe('Paragraph one.');
      expect(chunks[1].originalText).toBe('Paragraph two.');
    });

    it('generates single chunk when chunking disabled', () => {
      usePipelineStore.getState().setConfig((prev) => ({ ...prev, useChunking: false }));
      usePipelineStore.getState().setInputText('Paragraph one.\n\nParagraph two.');
      usePipelineStore.getState().generateChunks();
      const chunks = usePipelineStore.getState().chunks;
      expect(chunks).toHaveLength(1);
      expect(chunks[0].originalText).toContain('Paragraph one.');
      expect(chunks[0].originalText).toContain('Paragraph two.');
    });

    it('does not generate chunks from empty input', () => {
      usePipelineStore.getState().setInputText('   ');
      usePipelineStore.getState().generateChunks();
      expect(usePipelineStore.getState().chunks).toHaveLength(0);
    });

    it('clears chunks', () => {
      usePipelineStore.getState().setInputText('Some text');
      usePipelineStore.getState().generateChunks();
      expect(usePipelineStore.getState().chunks.length).toBeGreaterThan(0);
      usePipelineStore.getState().clearChunks();
      expect(usePipelineStore.getState().chunks).toHaveLength(0);
    });

    it('initializes chunks with correct structure', () => {
      usePipelineStore.getState().setInputText('Test text');
      usePipelineStore.getState().generateChunks();
      const chunk = usePipelineStore.getState().chunks[0];
      expect(chunk.id).toBe('chunk-0');
      expect(chunk.stageResults).toEqual({});
      expect(chunk.judgeResult.status).toBe('idle');
      expect(chunk.judgeResult.score).toBe(0);
      expect(chunk.judgeResult.issues).toEqual([]);
      expect(chunk.currentDraft).toBe('');
    });
  });

  describe('chunk updates', () => {
    beforeEach(() => {
      usePipelineStore.getState().setInputText('Test chunk');
      usePipelineStore.getState().generateChunks();
    });

    it('updates stage result for a chunk', () => {
      usePipelineStore.getState().updateChunkStage('chunk-0', 'stg-1', {
        content: 'Translated text',
        status: 'completed',
      });
      const result = usePipelineStore.getState().chunks[0].stageResults['stg-1'];
      expect(result.content).toBe('Translated text');
      expect(result.status).toBe('completed');
    });

    it('appends streaming tokens to stage content', () => {
      usePipelineStore.getState().appendChunkStageContent('chunk-0', 'stg-1', 'Hello');
      usePipelineStore.getState().appendChunkStageContent('chunk-0', 'stg-1', ' world');
      const result = usePipelineStore.getState().chunks[0].stageResults['stg-1'];
      expect(result.content).toBe('Hello world');
    });

    it('updates judge result for a chunk', () => {
      usePipelineStore.getState().updateChunkJudge('chunk-0', {
        content: 'Audit result',
        status: 'completed',
        score: 8.5,
        issues: [{ type: 'fluency', severity: 'low', description: 'Minor issue' }],
      });
      const judge = usePipelineStore.getState().chunks[0].judgeResult;
      expect(judge.score).toBe(8.5);
      expect(judge.issues).toHaveLength(1);
    });

    it('updates chunk draft', () => {
      usePipelineStore.getState().updateChunkDraft('chunk-0', 'Edited translation');
      expect(usePipelineStore.getState().chunks[0].currentDraft).toBe('Edited translation');
    });

    it('does not affect other chunks', () => {
      usePipelineStore.getState().setInputText('First paragraph here\n\nSecond paragraph here');
      usePipelineStore.getState().generateChunks();
      usePipelineStore.getState().updateChunkDraft('chunk-0', 'Modified');
      expect(usePipelineStore.getState().chunks[1].currentDraft).toBe('');
    });
  });

  describe('stage management', () => {
    it('adds a new stage', () => {
      const initialCount = usePipelineStore.getState().config.stages.length;
      usePipelineStore.getState().addStage();
      expect(usePipelineStore.getState().config.stages.length).toBe(initialCount + 1);
      const newStage = usePipelineStore.getState().config.stages.at(-1)!;
      expect(newStage.name).toBe('New Stage');
      expect(newStage.enabled).toBe(true);
    });

    it('removes a stage by id', () => {
      const stages = usePipelineStore.getState().config.stages;
      const idToRemove = stages[0].id;
      usePipelineStore.getState().removeStage(idToRemove);
      expect(usePipelineStore.getState().config.stages.find((s) => s.id === idToRemove)).toBeUndefined();
    });

    it('updates a stage', () => {
      const stageId = usePipelineStore.getState().config.stages[0].id;
      usePipelineStore.getState().updateStage(stageId, { name: 'Renamed', provider: 'openai' });
      const updated = usePipelineStore.getState().config.stages.find((s) => s.id === stageId)!;
      expect(updated.name).toBe('Renamed');
      expect(updated.provider).toBe('openai');
    });
  });
});
