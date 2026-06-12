import { describe, expect, it } from 'vitest';
import {
  assignChunkFootnotes,
  extractFootnotes,
  highlightFootnoteMarkersHtml,
  highlightSuperscriptMarkersHtml,
  replaceMarkersWithSuperscripts,
  restoreFootnoteMarkers,
  stripFootnoteMarkers,
  stripSuperscriptMarkers,
} from './footnoteExtractor';

describe('restoreFootnoteMarkers', () => {
  it('rewrites bracketed superscripts back to GFM references by display order', () => {
    const map = new Map([
      ['fa', 'first'],
      ['fb', 'second'],
    ]);
    const result = restoreFootnoteMarkers('Alpha[¹] beta[²].', map);
    expect(result).toBe('Alpha[^fa] beta[^fb].');
  });

  it('leaves existing GFM markers and unknown numbers untouched', () => {
    const map = new Map([['fa', 'first']]);
    expect(restoreFootnoteMarkers('Keep[^fa] and [²] alone.', map)).toBe('Keep[^fa] and [²] alone.');
  });

  it('returns text unchanged when there are no superscript markers', () => {
    const map = new Map([['fa', 'first']]);
    expect(restoreFootnoteMarkers('Plain text.', map)).toBe('Plain text.');
  });
});

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

describe('highlightFootnoteMarkersHtml', () => {
  it('wraps [^id] markers in a span', () => {
    const result = highlightFootnoteMarkersHtml('Text [^1] end.');
    expect(result).toContain('<span class="hl-footnote-marker">[^1]</span>');
    expect(result).toContain('Text ');
    expect(result).toContain(' end.');
  });

  it('does not inject spans into HTML tag attributes', () => {
    const html = '<mark title="note [^1]">word</mark>';
    const result = highlightFootnoteMarkersHtml(html);
    expect(result).toBe('<mark title="note [^1]">word</mark>');
  });

  it('wraps markers in text nodes adjacent to HTML tags', () => {
    const html = '<mark>text</mark> [^1]';
    const result = highlightFootnoteMarkersHtml(html);
    expect(result).toContain('<mark>text</mark>');
    expect(result).toContain('<span class="hl-footnote-marker">[^1]</span>');
  });

  it('does not wrap escaped markers preceded by backslash', () => {
    const result = highlightFootnoteMarkersHtml('Literal \\[^1] stays.');
    expect(result).not.toContain('<span');
    expect(result).toContain('\\[^1]');
  });

  it('handles annotation-style markers like [^a1]', () => {
    const result = highlightFootnoteMarkersHtml('See [^a1] here.');
    expect(result).toContain('<span class="hl-footnote-marker">[^a1]</span>');
  });
});

describe('highlightSuperscriptMarkersHtml', () => {
  it('wraps bracketed superscripts in a span', () => {
    const result = highlightSuperscriptMarkersHtml('Text [¹] end.');
    expect(result).toContain('<span class="hl-footnote-marker">[¹]</span>');
    expect(result).toContain('Text ');
    expect(result).toContain(' end.');
  });

  it('does not inject spans into HTML tag attributes', () => {
    const html = '<mark title="→ [¹]">word</mark>';
    const result = highlightSuperscriptMarkersHtml(html);
    expect(result).toBe('<mark title="→ [¹]">word</mark>');
  });

  it('wraps superscripts in text nodes adjacent to HTML tags', () => {
    const html = '<mark title="term">text</mark> [¹]';
    const result = highlightSuperscriptMarkersHtml(html);
    expect(result).toContain('<mark title="term">text</mark>');
    expect(result).toContain('<span class="hl-footnote-marker">[¹]</span>');
  });
});
