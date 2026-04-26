import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { TranslationChunk } from '../types';
import { qualityExportLabel } from '../utils';

// ── Import ───────────────────────────────────────────────────────────

export interface ImportedTextFile {
  path: string;
  name: string;
  text: string;
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
    text: await readImportedText(resolvedPath),
  };
}

async function readImportedText(path: string): Promise<string> {
  const ext = extension(path);
  if (ext === 'docx') {
    return await invoke<string>('extract_docx_text', { path });
  }
  if (ext === 'pdf') {
    return await invoke<string>('extract_pdf_text', { path });
  }
  return await readTextFile(path);
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportTranslation(
  chunks: TranslationChunk[],
  format: 'txt' | 'md' = 'txt',
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

  const content = format === 'md'
    ? buildMarkdown(chunks)
    : buildPlainText(chunks);

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


// ── Helpers ──────────────────────────────────────────────────────────

function buildPlainText(chunks: TranslationChunk[]): string {
  return chunks
    .map((c) => c.currentDraft || c.originalText)
    .join('\n\n');
}

function buildMarkdown(chunks: TranslationChunk[]): string {
  const lines: string[] = ['# Translation — Glossa', ''];
  chunks.forEach((chunk, i) => {
    if (chunks.length > 1) lines.push(`## Segment ${i + 1}`, '');
    lines.push(chunk.currentDraft || chunk.originalText, '');
  });
  return lines.join('\n');
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
