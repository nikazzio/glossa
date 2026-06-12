import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Annotation, ExperimentalImportMode, TranslationChunk } from '../types';
import { qualityExportLabel } from '../utils';
import { buildMarkdownHtmlDocument, flattenMarkdownToText } from './markdown';
import { composeAnnotatedMarkdown } from '../utils/annotationMarkdown';
import { normalizeImportedText } from '../utils/textNormalization';

export type ChunkAnnotations = Map<string, Annotation[]>;

/**
 * Translation text for export with annotation footnotes injected (when present).
 * Falls back to the source text for untranslated chunks.
 */
function chunkExportText(chunk: TranslationChunk, annotations?: ChunkAnnotations): string {
  const base = chunk.translationDisplayText || chunk.sourceDisplayText;
  const chunkAnnotations = annotations?.get(chunk.id);
  return chunkAnnotations?.length ? composeAnnotatedMarkdown(base, chunkAnnotations) : base;
}

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
    const raw = await invoke<string>('extract_docx_markdown', { path });
    return { text: normalizeImportedText(raw, 'markdown'), format: 'markdown', experimental: 'docx-markdown' };
  }
  if (ext === 'pdf') {
    const raw = await invoke<string>('extract_pdf_text', { path }).catch((err: unknown) => {
      throw new Error(typeof err === 'string' ? err : 'pdf_import_failed');
    });
    return { text: normalizeImportedText(raw, 'plain'), format: 'plain' };
  }
  const format = ext === 'md' ? 'markdown' : 'plain';
  const raw = await readTextFile(path);
  return { text: normalizeImportedText(raw, format), format };
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportTranslation(
  chunks: TranslationChunk[],
  format: 'txt' | 'md' | 'html' | 'docx' = 'txt',
  options: { markdownAware?: boolean; separator?: string; annotations?: ChunkAnnotations } = {},
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
  const annotations = options.annotations;
  // For markdown-aware TXT, build markdown without separator then flatten,
  // then join the resulting plain-text segments with the chosen separator.
  // Passing the separator through markdown first would corrupt non-markdown
  // separators like "* * *" (parsed as a thematic break and then stripped).
  const markdown = buildMarkdown(chunks, '\n\n', annotations);

  if (format === 'docx') {
    const bytes = await invoke<number[]>('export_markdown_docx', { markdown });
    await writeFile(path, new Uint8Array(bytes));
    return true;
  }

  const content =
    format === 'md'
      ? buildMarkdown(chunks, sep, annotations)
      : format === 'html'
        ? buildMarkdownHtmlDocument(markdown, 'Translation Export')
        : options.markdownAware
          ? chunks.map((c) => flattenMarkdownToText(chunkExportText(c, annotations))).join(sep)
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
    lines.push('**Original:**', '', chunk.sourceDisplayText, '');
    lines.push('**Translation:**', '', chunk.translationDisplayText || '_No translation_', '');
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
  annotations?: ChunkAnnotations,
): Promise<boolean> {
  const path = await save({
    title: 'Export markdown translation',
    defaultPath: 'translation.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (!path) return false;

  const content = chunks.map((chunk) => chunkExportText(chunk, annotations)).join('\n\n');

  await writeTextFile(path, content);
  return true;
}


// ── Helpers ──────────────────────────────────────────────────────────

function buildPlainText(chunks: TranslationChunk[], separator = '\n\n'): string {
  return chunks
    .map((c) => c.translationDisplayText || c.sourceDisplayText)
    .join(separator);
}

function buildMarkdown(
  chunks: TranslationChunk[],
  separator = '\n\n',
  annotations?: ChunkAnnotations,
): string {
  return chunks
    .map((chunk) => chunkExportText(chunk, annotations))
    .filter((chunk) => chunk.trim().length > 0)
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
