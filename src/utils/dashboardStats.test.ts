import { describe, expect, it } from 'vitest';
import type { UsageRow } from '../services/statsService';
import {
  chunkCosts,
  costPerThousandWords,
  inPeriod,
  monthProjection,
  periodStart,
  summarizeModels,
  summarizeOcrPrecision,
  summarizeQuality,
  summarizeSpend,
  summarizeTokens,
} from './dashboardStats';

const row = (overrides: Partial<UsageRow>): UsageRow => ({
  at: '2026-10-05T10:00:00.000Z', scope: 'stage', level: 'success', phase: 'end',
  provider: 'openai', model: 'gpt-x', input_tokens: 1000, output_tokens: 500,
  cached_input_tokens: null, cache_miss_input_tokens: null, duration_ms: 2000,
  cost_usd: 0.01, is_free: 0, attempt_number: null, chunk_id: 'c', project_id: 'p',
  transcription_document_id: null, ...overrides,
});

describe('dashboard statistics', () => {
  it('starts the period the right number of days back, and never for all history', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    expect(periodStart('30d', now)).toBe('2026-10-01T12:00:00.000Z');
    expect(periodStart('all', now)).toBeNull();
    expect(inPeriod('2026-10-02 08:00:00', '2026-10-01T12:00:00.000Z')).toBe(true);
    expect(inPeriod('2026-09-30T08:00:00Z', '2026-10-01T12:00:00.000Z')).toBe(false);
  });

  it('splits spend between translation and OCR and leaves unpriced calls out of the total', () => {
    const spend = summarizeSpend([
      row({ cost_usd: 0.2 }),
      row({ scope: 'ocr', cost_usd: 0.05 }),
      row({ cost_usd: null, provider: 'mystery', model: 'unknown' }),
      row({ level: 'error', input_tokens: null, output_tokens: null, cost_usd: null }),
    ], {});
    expect(spend.translation).toBeCloseTo(0.2);
    expect(spend.ocr).toBeCloseTo(0.05);
    expect(spend.unpricedCalls).toBe(1);
  });

  it('projects the month spend over the elapsed share of the month, not before the fourth day', () => {
    const rows = [row({ at: new Date(2026, 9, 2, 10).toISOString(), cost_usd: 1 })];
    // 10 ottobre a mezzogiorno: trascorsi 9,5 giorni su 31.
    expect(monthProjection(rows, {}, new Date(2026, 9, 10, 12)).projected).toBeCloseTo(31 / 9.5);
    expect(monthProjection(rows, {}, new Date(2026, 9, 2, 12)).projected).toBeNull();
  });

  it('measures failures as failed attempts over all attempts, with a Wilson interval', () => {
    const models = summarizeModels([
      row({ duration_ms: 1000 }), row({ duration_ms: 3000 }), row({ duration_ms: 2000 }),
      row({ phase: 'retry', level: 'warn', input_tokens: null, output_tokens: null }),
      row({ level: 'error', input_tokens: null, output_tokens: null }),
    ], {});
    expect(models[0]).toMatchObject({ calls: 3, failures: 2, attempts: 5, medianSeconds: 2 });
    expect(models[0].failureRate).toBeCloseTo(0.4);
    expect(models[0].p90Seconds).toBeCloseTo(2.8);
    expect(models[0].failureInterval!.low).toBeLessThan(0.4);
  });

  it('measures the cache share only where the provider reports it', () => {
    expect(summarizeTokens([row({})]).cacheRate).toBeNull();
    expect(summarizeTokens([row({ cached_input_tokens: 300, cache_miss_input_tokens: 700 })]).cacheRate).toBeCloseTo(0.3);
  });

  it('keeps fragments without a recorded cost out of the cost per 1,000 words', () => {
    const costs = chunkCosts([
      row({ chunk_id: 'a', cost_usd: 0.1 }), row({ chunk_id: 'a', cost_usd: 0.1 }),
      row({ chunk_id: 'b', cost_usd: 0.2 }), row({ chunk_id: 'c', cost_usd: 0.3 }),
    ], {});
    const words = [{ id: 'a', words: 1000 }, { id: 'b', words: 1000 }, { id: 'c', words: 1000 }, { id: 'old', words: 9000 }];
    const estimate = costPerThousandWords(costs, words)!;
    expect(estimate.value).toBeCloseTo(0.7 / 3);
    expect(estimate.sample).toBe(3);
    expect(costPerThousandWords(new Map([['a', 1]]), words)).toBeNull();
  });

  it('computes the cost per good fragment only on fragments with a recorded cost', () => {
    const rows = ['a', 'b', 'c', 'old'].map((chunk_id, index) =>
      ({ chunk_id, rating: index < 2 ? 'good' : 'poor', model: 'gpt-x', provider: 'openai' }));
    const quality = summarizeQuality(rows, new Map([['a', 0.1], ['b', 0.1], ['c', 0.1]]));
    expect(quality[0].goodShare).toBeCloseTo(0.5);
    expect(quality[0].costPerGood).toBeCloseTo(0.15);
    expect(quality[0].costSample).toBe(3);
  });

  it('ranks OCR models by character error rate, best first', () => {
    const precision = summarizeOcrPrecision([
      { ocr_text: 'abcd', final_text: 'abcd', model: 'good' },
      { ocr_text: 'abxx', final_text: 'abcd', model: 'bad' },
    ]);
    expect(precision.map((entry) => entry.model)).toEqual(['good', 'bad']);
    expect(precision[1].cer).toBeCloseTo(0.5);
  });
});
