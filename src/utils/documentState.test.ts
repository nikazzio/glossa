import { describe, expect, it } from 'vitest';
import {
  buildChunkFootnotes,
  composeDocumentDisplayText,
  composeDocumentProcessingText,
  deriveSourceDocumentState,
  normalizeRenderProfile,
  updateChunkSourceFields,
  updateChunkTranslationFields,
} from './documentState';
import { makeTranslationChunk } from '../test/chunkFactory';

describe('normalizeRenderProfile', () => {
  it('returns the explicit renderProfile when provided', () => {
    expect(normalizeRenderProfile({ renderProfile: 'markdown' })).toBe('markdown');
    expect(normalizeRenderProfile({ renderProfile: 'plain-text' })).toBe('plain-text');
  });

  it('returns markdown when markdownAware is true', () => {
    expect(normalizeRenderProfile({ markdownAware: true })).toBe('markdown');
  });

  it('returns markdown when documentFormat is markdown', () => {
    expect(normalizeRenderProfile({ documentFormat: 'markdown' })).toBe('markdown');
  });

  it('defaults to plain-text when no options are given', () => {
    expect(normalizeRenderProfile({})).toBe('plain-text');
  });

  it('explicit renderProfile takes precedence over markdownAware', () => {
    expect(normalizeRenderProfile({ renderProfile: 'plain-text', markdownAware: true })).toBe('plain-text');
  });
});

describe('deriveSourceDocumentState', () => {
  it('trims plain text and returns identical display and processing texts', () => {
    const result = deriveSourceDocumentState('  Hello world.  ');
    expect(result.displayText).toBe('Hello world.');
    expect(result.processingText).toBe('Hello world.');
    expect(result.footnotes).toEqual([]);
    expect(result.renderProfile).toBe('plain-text');
  });

  it('display and processing are equal for multi-paragraph plain text', () => {
    const result = deriveSourceDocumentState('Line one.\n\nLine two.', { markdownAware: false });
    expect(result.displayText).toBe(result.processingText);
  });

  it('for markdown: displayText keeps footnote definitions, processingText strips them', () => {
    const text = 'Body text [^1].\n\n[^1]: First note';
    const result = deriveSourceDocumentState(text, { markdownAware: true });
    expect(result.displayText).toBe(text.trim());
    expect(result.processingText).toBe('Body text [^1].');
    expect(result.footnotes).toEqual([{ id: '1', text: 'First note' }]);
    expect(result.renderProfile).toBe('markdown');
  });

  it('for markdown with multiple footnotes: extracts all definitions', () => {
    const text = 'Text [^a] and [^b].\n\n[^a]: Note A\n\n[^b]: Note B';
    const result = deriveSourceDocumentState(text, { markdownAware: true });
    expect(result.processingText).toBe('Text [^a] and [^b].');
    expect(result.footnotes).toHaveLength(2);
    expect(result.footnotes.map((f) => f.id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('for markdown with no footnotes: display and processing are equal', () => {
    const text = '# Heading\n\nParagraph without notes.';
    const result = deriveSourceDocumentState(text, { markdownAware: true });
    expect(result.displayText).toBe(result.processingText);
    expect(result.footnotes).toEqual([]);
  });

  it('returns empty strings for whitespace-only input', () => {
    const result = deriveSourceDocumentState('   ');
    expect(result.displayText).toBe('');
    expect(result.processingText).toBe('');
    expect(result.footnotes).toEqual([]);
  });

  it('respects explicit renderProfile over markdownAware', () => {
    const text = 'Text [^1].\n\n[^1]: Note';
    const result = deriveSourceDocumentState(text, { renderProfile: 'plain-text', markdownAware: true });
    expect(result.renderProfile).toBe('plain-text');
    expect(result.displayText).toBe(result.processingText);
    expect(result.footnotes).toEqual([]);
  });
});

describe('buildChunkFootnotes', () => {
  const footnotes = [
    { id: '1', text: 'First note' },
    { id: '2', text: 'Second note' },
  ];

  it('assigns the footnote referenced in the chunk processing text', () => {
    const result = buildChunkFootnotes('Text with [^1] marker.', footnotes);
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe('1');
    expect(result?.[0].text).toBe('First note');
  });

  it('assigns multiple footnotes when multiple markers are present', () => {
    const result = buildChunkFootnotes('See [^1] and [^2].', footnotes);
    expect(result).toHaveLength(2);
    expect(result?.map((f) => f.id)).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('returns undefined when the footnotes array is empty', () => {
    expect(buildChunkFootnotes('Text [^1].', [])).toBeUndefined();
  });

  it('returns undefined when no markers match the known footnotes', () => {
    expect(buildChunkFootnotes('No relevant markers here.', footnotes)).toBeUndefined();
  });

  it('does not duplicate footnotes for repeated markers', () => {
    const result = buildChunkFootnotes('[^1] appears twice [^1].', footnotes);
    expect(result).toHaveLength(1);
  });
});

describe('composeDocumentProcessingText', () => {
  it('joins chunk sourceProcessingText with a double newline', () => {
    const chunks = [
      makeTranslationChunk({ id: 'a', sourceProcessingText: 'First' }),
      makeTranslationChunk({ id: 'b', sourceProcessingText: 'Second' }),
    ];
    expect(composeDocumentProcessingText(chunks)).toBe('First\n\nSecond');
  });

  it('trims individual chunk texts before joining', () => {
    const chunks = [
      makeTranslationChunk({ id: 'a', sourceProcessingText: '  First  ' }),
      makeTranslationChunk({ id: 'b', sourceProcessingText: 'Second' }),
    ];
    expect(composeDocumentProcessingText(chunks)).toBe('First\n\nSecond');
  });

  it('skips empty chunks', () => {
    const chunks = [
      makeTranslationChunk({ id: 'a', sourceProcessingText: 'First' }),
      makeTranslationChunk({ id: 'b', sourceProcessingText: '' }),
      makeTranslationChunk({ id: 'c', sourceProcessingText: 'Third' }),
    ];
    expect(composeDocumentProcessingText(chunks)).toBe('First\n\nThird');
  });

  it('returns an empty string for an empty chunk array', () => {
    expect(composeDocumentProcessingText([])).toBe('');
  });
});

describe('composeDocumentDisplayText', () => {
  it('returns processing text as-is for plain-text profile', () => {
    expect(composeDocumentDisplayText('Body text', 'plain-text', [])).toBe('Body text');
  });

  it('returns processing text unchanged for markdown with no footnotes', () => {
    expect(composeDocumentDisplayText('# Heading\n\nBody', 'markdown', [])).toBe('# Heading\n\nBody');
  });

  it('appends footnote definitions for markdown with footnotes', () => {
    const result = composeDocumentDisplayText(
      'Body [^1].',
      'markdown',
      [{ id: '1', text: 'A note' }],
    );
    expect(result).toBe('Body [^1].\n\n[^1]: A note');
  });

  it('appends all footnote definitions when multiple are present', () => {
    const result = composeDocumentDisplayText(
      'Text [^1] and [^2].',
      'markdown',
      [{ id: '1', text: 'First' }, { id: '2', text: 'Second' }],
    );
    expect(result).toContain('[^1]: First');
    expect(result).toContain('[^2]: Second');
  });

  it('ignores footnotes for plain-text profile even if provided', () => {
    const result = composeDocumentDisplayText(
      'Body',
      'plain-text',
      [{ id: '1', text: 'A note' }],
    );
    expect(result).toBe('Body');
    expect(result).not.toContain('[^1]');
  });
});

describe('updateChunkSourceFields', () => {
  it('updates sourceDisplayText and sourceProcessingText independently', () => {
    const chunk = makeTranslationChunk({ id: 'c', sourceDisplayText: 'Old source' });
    const updated = updateChunkSourceFields(chunk, 'New Display', 'New Processing');
    expect(updated.sourceDisplayText).toBe('New Display');
    expect(updated.sourceProcessingText).toBe('New Processing');
  });

  it('attaches footnotes when provided', () => {
    const chunk = makeTranslationChunk({ id: 'c', sourceDisplayText: 'Text [^1].' });
    const footnote = { id: '1', marker: '[¹]', text: 'A note' };
    const updated = updateChunkSourceFields(chunk, 'Text [^1].', 'Text [^1].', [footnote]);
    expect(updated.footnotes).toEqual([footnote]);
  });

  it('clears footnotes when none are provided', () => {
    const footnote = { id: '1', marker: '[¹]', text: 'Note' };
    const chunk = makeTranslationChunk({ id: 'c', sourceDisplayText: 'Text', footnotes: [footnote] });
    const updated = updateChunkSourceFields(chunk, 'New', 'New');
    expect(updated.footnotes).toBeUndefined();
  });
});

describe('updateChunkTranslationFields', () => {
  it('sets both translationDisplayText and translationProcessingText', () => {
    const chunk = makeTranslationChunk({ id: 'c', sourceDisplayText: 'Source' });
    const updated = updateChunkTranslationFields(chunk, 'Display translation', 'Processing translation');
    expect(updated.translationDisplayText).toBe('Display translation');
    expect(updated.translationProcessingText).toBe('Processing translation');
  });

  it('defaults translationProcessingText to translationDisplayText when omitted', () => {
    const chunk = makeTranslationChunk({ id: 'c', sourceDisplayText: 'Source' });
    const updated = updateChunkTranslationFields(chunk, 'Display only');
    expect(updated.translationProcessingText).toBe('Display only');
  });
});
