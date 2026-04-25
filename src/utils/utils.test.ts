import { describe, it, expect } from 'vitest';
import {
  calculateCompositeQuality,
  chunkText,
  estimateTextStats,
  indexPad,
  normalizeQualityRating,
  recommendChunkCount,
} from './index';
import type { TranslationChunk } from '../types';

describe('indexPad', () => {
  it('pads single digit numbers', () => {
    expect(indexPad(1)).toBe('01');
    expect(indexPad(9)).toBe('09');
  });

  it('does not pad double digit numbers', () => {
    expect(indexPad(10)).toBe('10');
    expect(indexPad(99)).toBe('99');
  });
});

describe('calculateCompositeQuality', () => {
  const makeChunk = (
    rating: 'critical' | 'poor' | 'fair' | 'good' | 'excellent',
    status: 'completed' | 'idle' = 'completed',
  ): TranslationChunk => ({
    id: `chunk-test`,
    originalText: 'test',
    status: status === 'completed' ? 'completed' : 'ready',
    stageResults: {},
    judgeResult: { content: '', status, rating, issues: [] },
  });

  it('returns 0 for empty chunks', () => {
    expect(calculateCompositeQuality([])).toBeNull();
  });

  it('returns 0 when no chunks are completed', () => {
    expect(calculateCompositeQuality([makeChunk('excellent', 'idle')])).toBeNull();
  });

  it('returns the semantic average quality for completed chunks on a five-level scale', () => {
    const chunks = [makeChunk('excellent'), makeChunk('good'), makeChunk('fair')];
    expect(calculateCompositeQuality(chunks)).toBe('good');
  });

  it('ignores non-completed chunks', () => {
    const chunks = [makeChunk('good'), makeChunk('poor', 'idle')];
    expect(calculateCompositeQuality(chunks)).toBe('good');
  });
});

describe('normalizeQualityRating', () => {
  it('accepts semantic ratings returned by the judge', () => {
    expect(normalizeQualityRating('critico')).toBe('critical');
    expect(normalizeQualityRating('scarso')).toBe('poor');
    expect(normalizeQualityRating('sufficiente')).toBe('fair');
    expect(normalizeQualityRating('buono')).toBe('good');
    expect(normalizeQualityRating('ottimo')).toBe('excellent');
  });
});

describe('document chunking', () => {
  it('estimates words and recommends long-document chunk counts', () => {
    const text = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(' ');
    expect(estimateTextStats(text).words).toBe(1500);
    expect(recommendChunkCount(text)).toBe(3);
  });

  it('splits text into a requested number of chunks', () => {
    const text = [
      'One two three four.',
      'Five six seven eight.',
      'Nine ten eleven twelve.',
      'Thirteen fourteen fifteen sixteen.',
    ].join('\n\n');

    const chunks = chunkText(text, { useChunking: true, targetChunkCount: 2 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('One two');
    expect(chunks[1]).toContain('Thirteen');
  });

  it('falls back to one chunk when chunking is disabled', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    expect(chunkText(text, { useChunking: false, targetChunkCount: 4 })).toEqual([text]);
  });
});
