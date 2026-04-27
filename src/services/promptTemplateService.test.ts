import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return { ...actual, generateId: vi.fn(() => 'tpl-test-id') };
});

const {
  getPromptTemplates,
  savePromptTemplate,
  deletePromptTemplate,
} = await import('./promptTemplateService');

describe('promptTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPromptTemplates', () => {
    it('returns mapped templates ordered by name', async () => {
      dbMocks.select.mockResolvedValueOnce([
        { id: 'tpl-1', name: 'Alpha', prompt: 'Do alpha', default_model: 'gpt-4o', default_provider: 'openai', created_at: '2024-01-01' },
        { id: 'tpl-2', name: 'Beta', prompt: 'Do beta', default_model: '', default_provider: '', created_at: '2024-01-02' },
      ]);

      const templates = await getPromptTemplates();

      expect(dbMocks.select).toHaveBeenCalledWith(
        expect.stringContaining('FROM prompt_templates'),
      );
      expect(templates).toHaveLength(2);
      expect(templates[0]).toMatchObject({
        id: 'tpl-1',
        name: 'Alpha',
        prompt: 'Do alpha',
        defaultModel: 'gpt-4o',
        defaultProvider: 'openai',
        createdAt: '2024-01-01',
      });
      expect(templates[1].defaultModel).toBeUndefined();
      expect(templates[1].defaultProvider).toBeUndefined();
    });

    it('returns empty array when no templates exist', async () => {
      dbMocks.select.mockResolvedValueOnce([]);
      const templates = await getPromptTemplates();
      expect(templates).toEqual([]);
    });
  });

  describe('savePromptTemplate', () => {
    it('inserts a new template with a generated id', async () => {
      await savePromptTemplate({ name: 'My prompt', prompt: 'Translate carefully' });

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO prompt_templates'),
        expect.arrayContaining(['tpl-test-id', 'My prompt', 'Translate carefully']),
      );
    });

    it('uses ON CONFLICT upsert on name collision', async () => {
      await savePromptTemplate({ name: 'Existing', prompt: 'Updated content' });

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT(name) DO UPDATE SET'),
        expect.any(Array),
      );
    });

    it('returns void (does not return the id)', async () => {
      const result = await savePromptTemplate({ name: 'Test', prompt: 'Test prompt' });
      expect(result).toBeUndefined();
    });

    it('stores empty strings for missing optional fields', async () => {
      await savePromptTemplate({ name: 'Minimal', prompt: 'Min prompt' });

      const callArgs = dbMocks.execute.mock.calls[0][1] as unknown[];
      expect(callArgs[3]).toBe('');
      expect(callArgs[4]).toBe('');
    });

    it('stores provided model and provider', async () => {
      await savePromptTemplate({
        name: 'Full',
        prompt: 'Full prompt',
        defaultModel: 'claude-3-5-sonnet-latest',
        defaultProvider: 'anthropic',
      });

      const callArgs = dbMocks.execute.mock.calls[0][1] as unknown[];
      expect(callArgs[3]).toBe('claude-3-5-sonnet-latest');
      expect(callArgs[4]).toBe('anthropic');
    });
  });

  describe('deletePromptTemplate', () => {
    it('deletes by id', async () => {
      await deletePromptTemplate('tpl-99');

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM prompt_templates'),
        ['tpl-99'],
      );
    });
  });
});
