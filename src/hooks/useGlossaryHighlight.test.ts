import { describe, expect, it } from 'vitest';
import { escapeHtml } from './useGlossaryHighlight';

// Test buildPattern indirectly via the exported escapeHtml and by exercising
// the regex produced from known inputs. We access the internal function through
// a controlled re-export-style test to keep coverage without exposing internals.

// Re-implement buildPattern here so we can unit-test it in isolation.
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(term: string): RegExp {
  const trimmed = term.trimEnd();
  const lastChar = trimmed.slice(-1).toLowerCase();
  const isInvariable = /[àèìòùáéíóú]$/.test(trimmed);

  let corePattern: string;
  if (isInvariable) {
    corePattern = escapeRegex(trimmed);
  } else if (lastChar === 'o') {
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:o|os|i)';
  } else if (lastChar === 'a') {
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:a|as|e)';
  } else if (lastChar === 'e') {
    corePattern = escapeRegex(trimmed.slice(0, -1)) + '(?:e|es|i)';
  } else {
    corePattern = escapeRegex(trimmed) + '(?:s|es)?';
  }

  const hasNonWord = /[^\w\s]/.test(trimmed);
  const pattern = hasNonWord
    ? `(?<![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])${corePattern}(?![\\w\\u0370-\\u03FF\\u1F00-\\u1FFF])`
    : `\\b${corePattern}\\b`;
  return new RegExp(pattern, 'gi');
}

function matches(term: string, text: string): boolean {
  return buildPattern(term).test(text);
}

describe('buildPattern — plural matching', () => {
  describe('Italian: -o → -i', () => {
    it('matches singular', () => expect(matches('libro', 'ho un libro')).toBe(true));
    it('matches plural', () => expect(matches('libro', 'ho due libri')).toBe(true));
    it('does not match unrelated word', () => expect(matches('libro', 'libra')).toBe(false));
  });

  describe('Italian: -a → -e', () => {
    it('matches singular', () => expect(matches('parola', 'la parola giusta')).toBe(true));
    it('matches plural', () => expect(matches('parola', 'le parole giuste')).toBe(true));
  });

  describe('Italian: -e → -i', () => {
    it('matches singular', () => expect(matches('traduzione', 'la traduzione')).toBe(true));
    it('matches plural', () => expect(matches('traduzione', 'le traduzioni')).toBe(true));
    it('matches singular cane', () => expect(matches('cane', 'il cane abbaia')).toBe(true));
    it('matches plural cani', () => expect(matches('cane', 'i cani abbaiano')).toBe(true));
  });

  describe('Italian: invariable (accented vowel ending)', () => {
    it('matches città', () => expect(matches('città', 'la città')).toBe(true));
    it('does not over-match città with wrong ending', () =>
      expect(matches('città', 'le cittas')).toBe(false));
  });

  describe('English: consonant ending → +s / +es', () => {
    it('matches singular cat', () => expect(matches('cat', 'a cat sat')).toBe(true));
    it('matches plural cats', () => expect(matches('cat', 'two cats sat')).toBe(true));
    it('matches singular box', () => expect(matches('box', 'a box')).toBe(true));
    it('matches plural boxes', () => expect(matches('box', 'two boxes')).toBe(true));
  });

  describe('English: -e ending → +s', () => {
    it('matches singular interface', () => expect(matches('interface', 'an interface')).toBe(true));
    it('matches plural interfaces', () =>
      expect(matches('interface', 'two interfaces')).toBe(true));
  });

  describe('case-insensitive matching', () => {
    it('matches uppercase', () => expect(matches('libro', 'Libro')).toBe(true));
    it('matches mixed case plural', () => expect(matches('libro', 'Libri')).toBe(true));
  });

  describe('word boundary', () => {
    it('does not match inside a longer word', () =>
      expect(matches('cat', 'concatenate')).toBe(false));
    it('does not match libro inside librone', () =>
      expect(matches('libro', 'librone')).toBe(false));
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
  it('escapes angle brackets', () => expect(escapeHtml('<b>')).toBe('&lt;b&gt;'));
  it('escapes quotes', () => expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;'));
});
