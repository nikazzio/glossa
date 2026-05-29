import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, useGlossaryHighlight } from './useGlossaryHighlight';

const GLOSSARY = [{ term: 'libro', translation: 'book', notes: '' }];

describe('useGlossaryHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('highlights inflected source glossary matches after debounce', () => {
    const { result } = renderHook(() =>
      useGlossaryHighlight('Ho due libri sul tavolo.', GLOSSARY, 'source'),
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.html).toContain('class="hl-source-term"');
    expect(result.current.html).toContain('>libri<');
    expect(result.current.totalTerms).toBe(1);
  });

  it('highlights expected translation matches and counts them once per glossary entry', () => {
    const { result } = renderHook(() =>
      useGlossaryHighlight('These books are on the table.', GLOSSARY, 'translation'),
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.html).toContain('class="hl-match"');
    expect(result.current.html).toContain('>books<');
    expect(result.current.matchCount).toBe(1);
    expect(result.current.totalTerms).toBe(1);
  });

  it('trims leading whitespace in glossary terms before matching', () => {
    const { result } = renderHook(() =>
      useGlossaryHighlight('API clients need stable contracts.', [{ term: ' API', translation: 'interfaccia', notes: '' }], 'source'),
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.html).toContain('class="hl-source-term"');
    expect(result.current.html).toContain('>API<');
  });

  it('merges underline and background when search overlaps a source glossary term', () => {
    const { result } = renderHook(() =>
      useGlossaryHighlight('Il libro è qui.', GLOSSARY, 'source', 'libro'),
    );

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.html).toContain('hl-source-term');
    expect(result.current.html).toContain('hl-search');
    // Both classes must be on the same <mark>, not separate elements
    expect(result.current.html).toMatch(
      /class="[^"]*hl-search[^"]*hl-source-term[^"]*"|class="[^"]*hl-source-term[^"]*hl-search[^"]*"/,
    );
  });

  it('resolves two background classes by priority — hl-match beats hl-search', () => {
    const { result } = renderHook(() =>
      useGlossaryHighlight('These books are here.', GLOSSARY, 'translation', 'books'),
    );

    act(() => { vi.advanceTimersByTime(300); });

    // hl-match (priority 0) wins over hl-search (priority 2) on "books"
    expect(result.current.html).toContain('hl-match');
    expect(result.current.html).not.toMatch(/>books<\/mark>.*class="hl-search"/);
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
  it('escapes angle brackets', () => expect(escapeHtml('<b>')).toBe('&lt;b&gt;'));
  it('escapes quotes', () => expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;'));
});
