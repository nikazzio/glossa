import { describe, expect, it } from 'vitest';
import {
  assignChunkFootnotes,
  extractFootnotes,
  replaceMarkersWithSuperscripts,
  stripFootnoteMarkers,
  stripSuperscriptMarkers,
} from './footnoteExtractor';

describe('extractFootnotes', () => {
  it('separates body text from footnote definitions', () => {
    const input = 'Body text [^1].\n\n[^1]: First note';
    const { cleanText, footnoteMap } = extractFootnotes(input);
    expect(cleanText).toBe('Body text [^1].');
    expect(footnoteMap.get('1')).toBe('First note');
  });

  it('returns the original text unchanged when no definitions are present', () => {
    const input = 'No footnotes here.';
    const { cleanText, footnoteMap } = extractFootnotes(input);
    expect(cleanText).toBe(input);
    expect(footnoteMap.size).toBe(0);
  });

  it('handles multi-line footnote definitions', () => {
    const input = 'Text.\n\n[^1]: Line one\n  continuation';
    const { footnoteMap } = extractFootnotes(input);
    expect(footnoteMap.get('1')).toBe('Line one\n  continuation');
  });
});

describe('stripFootnoteMarkers', () => {
  it('removes inline [^id] markers', () => {
    expect(stripFootnoteMarkers('Text [^1] here [^2].')).toBe('Text  here .');
  });

  it('does not remove escaped markers preceded by backslash', () => {
    expect(stripFootnoteMarkers('Text \\[^1] here.')).toBe('Text \\[^1] here.');
  });

  it('removes only unescaped markers when both are present', () => {
    expect(stripFootnoteMarkers('Real [^1] and literal \\[^2].')).toBe('Real  and literal \\[^2].');
  });
});

describe('replaceMarkersWithSuperscripts', () => {
  const map = new Map([['1', 'First note'], ['2', 'Second note']]);

  it('replaces numeric markers with bracketed superscripts', () => {
    expect(replaceMarkersWithSuperscripts('Text [^1] and [^2].', map)).toBe('Text [¹] and [²].');
  });

  it('does not replace escaped markers', () => {
    expect(replaceMarkersWithSuperscripts('Literal \\[^1] stays.', map)).toBe('Literal \\[^1] stays.');
  });

  it('strips unknown markers not present in footnoteMap', () => {
    expect(replaceMarkersWithSuperscripts('Unknown [^99].', map)).toBe('Unknown .');
  });
});

describe('assignChunkFootnotes', () => {
  const map = new Map([['1', 'First note'], ['2', 'Second note']]);

  it('collects footnotes referenced in the chunk', () => {
    const footnotes = assignChunkFootnotes('See [^1] and [^2].', map);
    expect(footnotes).toHaveLength(2);
    expect(footnotes[0].id).toBe('1');
    expect(footnotes[1].id).toBe('2');
  });

  it('does not collect escaped markers as footnote references', () => {
    const footnotes = assignChunkFootnotes('Literal \\[^1] not a ref.', map);
    expect(footnotes).toHaveLength(0);
  });

  it('deduplicates repeated markers', () => {
    const footnotes = assignChunkFootnotes('[^1] again [^1].', map);
    expect(footnotes).toHaveLength(1);
  });
});

describe('stripSuperscriptMarkers', () => {
  it('strips bracketed superscript markers added by replaceMarkersWithSuperscripts', () => {
    expect(stripSuperscriptMarkers('Text [¹] and [²].')).toBe('Text  and .');
  });

  it('leaves normal text intact', () => {
    expect(stripSuperscriptMarkers('No markers here.')).toBe('No markers here.');
  });
});
