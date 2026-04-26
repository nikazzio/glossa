import { chunkText, estimateTextStats, findBestSplitIndex } from './index';

export interface ImportPreviewChunk {
  index: number;
  text: string;
  words: number;
  characters: number;
}

export interface ImportPreview {
  stats: ReturnType<typeof estimateTextStats>;
  chunks: ImportPreviewChunk[];
}

export interface SplitPreview {
  beforeText: string;
  afterText: string;
  splitAt: number;
  suggestedSplitAt: number;
  isValid: boolean;
}

export function buildImportPreview(
  text: string,
  options: {
    useChunking?: boolean;
    targetChunkCount?: number;
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
  };
}

export function buildSplitPreview(text: string, splitAt: number): SplitPreview {
  const suggestedSplitAt = Math.max(
    1,
    Math.min(splitAt, Math.max(1, text.length - 1)),
  );
  const beforeText = text.slice(0, suggestedSplitAt).trim();
  const afterText = text.slice(suggestedSplitAt).trim();

  return {
    beforeText,
    afterText,
    splitAt,
    suggestedSplitAt: findBestSplitIndex(text) ?? suggestedSplitAt,
    isValid: beforeText.length > 0 && afterText.length > 0,
  };
}
