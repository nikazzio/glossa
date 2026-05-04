import { describe, it, expect } from 'vitest';
import {
  calculateCompositeQuality,
  chunkText,
  estimateTextStats,
  indexPad,
  normalizeQualityRating,
  resolveSplitIndex,
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

  it('keeps markdown footnote blocks intact when chunking markdown-aware content', () => {
    const text = [
      'Opening paragraph with a note[^1].',
      '',
      '[^1]: Footnote line one',
      'Continues on a second line.',
      '',
      'Closing paragraph.',
    ].join('\n');

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 2,
      markdownAware: true,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('[^1]: Footnote line one');
    expect(chunks[0]).toContain('Continues on a second line.');
    expect(chunks[1]).toBe('Closing paragraph.');
  });

  it('does not word-split single-block markdown-aware content', () => {
    const text = 'Text with [link](https://example.com) and note[^1]\n[^1]: Footnote body';

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 3,
      markdownAware: true,
    });

    expect(chunks).toEqual([text]);
  });

  it('merges heading-only chunks into the following chunk', () => {
    const text = [
      '# Heading',
      'This paragraph should stay with the heading.',
      'A second paragraph that can remain separate.',
    ].join('\n\n');

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 0,
      headingAware: true,
    });

    expect(chunks).toEqual([
      '# Heading\n\nThis paragraph should stay with the heading.',
      'A second paragraph that can remain separate.',
    ]);
  });

  it('merges chunks smaller than the configured minimum forward', () => {
    const text = [
      'Tiny intro.',
      'This is a much longer paragraph with enough words to absorb the intro cleanly.',
      'Closing section stays on its own.',
    ].join('\n\n');

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 0,
      minWords: 4,
    });

    expect(chunks).toEqual([
      'Tiny intro.\n\nThis is a much longer paragraph with enough words to absorb the intro cleanly.',
      'Closing section stays on its own.',
    ]);
  });

  it('splits oversized plain-text chunks using maxWords', () => {
    const text = Array.from({ length: 12 }, (_, i) => `word${i + 1}`).join(' ');

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 1,
      maxWords: 5,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('word1 word2 word3 word4');
    expect(chunks[1]).toBe('word5 word6 word7 word8');
    expect(chunks[2]).toBe('word9 word10 word11 word12');
  });

  it('does not split oversized markdown-aware chunks by words', () => {
    const text = [
      '# Heading',
      'Paragraph one with several words.',
      'Paragraph two keeps markdown spacing intact.',
    ].join('\n\n');

    const chunks = chunkText(text, {
      useChunking: true,
      targetChunkCount: 0,
      markdownAware: true,
      maxWords: 3,
    });

    expect(chunks).toEqual([
      '# Heading',
      'Paragraph one with several words.',
      'Paragraph two keeps markdown spacing intact.',
    ]);
  });

  it('allows manual split on markdown content without blank-line boundaries', () => {
    const text = '- item one\n- item two\n- item three';
    const splitAt = resolveSplitIndex(text, 10, { markdownAware: true });

    expect(splitAt).toBe(10);
  });
});
