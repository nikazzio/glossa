import { describe, expect, it } from 'vitest';
import {
  applyMarkdownCommand,
  getActiveMarkdownCommands,
  type MarkdownCommand,
} from './markdownEditorUtils';

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

  it('unwraps an already bold selection', () => {
    const result = apply('bold', 'Alpha **beta** gamma', 8, 12);

    expect(result.value).toBe('Alpha beta gamma');
    expect(result.selectionStart).toBe(6);
    expect(result.selectionEnd).toBe(10);
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

  it('toggles a heading off when the line is already headed', () => {
    const result = apply('heading-2', '## Title', 0, 8);

    expect(result.value).toBe('Title');
  });

  it('toggles a bulleted list on selected lines', () => {
    const result = apply('unordered-list', 'One\nTwo', 0, 7);

    expect(result.value).toBe('- One\n- Two');
  });

  it('toggles a bulleted list off when already prefixed', () => {
    const result = apply('unordered-list', '- One\n- Two', 0, 11);

    expect(result.value).toBe('One\nTwo');
  });

  it('adds footnote reference and definition scaffolding', () => {
    const result = apply('footnote', 'Text', 4);

    expect(result.value).toBe('Text[^1]\n\n[^1]: ');
    expect(result.selectionStart).toBe(result.value.length);
    expect(result.selectionEnd).toBe(result.value.length);
  });

  it('detects active inline commands at the cursor', () => {
    const state = getActiveMarkdownCommands('Alpha **beta** and *gamma*', 10, 10);

    expect(state.bold).toBe(true);
    expect(state.italic).toBe(false);
  });

  it('detects active line commands from the current line', () => {
    const state = getActiveMarkdownCommands('## Heading\n1. item', 14, 14);

    expect(state['heading-2']).toBe(false);
    expect(state['ordered-list']).toBe(true);
  });

  it('detects active link and heading for a selected range', () => {
    const value = '# [Glossa](https://example.com)';
    const start = value.indexOf('Glossa');
    const end = start + 'Glossa'.length;
    const state = getActiveMarkdownCommands(value, start, end);

    expect(state['heading-1']).toBe(true);
    expect(state.link).toBe(true);
  });
});
