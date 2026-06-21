import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

import { deeplService } from './deeplService';

describe('deeplService.runDeeplStage', () => {
  beforeEach(() => { mockInvoke.mockReset(); });

  it('chiama run_deepl_stage con i parametri corretti', async () => {
    mockInvoke.mockResolvedValue({ content: 'Hallo', billedCharacters: 5 });
    const result = await deeplService.runDeeplStage({
      text: 'Hello',
      sourceLang: 'EN',
      targetLang: 'DE',
      deeplConfig: { modelType: 'prefer_quality_optimized' },
    });
    expect(mockInvoke).toHaveBeenCalledWith('run_deepl_stage', {
      input: expect.objectContaining({ text: 'Hello', targetLang: 'DE' }),
    });
    expect(result.content).toBe('Hallo');
    expect(result.billedCharacters).toBe(5);
  });

  it('propaga errori dal backend', async () => {
    mockInvoke.mockRejectedValue('API key DeepL non configurata.');
    await expect(
      deeplService.runDeeplStage({ text: 'test', sourceLang: 'EN', targetLang: 'DE' }),
    ).rejects.toMatch('API key');
  });
});

describe('deeplService.getLanguages', () => {
  it('chiama get_deepl_languages con lang_type', async () => {
    mockInvoke.mockResolvedValue([{ language: 'DE', name: 'German', supportsFormality: true }]);
    const langs = await deeplService.getLanguages('target');
    expect(mockInvoke).toHaveBeenCalledWith('get_deepl_languages', { langType: 'target' });
    expect(langs[0].language).toBe('DE');
  });
});

describe('deeplService — glossari', () => {
  it('listGlossaries chiama list_deepl_glossaries', async () => {
    mockInvoke.mockResolvedValue([{ glossaryId: 'g1', name: 'Test', sourceLang: 'EN', targetLang: 'IT', entryCount: 5, ready: true, creationTime: '' }]);
    const list = await deeplService.listGlossaries();
    expect(mockInvoke).toHaveBeenCalledWith('list_deepl_glossaries');
    expect(list[0].name).toBe('Test');
  });

  it('createGlossary passa name, lingue ed entries', async () => {
    mockInvoke.mockResolvedValue({ glossaryId: 'g2', name: 'Nuovo', ready: true, sourceLang: 'EN', targetLang: 'IT', entryCount: 1, creationTime: '' });
    await deeplService.createGlossary({ name: 'Nuovo', sourceLang: 'EN', targetLang: 'IT', entries: [{ source: 'Hello', target: 'Ciao' }] });
    expect(mockInvoke).toHaveBeenCalledWith('create_deepl_glossary', expect.objectContaining({ input: expect.objectContaining({ name: 'Nuovo' }) }));
  });

  it('deleteGlossary passa glossaryId', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deeplService.deleteGlossary('g1');
    expect(mockInvoke).toHaveBeenCalledWith('delete_deepl_glossary', { glossaryId: 'g1' });
  });
});
