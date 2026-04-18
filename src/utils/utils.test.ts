import { describe, it, expect } from 'vitest';
import { calculateCompositeScore, indexPad } from './index';
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

describe('calculateCompositeScore', () => {
  const makeChunk = (score: number, status: 'completed' | 'idle' = 'completed'): TranslationChunk => ({
    id: `chunk-${Math.random()}`,
    originalText: 'test',
    stageResults: {},
    judgeResult: { content: '', status, score, issues: [] },
  });

  it('returns 0 for empty chunks', () => {
    expect(calculateCompositeScore([])).toBe(0);
  });

  it('returns 0 when no chunks are completed', () => {
    expect(calculateCompositeScore([makeChunk(8, 'idle')])).toBe(0);
  });

  it('calculates average score × 10', () => {
    const chunks = [makeChunk(8), makeChunk(6)];
    expect(calculateCompositeScore(chunks)).toBe(70); // (8+6)/2 * 10
  });

  it('ignores non-completed chunks', () => {
    const chunks = [makeChunk(10), makeChunk(5, 'idle')];
    expect(calculateCompositeScore(chunks)).toBe(100); // only 10 counted
  });

  it('rounds the result', () => {
    const chunks = [makeChunk(7), makeChunk(8), makeChunk(9)];
    expect(calculateCompositeScore(chunks)).toBe(80); // (7+8+9)/3 * 10 = 80
  });
});
