import { describe, it, expect } from 'vitest';
import { normalizeImportedText } from './textNormalization';

describe('normalizeImportedText', () => {
  describe('line endings', () => {
    it('converts CRLF to LF', () => {
      expect(normalizeImportedText('line one\r\nline two', 'plain')).toBe('line one\nline two');
    });

    it('converts bare CR to LF', () => {
      expect(normalizeImportedText('line one\rline two', 'plain')).toBe('line one\nline two');
    });

    it('leaves LF unchanged', () => {
      expect(normalizeImportedText('line one\nline two', 'plain')).toBe('line one\nline two');
    });
  });

  describe('trailing whitespace', () => {
    it('strips trailing spaces from each line', () => {
      expect(normalizeImportedText('hello   \nworld  ', 'plain')).toBe('hello\nworld');
    });

    it('strips trailing tabs from each line', () => {
      expect(normalizeImportedText('hello\t\nworld\t', 'plain')).toBe('hello\nworld');
    });
  });

  describe('blank line collapsing', () => {
    it('collapses three consecutive blank lines into two', () => {
      expect(normalizeImportedText('a\n\n\nb', 'plain')).toBe('a\n\nb');
    });

    it('collapses many consecutive blank lines into two', () => {
      expect(normalizeImportedText('a\n\n\n\n\n\nb', 'plain')).toBe('a\n\nb');
    });

    it('leaves a single blank line unchanged', () => {
      expect(normalizeImportedText('a\n\nb', 'plain')).toBe('a\n\nb');
    });
  });

  describe('document-level trim', () => {
    it('strips leading whitespace and blank lines', () => {
      expect(normalizeImportedText('\n\nHello', 'plain')).toBe('Hello');
    });

    it('strips trailing whitespace and blank lines', () => {
      expect(normalizeImportedText('Hello\n\n', 'plain')).toBe('Hello');
    });
  });

  describe('empty and trivial input', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeImportedText('', 'plain')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalizeImportedText('   \n\n  \n', 'plain')).toBe('');
    });
  });

  describe('markdown format', () => {
    it('preserves heading syntax', () => {
      const input = '# Title\n\nParagraph.';
      expect(normalizeImportedText(input, 'markdown')).toBe('# Title\n\nParagraph.');
    });

    it('preserves list items', () => {
      const input = '- item one\n- item two';
      expect(normalizeImportedText(input, 'markdown')).toBe('- item one\n- item two');
    });

    it('collapses excess blank lines between sections', () => {
      const input = '# Title\n\n\n\nParagraph.';
      expect(normalizeImportedText(input, 'markdown')).toBe('# Title\n\nParagraph.');
    });
  });

  describe('real-world patterns', () => {
    it('normalizes a PDF-style text with CRLF and trailing spaces', () => {
      const input = 'First paragraph.  \r\n\r\nSecond paragraph.  \r\n\r\n\r\nThird paragraph.';
      const expected = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      expect(normalizeImportedText(input, 'plain')).toBe(expected);
    });

    it('normalizes a DOCX markdown with redundant blank lines', () => {
      const input = '# Chapter\n\n\n\nFirst paragraph.\n\n\nSecond paragraph.';
      const expected = '# Chapter\n\nFirst paragraph.\n\nSecond paragraph.';
      expect(normalizeImportedText(input, 'markdown')).toBe(expected);
    });
  });
});
