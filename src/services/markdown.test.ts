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

  describe('table parsing and rendering', () => {
    const tableMd = [
      '| Name | Age |',
      '| --- | --- |',
      '| Alice | 30 |',
      '| Bob | 25 |',
    ].join('\n');

    it('parses a markdown table into AST', () => {
      const parsed = parseMarkdownDocument(tableMd);
      expect(parsed.blocks).toHaveLength(1);
      const block = parsed.blocks[0];
      expect(block.type).toBe('table');
      if (block.type === 'table') {
        expect(block.headers).toHaveLength(2);
        expect(block.rows).toHaveLength(2);
      }
    });

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
      expect(result).toContain('href="#"');
      expect(result).not.toContain('javascript:');
    });

    it('blocks data: protocol', () => {
      const result = renderMarkdownToHtmlFragment('[click](data:text/html,<script>alert(1)</script>)');
      expect(result).toContain('href="#"');
      expect(result).not.toContain('data:');
    });

    it('blocks vbscript: protocol', () => {
      const result = renderMarkdownToHtmlFragment('[click](vbscript:msgbox(1))');
      expect(result).toContain('href="#"');
      expect(result).not.toContain('vbscript:');
    });

    it('preserves mailto links', () => {
      const result = renderMarkdownToHtmlFragment('[contact](mailto:info@example.com)');
      expect(result).toContain('href="mailto:info@example.com"');
    });
  });
});
