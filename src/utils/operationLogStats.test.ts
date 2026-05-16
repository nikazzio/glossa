import { describe, expect, it } from 'vitest';
import { aggregateEntries, formatCacheHitRate, formatDurationMs, formatUsd } from './operationLogStats';
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
    expect(stats.byStage.size).toBe(0);
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

  it('groups stats by stageId', () => {
    const stats = aggregateEntries([
      entry({ stageId: 's1', meta: { inputTokens: 100, outputTokens: 50 } }),
      entry({ stageId: 's2', meta: { inputTokens: 200, outputTokens: 100 } }),
    ]);
    expect(stats.byStage.get('s1')?.totalInput).toBe(100);
    expect(stats.byStage.get('s2')?.totalInput).toBe(200);
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
