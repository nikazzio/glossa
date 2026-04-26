import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { importTextFile } from './fileService';

const invokeMock = vi.mocked(invoke);
const openMock = vi.mocked(open);
const readTextFileMock = vi.mocked(readTextFile);

describe('importTextFile', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    readTextFileMock.mockReset();
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
    expect(result).toEqual({ path: '/tmp/source.txt', name: 'source.txt', text: 'plain text' });
  });

  it('routes .docx files through extract_docx_text', async () => {
    openMock.mockResolvedValueOnce('/tmp/Doc.DOCX');
    invokeMock.mockResolvedValueOnce('docx content');

    const result = await importTextFile();

    expect(invokeMock).toHaveBeenCalledWith('extract_docx_text', { path: '/tmp/Doc.DOCX' });
    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(result).toEqual({ path: '/tmp/Doc.DOCX', name: 'Doc.DOCX', text: 'docx content' });
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

    expect(invokeMock).toHaveBeenCalledWith('extract_docx_text', { path: 'C\\\\Users\\\\me\\\\report.docx' });
    expect(result?.name).toBe('report.docx');
  });
});
