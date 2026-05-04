import { QualityRating, TranslationChunk } from '../types';

const QUALITY_RANK: Record<QualityRating, number> = {
  critical: 1,
  poor: 2,
  fair: 3,
  good: 4,
  excellent: 5,
};

export function normalizeQualityRating(value?: string): QualityRating {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'critical' || normalized === 'critico' || normalized === 'critica') return 'critical';
  if (normalized === 'poor' || normalized === 'scarso') return 'poor';
  if (normalized === 'fair' || normalized === 'sufficiente' || normalized === 'accettabile' || normalized === 'discreto') return 'fair';
  if (normalized === 'good' || normalized === 'buono') return 'good';
  if (normalized === 'excellent' || normalized === 'ottimo') return 'excellent';

  return 'fair';
}

export function calculateCompositeQuality(chunks: TranslationChunk[]): QualityRating | null {
  const completed = chunks.filter((chunk) => chunk.judgeResult.status === 'completed');
  if (completed.length === 0) return null;

  const average = completed.reduce(
    (acc, chunk) => acc + QUALITY_RANK[chunk.judgeResult.rating],
    0,
  ) / completed.length;

  if (average >= 4.5) return 'excellent';
  if (average >= 3.5) return 'good';
  if (average >= 2.5) return 'fair';
  if (average >= 1.5) return 'poor';
  return 'critical';
}

export type QualityTone = 'strong' | 'ok' | 'weak';

export function qualityTone(rating: QualityRating | null): QualityTone {
  if (rating === 'excellent' || rating === 'good') return 'strong';
  if (rating === 'fair') return 'ok';
  return 'weak';
}

export function qualityLabelKey(rating: QualityRating | null): string {
  if (rating === 'critical') return 'audit.ratingCritical';
  if (rating === 'poor') return 'audit.ratingPoor';
  if (rating === 'fair') return 'audit.ratingFair';
  if (rating === 'good') return 'audit.ratingGood';
  if (rating === 'excellent') return 'audit.ratingExcellent';
  return 'audit.ratingNone';
}

export function qualityExportLabel(rating: QualityRating): string {
  if (rating === 'critical') return 'critico';
  if (rating === 'poor') return 'scarso';
  if (rating === 'fair') return 'sufficiente';
  if (rating === 'good') return 'buono';
  return 'ottimo';
}

export function qualityDefault(): QualityRating {
  return 'fair';
}

export function qualityFailure(): QualityRating {
  return 'poor';
}

export function indexPad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface TextStats {
  characters: number;
  words: number;
  paragraphs: number;
}

export interface ChunkTextOptions {
  useChunking?: boolean;
  targetChunkCount?: number;
  markdownAware?: boolean;
  minWords?: number;
  maxWords?: number;
}

export function estimateTextStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const paragraphs = trimmed
    ? trimmed.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).length
    : 0;

  return {
    characters: text.length,
    words,
    paragraphs,
  };
}

export function recommendChunkCount(text: string, targetWordsPerChunk = 700): number {
  const words = estimateTextStats(text).words;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / targetWordsPerChunk));
}

export function chunkText(text: string, options: ChunkTextOptions = {}): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (options.useChunking === false) return [trimmed];

  const target = Math.max(0, Math.floor(options.targetChunkCount ?? 0));
  let chunks = target > 1
    ? splitIntoTargetChunks(trimmed, target, options)
    : splitParagraphs(trimmed, options);

  if (options.minWords && options.minWords > 0) {
    chunks = mergeSmallChunks(chunks, options.minWords);
  }

  if (options.maxWords && options.maxWords > 0) {
    chunks = splitLargeChunks(chunks, options.maxWords);
  }

  return chunks;
}

export function findBestSplitIndex(
  text: string,
  options: { markdownAware?: boolean } = {},
): number | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  if (options.markdownAware) {
    const markdownSplit = findNearestMarkdownBoundary(trimmed, Math.floor(trimmed.length / 2));
    if (markdownSplit !== null) return markdownSplit;
  }

  const midpoint = Math.floor(trimmed.length / 2);
  const candidates = ['\n\n', '\n', '. ', '; ', ', ', ' '];

  for (const separator of candidates) {
    const before = trimmed.lastIndexOf(separator, midpoint);
    const after = trimmed.indexOf(separator, midpoint);
    const best = chooseNearestValidSplit(trimmed, midpoint, before, after, separator.length);
    if (best !== null) return best;
  }

  return midpoint;
}

export function resolveSplitIndex(
  text: string,
  requestedSplitAt: number,
  options: { markdownAware?: boolean } = {},
): number | null {
  const boundedSplitAt = Math.max(1, Math.min(requestedSplitAt, text.length - 1));
  if (!options.markdownAware) return boundedSplitAt;
  return findNearestMarkdownBoundary(text, boundedSplitAt) ?? boundedSplitAt;
}

function splitParagraphs(text: string, options: ChunkTextOptions = {}): string[] {
  if (options.markdownAware) {
    return splitMarkdownBlocks(text);
  }
  return text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function splitIntoTargetChunks(text: string, target: number, options: ChunkTextOptions = {}): string[] {
  const paragraphs = splitParagraphs(text, options);
  if (paragraphs.length <= 1) {
    if (options.markdownAware) {
      return [text.trim()];
    }
    return splitWordsIntoTargetChunks(text, target);
  }

  const totalWords = paragraphs.reduce((acc, paragraph) => acc + countWords(paragraph), 0);
  const targetWords = Math.max(1, Math.ceil(totalWords / target));
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  paragraphs.forEach((paragraph, index) => {
    const paragraphWords = countWords(paragraph);
    const remainingParagraphs = paragraphs.length - index;
    const remainingSlots = target - chunks.length;
    const shouldClose =
      current.length > 0 &&
      currentWords + paragraphWords > targetWords &&
      remainingSlots > 1 &&
      (options.markdownAware || remainingParagraphs >= remainingSlots);

    if (shouldClose) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentWords = 0;
    }

    current.push(paragraph);
    currentWords += paragraphWords;
  });

  if (current.length > 0) chunks.push(current.join('\n\n'));

  if (!options.markdownAware && chunks.length < target && chunks.length === 1) {
    return splitWordsIntoTargetChunks(text, target);
  }

  return chunks;
}

function mergeSmallChunks(chunks: string[], minWords: number): string[] {
  if (chunks.length <= 1) return chunks;
  const result: string[] = [];
  let pending = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    if (countWords(pending) < minWords) {
      pending = `${pending.trim()}\n\n${chunks[i].trim()}`;
    } else {
      result.push(pending);
      pending = chunks[i];
    }
  }
  result.push(pending);
  return result;
}

function splitLargeChunks(chunks: string[], maxWords: number): string[] {
  const result: string[] = [];
  for (const chunk of chunks) {
    const words = countWords(chunk);
    if (words <= maxWords) {
      result.push(chunk);
      continue;
    }
    const parts = Math.ceil(words / maxWords);
    result.push(...splitWordsIntoTargetChunks(chunk, parts));
  }
  return result;
}

function splitMarkdownBlocks(text: string): string[] {
  const rawBlocks = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const mergedBlocks: string[] = [];
  for (const block of rawBlocks) {
    if (block.startsWith('[^') && block.includes(']:') && mergedBlocks.length > 0) {
      mergedBlocks[mergedBlocks.length - 1] = `${mergedBlocks[mergedBlocks.length - 1]}\n\n${block}`;
      continue;
    }
    mergedBlocks.push(block);
  }

  return mergedBlocks;
}

function findNearestMarkdownBoundary(text: string, pivot: number): number | null {
  const candidates = Array.from(text.matchAll(/\n{2,}/g))
    .map((match) => (match.index ?? 0) + match[0].length)
    .filter((index) => index > 0 && index < text.length);

  if (candidates.length === 0) return null;

  return candidates.sort(
    (left, right) => Math.abs(left - pivot) - Math.abs(right - pivot),
  )[0];
}

function splitWordsIntoTargetChunks(text: string, target: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunkSize = Math.max(1, Math.ceil(words.length / target));
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  return chunks;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function chooseNearestValidSplit(
  text: string,
  midpoint: number,
  before: number,
  after: number,
  separatorLength: number,
): number | null {
  const candidates = [before, after]
    .filter((index) => index > 0 && index < text.length - separatorLength)
    .map((index) => index + separatorLength);

  if (candidates.length === 0) return null;

  return candidates.sort(
    (left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint),
  )[0];
}

type RelativeUnit = {
  key: 'justNow' | 'minutesAgo' | 'hoursAgo' | 'daysAgo' | 'weeksAgo' | 'monthsAgo' | 'yearsAgo';
  count?: number;
};

export function relativeDateUnit(updatedAt: string | number | Date, now: Date = new Date()): RelativeUnit {
  const then = new Date(updatedAt);
  const diffMs = now.getTime() - then.getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return { key: 'justNow' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { key: 'minutesAgo', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'hoursAgo', count: hours };
  const days = Math.floor(hours / 24);
  if (days < 7) return { key: 'daysAgo', count: days };
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return { key: 'weeksAgo', count: weeks };
  const months = Math.floor(days / 30);
  if (months < 12) return { key: 'monthsAgo', count: months };
  const years = Math.floor(days / 365);
  return { key: 'yearsAgo', count: years };
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export { withRetry, friendlyError, classifyError } from './retry';
