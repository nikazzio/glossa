import { describe, expect, it } from 'vitest';
import {
  buildMarkdownHtmlDocument,
  flattenMarkdownToText,
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

  it('keeps footnote navigation anchors by default', () => {
    const html = renderMarkdownToHtmlFragment(sample);
    expect(html).toContain('href="#user-content-fn-1"');
    expect(html).toContain('data-footnote-backref');
  });

  it('strips footnote navigation anchors when requested (in-app preview)', () => {
    const html = renderMarkdownToHtmlFragment(sample, { stripFootnoteNav: true });

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('href="https://example.com"');
    // GFM footnote inline reference is kept (styled) but made inert: no href
    // jump-link and no `↩` backref, so clicking never scroll-shifts the pane.
    expect(html).toContain('data-footnote-ref');
    expect(html).toContain('id="user-content-fnref-1"');
    expect(html).not.toContain('href="#user-content-fn-1"');
    expect(html).not.toContain('data-footnote-backref');
    // The footnote section itself is still rendered.
    expect(html).toContain('data-footnotes');
    expect(html).toContain('class="footnotes"');
  });

  it('flattens markdown to readable text with a final notes section', () => {
    const text = flattenMarkdownToText(sample);

    expect(text).toContain('TITLE');
    expect(text).toContain('Intro with bold, italic, a link, and a note[1].');
    expect(text).toContain('• First item');
    expect(text).toContain('Notes');
    expect(text).toContain('[1] Footnote body');
  });

  it('does not break on bracketed superscript markers like [¹]', () => {
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

  describe('table parsing and rendering', () => {
    const tableMd = [
      '| Name | Age |',
      '| --- | --- |',
      '| Alice | 30 |',
      '| Bob | 25 |',
    ].join('\n');

    it('renders a table to HTML with thead and tbody', () => {
      const html = renderMarkdownToHtmlFragment(tableMd);
      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<td>Alice</td>');
    });

    it('handles inline bold inside table cells', () => {
      const md = '| **Header** |\n| --- |\n| cell |';
      const html = renderMarkdownToHtmlFragment(md);
      expect(html).toContain('<strong>Header</strong>');
    });

    it('flattens table to text with pipe separators', () => {
      const text = flattenMarkdownToText(tableMd);
      expect(text).toContain('Name | Age');
      expect(text).toContain('Alice | 30');
    });
  });

  describe('link protocol sanitization', () => {
    it('preserves https links', () => {
      const result = renderMarkdownToHtmlFragment('[click](https://example.com)');
      expect(result).toContain('href="https://example.com"');
    });

    it('preserves http links', () => {
      const result = renderMarkdownToHtmlFragment('[click](http://example.com)');
      expect(result).toContain('href="http://example.com"');
    });

    it('preserves anchor links', () => {
      const result = renderMarkdownToHtmlFragment('[click](#section)');
      expect(result).toContain('href="#section"');
    });

    it('blocks javascript: protocol', () => {
      const result = renderMarkdownToHtmlFragment('[click](javascript:alert(1))');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('click');
    });

    it('blocks data: protocol', () => {
      const result = renderMarkdownToHtmlFragment('[click](data:text/html,<script>alert(1)</script>)');
      expect(result).not.toContain('data:text/html');
      expect(result).not.toContain('<script>');
    });

    it('blocks vbscript: protocol', () => {
      const result = renderMarkdownToHtmlFragment('[click](vbscript:msgbox(1))');
      expect(result).not.toContain('vbscript:');
      expect(result).toContain('click');
    });

    it('preserves mailto links', () => {
      const result = renderMarkdownToHtmlFragment('[contact](mailto:info@example.com)');
      expect(result).toContain('href="mailto:info@example.com"');
    });
  });
});
