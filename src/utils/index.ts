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
  targetWordsPerChunk?: number;
  markdownAware?: boolean;
  minWords?: number;
  maxWords?: number;
  headingAware?: boolean;
  carryTrailingShortBlocks?: boolean;
}

export function estimateTextStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const paragraphs = splitParagraphs(trimOuterBlankLines(text)).length;

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
  const normalized = trimOuterBlankLines(text);
  if (!normalized.trim()) return [];
  if (options.useChunking === false) return [normalized];

  const targetWords = options.targetWordsPerChunk ?? 0;
  let chunks = targetWords > 0
    ? splitByWordTarget(normalized, targetWords, options)
    : splitParagraphs(normalized, options);

  if (options.headingAware) chunks = mergeHeadingChunks(chunks);
  if (options.carryTrailingShortBlocks) chunks = mergeTrailingShortBlocks(chunks);
  if (options.minWords && options.minWords > 0) chunks = mergeSmallChunks(chunks, options.minWords);
  if (options.maxWords && options.maxWords > 0) chunks = splitLargeChunks(chunks, options.maxWords, options);

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
  const blocks = options.markdownAware
    ? mergeMarkdownFootnoteBlocks(text, getBlockRanges(text))
    : getBlockRanges(text);
  return blocks.map(({ start, end }) => text.slice(start, end));
}

function splitByWordTarget(text: string, targetWordsPerChunk: number, options: ChunkTextOptions = {}): string[] {
  const blocks = options.markdownAware
    ? mergeMarkdownFootnoteBlocks(text, getBlockRanges(text))
    : getBlockRanges(text);

  if (blocks.length <= 1) {
    if (options.markdownAware) return [text];
    const total = countWords(text);
    return splitWordsEvenly(text, Math.max(1, Math.round(total / targetWordsPerChunk)));
  }

  const chunks: string[] = [];
  let current: BlockRange[] = [];
  let currentWords = 0;

  for (const block of blocks) {
    const blockWords = countWords(text.slice(block.start, block.end));
    if (current.length > 0 && currentWords + blockWords > targetWordsPerChunk) {
      chunks.push(text.slice(current[0].start, current[current.length - 1].end));
      current = [];
      currentWords = 0;
    }
    current.push(block);
    currentWords += blockWords;
  }

  if (current.length > 0) {
    chunks.push(text.slice(current[0].start, current[current.length - 1].end));
  }

  return chunks;
}

function isHeadingChunk(text: string): boolean {
  const trimmed = text.trim();
  return /^#{1,6}\s+\S/.test(trimmed) && !trimmed.includes('\n');
}

function getNonEmptyTrimmedLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isListLikeLine(line: string): boolean {
  return /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
}

function isPlainTextHeadingLike(text: string): boolean {
  const lines = getNonEmptyTrimmedLines(text);
  if (lines.length === 0 || lines.length > 2) return false;
  if (countWords(text) > 12 || text.trim().length > 90) return false;
  return lines.every((line) =>
    /^[A-Z0-9À-ÖØ-Þ]/.test(line) &&
    !/[.!?…]$/.test(line) &&
    !isListLikeLine(line),
  );
}

function isCarryableTrailingShortBlock(text: string): boolean {
  const lines = getNonEmptyTrimmedLines(text);
  if (lines.length === 0 || lines.length > 2) return false;
  if (countWords(text) > 20 || text.trim().length > 140) return false;
  return lines.every((line) => !isListLikeLine(line));
}

// Detects a strict heading-like trailing block preceded by a blank line.
function extractTrailingHeading(text: string): { main: string; heading: string } | null {
  const blankLinePattern = /\r?\n\r?\n/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = blankLinePattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  const sepStart = lastMatch.index;
  const sepEnd = sepStart + lastMatch[0].length;
  const main = text.slice(0, sepStart);
  const trailing = text.slice(sepEnd);

  if (!main.trim() || !trailing.trim()) return null;
  if (!isHeadingChunk(trailing) && !isPlainTextHeadingLike(trailing)) return null;
  return { main, heading: trailing };
}

function mergeHeadingChunks(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  const result: string[] = [];
  let headingAccumulator = '';
  // Precompute for each index whether any body chunk follows it (O(n) reverse pass)
  const hasBodyAfter = new Array<boolean>(chunks.length).fill(false);
  for (let j = chunks.length - 2; j >= 0; j--) {
    hasBodyAfter[j] = !isHeadingChunk(chunks[j + 1]!) || (hasBodyAfter[j + 1] ?? false);
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (isHeadingChunk(chunk)) {
      headingAccumulator = headingAccumulator
        ? `${headingAccumulator}\n\n${chunk}`
        : chunk;
    } else {
      const extracted = hasBodyAfter[i] ? extractTrailingHeading(chunk) : null;
      if (extracted) {
        // Push the body of this chunk (with any pending headings), carry the trailing heading forward
        const merged = headingAccumulator
          ? `${headingAccumulator}\n\n${extracted.main}`
          : extracted.main;
        result.push(merged);
        headingAccumulator = extracted.heading;
      } else {
        const merged = headingAccumulator
          ? `${headingAccumulator}\n\n${chunk}`
          : chunk;
        result.push(merged);
        headingAccumulator = '';
      }
    }
  }
  // If trailing headings remain (no following non-heading chunk), push them as-is
  if (headingAccumulator) {
    result.push(headingAccumulator);
  }
  return result;
}

function extractTrailingShortBlock(text: string): { main: string; trailing: string } | null {
  const blankLinePattern = /\r?\n\r?\n/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = blankLinePattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  const sepStart = lastMatch.index;
  const sepEnd = sepStart + lastMatch[0].length;
  const main = text.slice(0, sepStart);
  const trailing = text.slice(sepEnd);

  if (!main.trim() || !trailing.trim()) return null;
  if (!isCarryableTrailingShortBlock(trailing)) return null;
  return { main, trailing };
}

function mergeTrailingShortBlocks(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  const result: string[] = [];
  let carried = '';

  for (let i = 0; i < chunks.length; i++) {
    const combined = carried ? `${carried}\n\n${chunks[i]!}` : chunks[i]!;
    carried = '';

    if (i === chunks.length - 1) {
      result.push(combined);
      continue;
    }

    const extracted = extractTrailingShortBlock(combined);
    if (!extracted) {
      result.push(combined);
      continue;
    }

    result.push(extracted.main);
    carried = extracted.trailing;
  }

  return result;
}

function mergeSmallChunks(chunks: string[], minWords: number): string[] {
  if (chunks.length <= 1) return chunks;
  const result: string[] = [];
  let pending = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    if (countWords(pending) < minWords) {
      pending = `${pending}\n\n${chunks[i]}`;
    } else {
      result.push(pending);
      pending = chunks[i];
    }
  }
  result.push(pending);
  return result;
}

function splitLargeChunks(chunks: string[], maxWords: number, options: ChunkTextOptions = {}): string[] {
  const result: string[] = [];
  for (const chunk of chunks) {
    if (countWords(chunk) <= maxWords) {
      result.push(chunk);
      continue;
    }
    if (options.markdownAware) {
      const blocks = getBlockRanges(chunk);
      if (blocks.length > 1) {
        result.push(...splitByWordTarget(chunk, maxWords, options));
      } else {
        result.push(chunk);
      }
      continue;
    }
    const parts = Math.ceil(countWords(chunk) / maxWords);
    result.push(...splitWordsEvenly(chunk, parts));
  }
  return result;
}

function splitMarkdownBlocks(text: string): string[] {
  const mergedBlocks = mergeMarkdownFootnoteBlocks(text, getBlockRanges(text));
  return mergedBlocks.map(({ start, end }) => text.slice(start, end));
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

function splitWordsEvenly(text: string, partCount: number): string[] {
  const words = Array.from(text.matchAll(/\S+/g))
    .map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  if (words.length === 0) return [];

  const chunkSize = Math.max(1, Math.ceil(words.length / partCount));
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const first = words[i];
    const last = words[Math.min(i + chunkSize - 1, words.length - 1)];
    chunks.push(text.slice(first!.start, last!.end));
  }

  return chunks;
}

type BlockRange = {
  start: number;
  end: number;
};

export function trimOuterBlankLines(text: string): string {
  return text
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}

export function trimSplitFragment(text: string): string {
  return trimOuterBlankLines(text)
    .replace(/^[ \t]+/, '')
    .replace(/[ \t]+$/, '');
}

function getBlockRanges(text: string): BlockRange[] {
  const normalized = trimOuterBlankLines(text);
  if (!normalized.trim()) return [];

  const blocks: BlockRange[] = [];
  const separator = /\r?\n(?:[ \t]*\r?\n)+/g;
  let start = 0;

  for (const match of normalized.matchAll(separator)) {
    const end = match.index ?? 0;
    if (normalized.slice(start, end).trim()) {
      blocks.push({ start, end });
    }
    start = end + match[0].length;
  }

  if (normalized.slice(start).trim()) {
    blocks.push({ start, end: normalized.length });
  }

  return blocks;
}

function mergeMarkdownFootnoteBlocks(text: string, blocks: BlockRange[]): BlockRange[] {
  if (blocks.length <= 1) return blocks;

  const merged: BlockRange[] = [];
  for (const block of blocks) {
    const blockText = text.slice(block.start, block.end);
    if (merged.length > 0 && isFootnoteDefinitionBlock(blockText)) {
      merged[merged.length - 1] = {
        start: merged[merged.length - 1].start,
        end: block.end,
      };
      continue;
    }

    merged.push(block);
  }

  return merged;
}

function isFootnoteDefinitionBlock(text: string): boolean {
  const trimmed = text.trimStart();
  return /^\[\^[^\]]+\]:/.test(trimmed);
}

export function countWords(text: string): number {
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

export function formatDateTime(value: string | number | Date): string {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export { withRetry, friendlyError, classifyError } from './retry';
