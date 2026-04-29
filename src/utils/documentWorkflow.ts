import { chunkText, estimateTextStats, resolveSplitIndex } from './index';

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

export interface SplitPreview {
  beforeText: string;
  afterText: string;
  isValid: boolean;
  adjustedSplitAt: number | null;
}

export function buildImportPreview(
  text: string,
  options: {
    useChunking?: boolean;
    targetChunkCount?: number;
    markdownAware?: boolean;
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
    warnings: buildImportWarnings(text, options),
  };
}

export function buildSplitPreview(
  text: string,
  splitAt: number,
  options: { markdownAware?: boolean } = {},
): SplitPreview {
  const boundedSplitAt = resolveSplitIndex(text, splitAt, options);
  if (boundedSplitAt === null) {
    return {
      beforeText: '',
      afterText: '',
      isValid: false,
      adjustedSplitAt: null,
    };
  }
  const beforeText = text.slice(0, boundedSplitAt).trim();
  const afterText = text.slice(boundedSplitAt).trim();

  return {
    beforeText,
    afterText,
    isValid: beforeText.length > 0 && afterText.length > 0,
    adjustedSplitAt: boundedSplitAt,
  };
}

function buildImportWarnings(
  text: string,
  options: {
    markdownAware?: boolean;
    format?: 'plain' | 'markdown';
    experimental?: 'docx-markdown';
  },
): string[] {
  const warnings: string[] = [];
  if (options.format === 'markdown') {
    warnings.push('markdown');
  }
  if (options.experimental === 'docx-markdown') {
    warnings.push('docx-markdown');
  }
  if (options.markdownAware && /\[\^[^\]]+\]:/.test(text)) {
    warnings.push('footnotes');
  }
  return warnings;
}
