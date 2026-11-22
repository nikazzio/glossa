import { chunkText, estimateTextStats } from './index';

export interface ImportPreviewChunk {
  index: number;
  text: string;
  words: number;
  characters: number;
}

export interface ImportPreview {
  stats: ReturnType<typeof estimateTextStats>;
  chunks: ImportPreviewChunk[];
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
  warnings: string[];
}

export function buildImportPreview(
  text: string,
  options: {
    useChunking?: boolean;
    targetWordsPerChunk?: number;
    markdownAware?: boolean;
    minWords?: number;
    maxWords?: number;
    headingAware?: boolean;
    carryTrailingShortBlocks?: boolean;
    format?: 'plain' | 'markdown';
    experimental?: 'docx-markdown';
  },
): ImportPreview {
  const chunks = chunkText(text, options).map((chunk, index) => ({
    index,
    text: chunk,
    words: estimateTextStats(chunk).words,
    characters: chunk.length,
  }));

  return {
    stats: estimateTextStats(text),
    chunks,
    format: options.format,
    experimental: options.experimental,
    warnings: buildImportWarnings(options),
  };
}

function buildImportWarnings(options: {
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
}): string[] {
  const warnings: string[] = [];
  if (options.format === 'markdown') warnings.push('markdown');
  if (options.experimental === 'docx-markdown') warnings.push('docx-markdown');
  return warnings;
}
