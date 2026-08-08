import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { makeTranslationChunk } from '../test/chunkFactory';
import { exportTranslation, importTextFile } from './fileService';

const invokeMock = vi.mocked(invoke);
const openMock = vi.mocked(open);
const saveMock = vi.mocked(save);
const readTextFileMock = vi.mocked(readTextFile);
const writeTextFileMock = vi.mocked(writeTextFile);
const writeFileMock = vi.mocked(writeFile);

describe('importTextFile', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    writeFileMock.mockReset();
  });

  it('returns null when the user cancels the native picker', async () => {
    invokeMock.mockResolvedValueOnce(null);

    const result = await importTextFile();

    expect(result).toBeNull();
  });

  it('opens the picker in the backend, never in the webview', async () => {
    invokeMock.mockResolvedValueOnce({
      name: 'source.txt',
      text: 'plain text',
      format: 'plain',
      experimental: null,
    });

    await importTextFile();

    expect(invokeMock).toHaveBeenCalledWith('import_document');
    expect(openMock).not.toHaveBeenCalled();
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it('returns plain text without an experimental marker', async () => {
    invokeMock.mockResolvedValueOnce({
      name: 'source.txt',
      text: 'plain text',
      format: 'plain',
      experimental: null,
    });

    const result = await importTextFile();

    expect(result).toEqual({
      name: 'source.txt',
      text: 'plain text',
      format: 'plain',
    });
  });

  it('flags the docx conversion as experimental', async () => {
    invokeMock.mockResolvedValueOnce({
      name: 'Doc.DOCX',
      text: 'docx content',
      format: 'markdown',
      experimental: 'docx-markdown',
    });

    const result = await importTextFile();

    expect(result).toEqual({
      name: 'Doc.DOCX',
      text: 'docx content',
      format: 'markdown',
      experimental: 'docx-markdown',
    });
  });

  it('surfaces backend error markers as an Error message', async () => {
    invokeMock.mockRejectedValueOnce('pdf_no_text_layer');

    await expect(importTextFile()).rejects.toThrow('pdf_no_text_layer');
  });

  it('surfaces the non-utf8 marker so the UI can explain the encoding problem', async () => {
    invokeMock.mockRejectedValueOnce('text_not_utf8');

    await expect(importTextFile()).rejects.toThrow('text_not_utf8');
  });
});

describe('exportTranslation', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    saveMock.mockReset();
    writeTextFileMock.mockReset();
    writeFileMock.mockReset();
  });

  const markdownChunks = [
    makeTranslationChunk({
      id: 'chunk-1',
      sourceDisplayText: '# Title',
      translationDisplayText: '# Titolo',
      status: 'completed' as const,
      stageResults: {},
      judgeResult: { content: '# Titolo', status: 'completed' as const, rating: 'good' as const, issues: [] },
    }),
    makeTranslationChunk({
      id: 'chunk-2',
      sourceDisplayText: 'Text with note[^1].\n\n[^1]: Footnote body',
      translationDisplayText: 'Testo con nota[^1].\n\n[^1]: Corpo nota',
      status: 'completed' as const,
      stageResults: {},
      judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] },
    }),
  ];

  it('exports markdown-aware text as semantic plain text', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');

    await exportTranslation(markdownChunks, 'txt', { markdownAware: true });

    expect(writeTextFileMock).toHaveBeenCalledWith('/tmp/translation.txt', expect.any(String));
    expect(writeTextFileMock.mock.calls[0]?.[1]).toContain('TITOLO');
    expect(writeTextFileMock.mock.calls[0]?.[1]).toContain('Notes');
  });

  it('plain-text export uses blank-line separator by default', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');
    const simple = [
      makeTranslationChunk({ id: 'a', sourceDisplayText: 'Source A', translationDisplayText: 'Traduzione A', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
      makeTranslationChunk({ id: 'b', sourceDisplayText: 'Source B', translationDisplayText: 'Traduzione B', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
    ];

    await exportTranslation(simple, 'txt');

    const written = writeTextFileMock.mock.calls[0]?.[1] as string;
    expect(written).toBe('Traduzione A\n\nTraduzione B');
  });

  it('plain-text export respects hr separator', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');
    const simple = [
      makeTranslationChunk({ id: 'a', sourceDisplayText: 'A', translationDisplayText: 'Trad A', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
      makeTranslationChunk({ id: 'b', sourceDisplayText: 'B', translationDisplayText: 'Trad B', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
    ];

    await exportTranslation(simple, 'txt', { separator: '\n\n---\n\n' });

    const written = writeTextFileMock.mock.calls[0]?.[1] as string;
    expect(written).toBe('Trad A\n\n---\n\nTrad B');
  });

  it('markdown-aware TXT export uses asterisk separator literally without corrupting it', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');
    const simple = [
      makeTranslationChunk({ id: 'a', sourceDisplayText: 'Hello', translationDisplayText: 'Ciao', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
      makeTranslationChunk({ id: 'b', sourceDisplayText: 'World', translationDisplayText: 'Mondo', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } }),
    ];

    await exportTranslation(simple, 'txt', { markdownAware: true, separator: '\n\n* * *\n\n' });

    const written = writeTextFileMock.mock.calls[0]?.[1] as string;
    expect(written).toContain('* * *');
    expect(written).toBe('Ciao\n\n* * *\n\nMondo');
  });

  it('exports standalone html for markdown-aware documents', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.html');

    await exportTranslation(markdownChunks, 'html', { markdownAware: true });

    expect(writeTextFileMock).toHaveBeenCalledWith(
      '/tmp/translation.html',
      expect.stringContaining('<!doctype html>'),
    );
    expect(writeTextFileMock.mock.calls[0]?.[1]).toContain('href="#user-content-fn-1"');
  });

  it('exports docx bytes through the native markdown exporter', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.docx');
    invokeMock.mockResolvedValueOnce([80, 75, 3, 4]);

    await exportTranslation(markdownChunks, 'docx', { markdownAware: true });

    expect(invokeMock).toHaveBeenCalledWith('export_markdown_docx', {
      markdown: '# Titolo\n\nTesto con nota[^1].\n\n[^1]: Corpo nota',
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/translation.docx',
      expect.any(Uint8Array),
    );
  });
});
