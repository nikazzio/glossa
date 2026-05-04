import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { ExperimentalImportMode, TranslationChunk } from '../types';
import { qualityExportLabel } from '../utils';
import { buildMarkdownHtmlDocument, flattenMarkdownToText } from './markdown';

// ── Import ───────────────────────────────────────────────────────────

export interface ImportedTextFile {
  path: string;
  name: string;
  text: string;
  format?: 'plain' | 'markdown';
  experimental?: ExperimentalImportMode;
}

export async function importTextFile(): Promise<ImportedTextFile | null> {
  const path = await open({
    title: 'Import source text',
    filters: [
      { name: 'Documents', extensions: ['txt', 'md', 'text', 'docx', 'pdf'] },
      { name: 'Plain text', extensions: ['txt', 'md', 'text'] },
      { name: 'Word document', extensions: ['docx'] },
      { name: 'PDF document', extensions: ['pdf'] },
      { name: 'All files', extensions: ['*'] },
    ],
    multiple: false,
  });
  if (!path) return null;
  const resolvedPath = path as string;
  return {
    path: resolvedPath,
    name: basename(resolvedPath),
    ...(await readImportedText(resolvedPath)),
  };
}

async function readImportedText(path: string): Promise<Pick<ImportedTextFile, 'text' | 'format' | 'experimental'>> {
  const ext = extension(path);
  if (ext === 'docx') {
    return {
      text: await invoke<string>('extract_docx_markdown', { path }),
      format: 'markdown',
      experimental: 'docx-markdown',
    };
  }
  if (ext === 'pdf') {
    return {
      text: await invoke<string>('extract_pdf_text', { path }),
      format: 'plain',
    };
  }
  return {
    text: await readTextFile(path),
    format: ext === 'md' ? 'markdown' : 'plain',
  };
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportTranslation(
  chunks: TranslationChunk[],
  format: 'txt' | 'md' | 'html' | 'docx' = 'txt',
  options: { markdownAware?: boolean; separator?: string } = {},
): Promise<boolean> {
  const ext = format;
  const path = await save({
    title: 'Export translation',
    defaultPath: `translation.${ext}`,
    filters: [
      { name: `${ext.toUpperCase()} file`, extensions: [ext] },
    ],
  });
  if (!path) return false;

  const sep = options.separator ?? '\n\n';
  // For markdown-aware TXT, build markdown without separator then flatten,
  // then join the resulting plain-text segments with the chosen separator.
  // Passing the separator through markdown first would corrupt non-markdown
  // separators like "* * *" (parsed as a thematic break and then stripped).
  const markdown = buildMarkdown(chunks, '\n\n');

  if (format === 'docx') {
    const bytes = await invoke<number[]>('export_markdown_docx', { markdown });
    await writeFile(path, new Uint8Array(bytes));
    return true;
  }

  const content =
    format === 'md'
      ? buildMarkdown(chunks, sep)
      : format === 'html'
        ? buildMarkdownHtmlDocument(markdown, 'Translation Export')
        : options.markdownAware
          ? chunks.map((c) => flattenMarkdownToText(c.currentDraft || c.originalText)).join(sep)
          : buildPlainText(chunks, sep);

  await writeTextFile(path, content);
  return true;
}

export async function exportBilingual(
  chunks: TranslationChunk[],
): Promise<boolean> {
  const path = await save({
    title: 'Export bilingual',
    defaultPath: 'bilingual.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (!path) return false;

  const lines: string[] = ['# Bilingual Export — Glossa', ''];
  chunks.forEach((chunk, i) => {
    lines.push(`## Segment ${i + 1}`, '');
    lines.push('**Original:**', '', chunk.originalText, '');
    lines.push('**Translation:**', '', chunk.currentDraft || '_No translation_', '');
    if (chunk.judgeResult.status === 'completed') {
      lines.push(`**Quality:** ${qualityExportLabel(chunk.judgeResult.rating)}`, '');
    }
    if (chunk.judgeResult.issues.length > 0) {
      lines.push('**Issues:**', '');
      chunk.judgeResult.issues.forEach((issue) => {
        lines.push(`- [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      });
      lines.push('');
    }
    lines.push('---', '');
  });

  await writeTextFile(path, lines.join('\n'));
  return true;
}

export async function exportMarkdownTranslation(
  chunks: TranslationChunk[],
): Promise<boolean> {
  const path = await save({
    title: 'Export markdown translation',
    defaultPath: 'translation.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (!path) return false;

  const content = chunks
    .map((chunk) => chunk.currentDraft || chunk.originalText)
    .join('\n\n');

  await writeTextFile(path, content);
  return true;
}


// ── Helpers ──────────────────────────────────────────────────────────

function buildPlainText(chunks: TranslationChunk[], separator = '\n\n'): string {
  return chunks
    .map((c) => c.currentDraft || c.originalText)
    .join(separator);
}

function buildMarkdown(chunks: TranslationChunk[], separator = '\n\n'): string {
  return chunks
    .map((chunk) => (chunk.currentDraft || chunk.originalText).trim())
    .filter(Boolean)
    .join(separator);
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

function basename(path: string): string {
  return fileName(path);
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}
