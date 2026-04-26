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
      { name: 'Text files', extensions: ['txt', 'md', 'text'] },
      { name: 'All files', extensions: ['*'] },
    ],
    multiple: false,
  });
  if (!path) return null;
  const resolvedPath = path as string;
  return {
    path: resolvedPath,
    name: basename(resolvedPath),
    text: await readTextFile(resolvedPath),
  };
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

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}
