import { TranslationChunk } from '../types';

export function calculateCompositeScore(chunks: TranslationChunk[]): number {
  const completed = chunks.filter(c => c.judgeResult.status === 'completed');
  if (completed.length === 0) return 0;
  const avg = completed.reduce((acc, c) => acc + c.judgeResult.score, 0) / completed.length;
  return Math.round(avg * 10);
}

export function indexPad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export { withRetry, friendlyError, classifyError } from './retry';
