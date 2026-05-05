import { describe, expect, it } from 'vitest';
import {
  buildMarkdownHtmlDocument,
  flattenMarkdownToText,
  parseMarkdownDocument,
  renderMarkdownToHtmlFragment,
} from './markdown';

describe('markdown service', () => {
  const sample = [
    '# Title',
    '',
    'Intro with **bold**, *italic*, a [link](https://example.com), and a note[^1].',
    '',
    '- First item',
    '- Second item',
    '',
    '[^1]: Footnote body',
  ].join('\n');

  it('parses headings, lists, and footnotes from editorial markdown', () => {
    const parsed = parseMarkdownDocument(sample);

    expect(parsed.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
    ]);
    expect(parsed.footnotes).toEqual([{ id: '1', text: 'Footnote body' }]);
  });

  it('renders html footnotes as linked superscripts with backlinks', () => {
    const html = renderMarkdownToHtmlFragment(sample);

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('id="fnref-1"');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('href="#fnref-1"');
    expect(html).toContain('<section class="footnotes"');
  });

  it('flattens markdown to readable text with a final notes section', () => {
    const text = flattenMarkdownToText(sample);

    expect(text).toContain('TITLE');
    expect(text).toContain('Intro with bold, italic, a link, and a note[1].');
    expect(text).toContain('• First item');
    expect(text).toContain('Notes');
    expect(text).toContain('[1] Footnote body');
  });

  it('does not infinite-loop on bracketed superscript markers like [¹]', () => {
    const text = 'Text with note [¹] and another [²] marker.';
    const html = renderMarkdownToHtmlFragment(text);
    expect(html).toContain('[¹]');
    expect(html).toContain('[²]');
  });

  it('wraps the html fragment in a standalone export document', () => {
    const html = buildMarkdownHtmlDocument(sample, 'Sample Export');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Sample Export</title>');
    expect(html).toContain('<main class="glossa-export">');
  });
});
