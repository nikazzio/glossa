import { describe, expect, it } from 'vitest';
import { applyMarkdownCommand, type MarkdownCommand } from './markdownEditorUtils';

function apply(
  command: MarkdownCommand,
  value: string,
  start: number,
  end = start,
) {
  return applyMarkdownCommand({ command, value, selectionStart: start, selectionEnd: end });
}

describe('markdownEditorUtils', () => {
  it('wraps a selection in bold markers', () => {
    const result = apply('bold', 'Alpha beta gamma', 6, 10);

    expect(result.value).toBe('Alpha **beta** gamma');
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(12);
  });

  it('inserts a link template when no text is selected', () => {
    const result = apply('link', 'Alpha', 5);

    expect(result.value).toBe('Alpha[link text](https://example.com)');
    expect(result.selectionStart).toBe(6);
    expect(result.selectionEnd).toBe(15);
  });

  it('turns a line into a heading', () => {
    const result = apply('heading-2', 'Title', 0, 5);

    expect(result.value).toBe('## Title');
  });

  it('adds footnote reference and definition scaffolding', () => {
    const result = apply('footnote', 'Text', 4);

    expect(result.value).toBe('Text[^1]\n\n[^1]: ');
    expect(result.selectionStart).toBe(result.value.length);
    expect(result.selectionEnd).toBe(result.value.length);
  });
});
