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
}

export interface SplitPreview {
  beforeText: string;
  afterText: string;
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
  const boundedSplitAt = Math.max(
    1,
    Math.min(splitAt, Math.max(1, text.length - 1)),
  );
  const beforeText = text.slice(0, boundedSplitAt).trim();
  const afterText = text.slice(boundedSplitAt).trim();

  return {
    beforeText,
    afterText,
    isValid: beforeText.length > 0 && afterText.length > 0,
  };
}
