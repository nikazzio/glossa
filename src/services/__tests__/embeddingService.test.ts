import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { fetchEmbeddings, estimateEmbeddingCostUsd, estimateTokenCount } from '../embeddingService';

const mockInvoke = vi.mocked(invoke);

describe('embeddingService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('fetchEmbeddings', () => {
    it('restituisce array di vettori per input valido', async () => {
      const vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      mockInvoke.mockResolvedValueOnce(vectors);

      const result = await fetchEmbeddings(['ciao mondo', 'hello world'], 'text-embedding-3-small');

      expect(mockInvoke).toHaveBeenCalledWith('get_embeddings', {
        texts: ['ciao mondo', 'hello world'],
        model: 'text-embedding-3-small',
      });
      expect(result).toEqual(vectors);
    });

    it('restituisce array vuoto senza chiamare invoke per input vuoto', async () => {
      const result = await fetchEmbeddings([], 'text-embedding-3-small');
      expect(result).toEqual([]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('propaga errore se invoke fallisce', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('API key missing'));
      await expect(fetchEmbeddings(['testo'], 'text-embedding-3-small')).rejects.toThrow('API key missing');
    });
  });

  describe('estimateEmbeddingCostUsd', () => {
    it('stima costo per text-embedding-3-small', () => {
      expect(estimateEmbeddingCostUsd(1000, 'text-embedding-3-small')).toBeCloseTo(0.00002, 8);
    });

    it('stima costo per text-embedding-3-large', () => {
      expect(estimateEmbeddingCostUsd(1000, 'text-embedding-3-large')).toBeCloseTo(0.00013, 8);
    });

    it('restituisce 0 per 0 token', () => {
      expect(estimateEmbeddingCostUsd(0, 'text-embedding-3-small')).toBe(0);
    });
  });

  describe('estimateTokenCount', () => {
    it('stima token da testo non vuoto', () => {
      expect(estimateTokenCount('ciao mondo test')).toBeGreaterThan(0);
    });

    it('restituisce 0 per stringa vuota', () => {
      expect(estimateTokenCount('')).toBe(0);
    });
  });
});
