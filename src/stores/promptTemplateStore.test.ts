import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/promptTemplateService', () => ({
  getPromptTemplates: vi.fn().mockResolvedValue([]),
  savePromptTemplate: vi.fn().mockResolvedValue(undefined),
  deletePromptTemplate: vi.fn().mockResolvedValue(undefined),
}));

import { usePromptTemplateStore } from './promptTemplateStore';
import { savePromptTemplate, getPromptTemplates } from '../services/promptTemplateService';

const initial = usePromptTemplateStore.getState();

beforeEach(() => {
  usePromptTemplateStore.setState(initial, true);
  vi.clearAllMocks();
});

describe('promptTemplateStore', () => {
  it('saveTemplate passes workflow to service', async () => {
    vi.mocked(getPromptTemplates).mockResolvedValue([]);
    await usePromptTemplateStore.getState().saveTemplate(
      'TestTemplate', 'prompt text', 'stage', 'transcription', undefined, undefined,
    );
    expect(savePromptTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'transcription' }),
    );
  });

  it("saveTemplate passes 'translation' workflow to service", async () => {
    vi.mocked(getPromptTemplates).mockResolvedValue([]);
    await usePromptTemplateStore.getState().saveTemplate(
      'T', 'p', 'stage', 'translation',
    );
    expect(savePromptTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'translation' }),
    );
  });
});
