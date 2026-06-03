import { describe, it, expect } from 'vitest';
import { buildMemoryInjection } from './phraseMemoryInjection';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

const makeMatch = (src: string, tgt: string): PhraseMemoryMatch => ({
  id: 'x', sourcePhrase: src, targetPhrase: tgt, score: 0.9, createdAt: '',
});

describe('buildMemoryInjection', () => {
  it('returns null for empty array', () => {
    expect(buildMemoryInjection([])).toBeNull();
  });

  it('returns formatted block for one match', () => {
    const result = buildMemoryInjection([makeMatch('hello', 'ciao')]);
    expect(result).toContain('Translation memory references');
    expect(result).toContain('"hello" → "ciao"');
  });

  it('returns one line per match', () => {
    const result = buildMemoryInjection([makeMatch('a', 'A'), makeMatch('b', 'B')]);
    expect(result).toContain('"a" → "A"');
    expect(result).toContain('"b" → "B"');
  });

  it('output starts with the header comment', () => {
    const result = buildMemoryInjection([makeMatch('x', 'y')]);
    expect(result?.startsWith('Translation memory references')).toBe(true);
  });
});
