import { describe, expect, it } from 'vitest';
import {
  aggregateEntries,
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  summarizeChunkUsage,
  summarizeGlobalUsage,
} from './operationLogStats';
import type { OperationLogEntry } from '../stores/operationLogStore';

function entry(partial: Partial<OperationLogEntry>): OperationLogEntry {
  return {
    id: partial.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    at: partial.at ?? new Date().toISOString(),
    level: partial.level ?? 'info',
    scope: partial.scope ?? 'stage',
    message: partial.message ?? '',
    ...partial,
  };
}

describe('aggregateEntries', () => {
  it('returns zeros for an empty list', () => {
    const stats = aggregateEntries([]);
    expect(stats.totalInput).toBe(0);
    expect(stats.totalOutput).toBe(0);
    expect(stats.totalCached).toBe(0);
    expect(stats.cacheHitRate).toBeNull();
    expect(stats.totalDurationMs).toBe(0);
    expect(stats.totalUsd).toBe(0);
    expect(stats.byChunk.size).toBe(0);
  });

  it('sums tokens across entries with usage metadata', () => {
    const stats = aggregateEntries([
      entry({
        meta: { inputTokens: 100, outputTokens: 200, cachedInputTokens: 50, cacheMissInputTokens: 50 },
      }),
      entry({
        meta: { inputTokens: 300, outputTokens: 100, cachedInputTokens: 200, cacheMissInputTokens: 100 },
      }),
    ]);
    expect(stats.totalInput).toBe(400);
    expect(stats.totalOutput).toBe(300);
    expect(stats.totalCached).toBe(250);
    expect(stats.totalCacheMiss).toBe(150);
    expect(stats.cacheHitRate).toBeCloseTo(250 / 400);
  });

  it('ignores entries without usage in meta', () => {
    const stats = aggregateEntries([
      entry({ scope: 'pipeline', message: 'start' }),
      entry({ meta: { inputTokens: 50, outputTokens: 25 } }),
    ]);
    expect(stats.totalInput).toBe(50);
    expect(stats.totalOutput).toBe(25);
  });

  it('accumulates durationMs only from end-phase entries', () => {
    const stats = aggregateEntries([
      entry({ phase: 'start', durationMs: 999 }),
      entry({ phase: 'end', durationMs: 1000 }),
      entry({ phase: 'end', durationMs: 500 }),
      entry({ durationMs: 200 }),
    ]);
    expect(stats.totalDurationMs).toBe(1500);
  });

  it('returns null cacheHitRate when no cache stats are available', () => {
    const stats = aggregateEntries([
      entry({ meta: { inputTokens: 100, outputTokens: 50 } }),
    ]);
    expect(stats.cacheHitRate).toBeNull();
  });

  it('groups stats by chunkId', () => {
    const stats = aggregateEntries([
      entry({ chunkId: 'a', meta: { inputTokens: 100, outputTokens: 50 } }),
      entry({ chunkId: 'a', meta: { inputTokens: 200, outputTokens: 100 } }),
      entry({ chunkId: 'b', meta: { inputTokens: 50, outputTokens: 25 } }),
    ]);
    expect(stats.byChunk.get('a')?.totalInput).toBe(300);
    expect(stats.byChunk.get('a')?.totalOutput).toBe(150);
    expect(stats.byChunk.get('b')?.totalInput).toBe(50);
  });

  it('reports cost as 0 when all usage comes from ollama', () => {
    const stats = aggregateEntries([
      entry({
        meta: { provider: 'ollama', model: 'llama', inputTokens: 1000, outputTokens: 500 },
      }),
    ]);
    expect(stats.totalUsd).toBe(0);
    expect(stats.isFullyFree).toBe(true);
  });

  it('flags unknown pricing as null totalUsd', () => {
    const stats = aggregateEntries([
      entry({
        meta: {
          provider: 'mystery',
          model: 'unknown-model',
          inputTokens: 1000,
          outputTokens: 500,
        },
      }),
    ]);
    expect(stats.totalUsd).toBeNull();
    expect(stats.hasUnknownPricing).toBe(true);
    expect(stats.isFullyFree).toBe(false);
  });

  it('computes cost from pricing overrides when provided', () => {
    const stats = aggregateEntries(
      [
        entry({
          meta: {
            provider: 'openai',
            model: 'custom',
            inputTokens: 1_000_000,
            outputTokens: 500_000,
          },
        }),
      ],
      { 'openai/custom': { input: 2, output: 4 } },
    );
    // 1M * 2 / 1M + 500k * 4 / 1M = 2 + 2 = 4
    expect(stats.totalUsd).toBe(4);
  });

  it('builds global summaries by category and model', () => {
    const summary = summarizeGlobalUsage([
      entry({
        scope: 'stage',
        phase: 'end',
        stageId: 'translate',
        message: 'Stage "Translate" completed',
        chunkId: 'a',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 25,
          cachedInputTokens: 40,
          cacheMissInputTokens: 60,
        },
      }),
      entry({
        scope: 'audit',
        phase: 'end',
        message: 'Audit completed',
        chunkId: 'a',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4-mini',
          inputTokens: 50,
          outputTokens: 10,
          cachedInputTokens: 20,
          cacheMissInputTokens: 30,
        },
      }),
      entry({
        scope: 'coherence',
        phase: 'end',
        message: 'Coherence completed',
        chunkId: 'a',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4-nano',
          inputTokens: 20,
          outputTokens: 5,
        },
      }),
    ]);

    expect(summary.overall.totalInput).toBe(170);
    expect(summary.translation.totalInput).toBe(100);
    expect(summary.audit.totalInput).toBe(50);
    expect(summary.coherence.totalInput).toBe(20);
    expect(summary.translationRuns).toBe(1);
    expect(summary.auditRuns).toBe(1);
    expect(summary.coherenceRuns).toBe(1);
    expect(summary.modelNames).toEqual([
      'openai / gpt-5.4',
      'openai / gpt-5.4-mini',
      'openai / gpt-5.4-nano',
    ]);
    expect(summary.modelBreakdown[0]?.modelName).toBe('openai / gpt-5.4');
  });

  it('builds chunk summaries with cumulative totals and last runs', () => {
    const summary = summarizeChunkUsage([
      entry({
        at: '2026-06-06T09:00:00.000Z',
        scope: 'stage',
        phase: 'end',
        stageId: 'translate',
        chunkId: 'a',
        message: 'Stage "Translate" completed',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4',
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 0,
          cacheMissInputTokens: 100,
        },
      }),
      entry({
        at: '2026-06-06T10:00:00.000Z',
        scope: 'stage',
        phase: 'end',
        stageId: 'refine',
        chunkId: 'a',
        message: 'Stage "Refine" completed',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4-mini',
          inputTokens: 80,
          outputTokens: 15,
          cachedInputTokens: 64,
          cacheMissInputTokens: 16,
        },
      }),
      entry({
        at: '2026-06-06T11:00:00.000Z',
        scope: 'audit',
        phase: 'end',
        chunkId: 'a',
        message: 'Audit completed',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4-mini',
          inputTokens: 40,
          outputTokens: 8,
          cachedInputTokens: 20,
          cacheMissInputTokens: 20,
        },
      }),
      entry({
        at: '2026-06-06T08:00:00.000Z',
        scope: 'stage',
        phase: 'end',
        stageId: 'translate',
        chunkId: 'b',
        message: 'Stage "Translate" completed',
        meta: {
          provider: 'openai',
          model: 'gpt-5.4',
          inputTokens: 999,
          outputTokens: 1,
        },
      }),
    ], 'a');

    expect(summary.total.totalInput).toBe(220);
    expect(summary.translationRuns).toBe(2);
    expect(summary.auditRuns).toBe(1);
    expect(summary.lastTranslationRun?.stageName).toBe('Refine');
    expect(summary.lastTranslationRun?.provider).toBe('openai');
    expect(summary.lastTranslationRun?.stats.totalInput).toBe(80);
    expect(summary.lastAuditRun?.stats.totalInput).toBe(40);
  });
});

describe('formatting helpers', () => {
  it('formats cache hit rate as percent', () => {
    expect(formatCacheHitRate(0.5)).toBe('50%');
    expect(formatCacheHitRate(null)).toBe('—');
  });

  it('formats duration in ms / s / m s', () => {
    expect(formatDurationMs(500)).toBe('500 ms');
    expect(formatDurationMs(1500)).toBe('1.5 s');
    expect(formatDurationMs(90000)).toBe('1m 30s');
  });

  it('formats USD with the right precision', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.001)).toBe('<$0.01');
    expect(formatUsd(1.234)).toBe('$1.23');
  });
});
