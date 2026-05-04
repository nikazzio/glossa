import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
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

  it('returns null when the user cancels the dialog', async () => {
    openMock.mockResolvedValueOnce(null);

    const result = await importTextFile();

    expect(result).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it('reads .txt files via the fs plugin', async () => {
    openMock.mockResolvedValueOnce('/tmp/source.txt');
    readTextFileMock.mockResolvedValueOnce('plain text');

    const result = await importTextFile();

    expect(readTextFileMock).toHaveBeenCalledWith('/tmp/source.txt');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: '/tmp/source.txt',
      name: 'source.txt',
      text: 'plain text',
      format: 'plain',
    });
  });

  it('routes .docx files through extract_docx_text', async () => {
    openMock.mockResolvedValueOnce('/tmp/Doc.DOCX');
    invokeMock.mockResolvedValueOnce('docx content');

    const result = await importTextFile();

    expect(invokeMock).toHaveBeenCalledWith('extract_docx_markdown', { path: '/tmp/Doc.DOCX' });
    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: '/tmp/Doc.DOCX',
      name: 'Doc.DOCX',
      text: 'docx content',
      format: 'markdown',
      experimental: 'docx-markdown',
    });
  });

  it('routes .pdf files through extract_pdf_text', async () => {
    openMock.mockResolvedValueOnce('/tmp/book.pdf');
    invokeMock.mockResolvedValueOnce('pdf content');

    const result = await importTextFile();

    expect(invokeMock).toHaveBeenCalledWith('extract_pdf_text', { path: '/tmp/book.pdf' });
    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(result?.text).toBe('pdf content');
  });

  it('handles Windows-style paths when extracting the basename', async () => {
    openMock.mockResolvedValueOnce('C\\\\Users\\\\me\\\\report.docx');
    invokeMock.mockResolvedValueOnce('win docx');

    const result = await importTextFile();

    expect(invokeMock).toHaveBeenCalledWith('extract_docx_markdown', { path: 'C\\\\Users\\\\me\\\\report.docx' });
    expect(result?.name).toBe('report.docx');
    expect(result?.format).toBe('markdown');
    expect(result?.experimental).toBe('docx-markdown');
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
    {
      id: 'chunk-1',
      originalText: '# Title',
      currentDraft: '# Titolo',
      status: 'completed' as const,
      stageResults: {},
      judgeResult: { content: '# Titolo', status: 'completed' as const, rating: 'good' as const, issues: [] },
    },
    {
      id: 'chunk-2',
      originalText: 'Text with note[^1].\n\n[^1]: Footnote body',
      currentDraft: 'Testo con nota[^1].\n\n[^1]: Corpo nota',
      status: 'completed' as const,
      stageResults: {},
      judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] },
    },
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
      { id: 'a', originalText: 'Source A', currentDraft: 'Traduzione A', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
      { id: 'b', originalText: 'Source B', currentDraft: 'Traduzione B', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
    ];

    await exportTranslation(simple, 'txt');

    const written = writeTextFileMock.mock.calls[0]?.[1] as string;
    expect(written).toBe('Traduzione A\n\nTraduzione B');
  });

  it('plain-text export respects hr separator', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');
    const simple = [
      { id: 'a', originalText: 'A', currentDraft: 'Trad A', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
      { id: 'b', originalText: 'B', currentDraft: 'Trad B', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
    ];

    await exportTranslation(simple, 'txt', { separator: '\n\n---\n\n' });

    const written = writeTextFileMock.mock.calls[0]?.[1] as string;
    expect(written).toBe('Trad A\n\n---\n\nTrad B');
  });

  it('markdown-aware TXT export uses asterisk separator literally without corrupting it', async () => {
    saveMock.mockResolvedValueOnce('/tmp/translation.txt');
    const simple = [
      { id: 'a', originalText: 'Hello', currentDraft: 'Ciao', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
      { id: 'b', originalText: 'World', currentDraft: 'Mondo', status: 'completed' as const, stageResults: {}, judgeResult: { content: '', status: 'idle' as const, rating: 'fair' as const, issues: [] } },
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
    expect(writeTextFileMock.mock.calls[0]?.[1]).toContain('href="#fn-1"');
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
