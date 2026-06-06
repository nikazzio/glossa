import type { OperationLogEntry } from '../stores/operationLogStore';
import { MODEL_PRICING } from '../constants';

export interface OperationLogStats {
  totalInput: number;
  totalOutput: number;
  totalCached: number;
  totalCacheMiss: number;
  cacheHitRate: number | null;
  totalDurationMs: number;
  totalUsd: number | null;
  hasUnknownPricing: boolean;
  isFullyFree: boolean;
}

interface MutableStats {
  totalInput: number;
  totalOutput: number;
  totalCached: number;
  totalCacheMiss: number;
  totalDurationMs: number;
  totalUsd: number;
  hasUnknownPricing: boolean;
  isFullyFree: boolean;
}

export interface OperationLogStatsBuckets extends OperationLogStats {
  byChunk: Map<string, OperationLogStats>;
}

export type OperationUsageCategory = 'translation' | 'audit' | 'coherence';

export interface OperationLogRunSummary {
  category: OperationUsageCategory;
  at: string;
  chunkId?: string;
  stageId?: string;
  stageName?: string;
  provider?: string;
  model?: string;
  stats: OperationLogStats;
}

export interface GlobalUsageSummary {
  overall: OperationLogStats;
  translation: OperationLogStats;
  audit: OperationLogStats;
  coherence: OperationLogStats;
  modelNames: string[];
  modelBreakdown: Array<{
    modelName: string;
    stats: OperationLogStats;
  }>;
  translationRuns: number;
  auditRuns: number;
  coherenceRuns: number;
}

export interface ChunkUsageSummary {
  total: OperationLogStats;
  translationRuns: number;
  auditRuns: number;
  coherenceRuns: number;
  lastTranslationRun: OperationLogRunSummary | null;
  lastAuditRun: OperationLogRunSummary | null;
  lastCoherenceRun: OperationLogRunSummary | null;
}

type Pricing = Record<string, { input: number; output: number }>;

interface EntryUsage {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
}

function readUsage(entry: OperationLogEntry): EntryUsage {
  const meta = entry.meta ?? {};
  return {
    provider: typeof meta.provider === 'string' ? meta.provider : undefined,
    model: typeof meta.model === 'string' ? meta.model : undefined,
    inputTokens: typeof meta.inputTokens === 'number' ? meta.inputTokens : undefined,
    outputTokens: typeof meta.outputTokens === 'number' ? meta.outputTokens : undefined,
    cachedInputTokens:
      typeof meta.cachedInputTokens === 'number' ? meta.cachedInputTokens : undefined,
    cacheMissInputTokens:
      typeof meta.cacheMissInputTokens === 'number' ? meta.cacheMissInputTokens : undefined,
  };
}

function hasUsage(usage: EntryUsage): boolean {
  return usage.inputTokens != null
    || usage.outputTokens != null
    || usage.cachedInputTokens != null
    || usage.cacheMissInputTokens != null;
}

function stageNameFromEntry(entry: OperationLogEntry): string | undefined {
  const fromMeta = typeof entry.meta?.stageName === 'string' ? entry.meta.stageName : undefined;
  if (fromMeta) return fromMeta;
  const match = entry.message.match(/^Stage "(.+)" (?:started|completed|failed|was cancelled)$/);
  return match?.[1];
}

function categoryForEntry(entry: OperationLogEntry): OperationUsageCategory | null {
  if (entry.scope === 'stage') return 'translation';
  if (entry.scope === 'audit') return 'audit';
  if (entry.scope === 'coherence') return 'coherence';
  return null;
}

function costForEntry(usage: EntryUsage, pricingOverrides: Pricing): number | null {
  if (!usage.provider || !usage.model) return null;
  if (usage.provider === 'ollama') return 0;
  const key = `${usage.provider}/${usage.model}`;
  const pricing = pricingOverrides[key] ?? MODEL_PRICING[key];
  if (!pricing) return null;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (input * pricing.input + output * pricing.output) / 1_000_000;
}

function emptyStats(): MutableStats {
  return {
    totalInput: 0,
    totalOutput: 0,
    totalCached: 0,
    totalCacheMiss: 0,
    totalDurationMs: 0,
    totalUsd: 0,
    hasUnknownPricing: false,
    isFullyFree: true,
  };
}

function finalize(stats: MutableStats): OperationLogStats {
  const denom = stats.totalCached + stats.totalCacheMiss;
  const cacheHitRate = denom > 0 ? stats.totalCached / denom : null;
  const totalUsd = stats.hasUnknownPricing ? null : stats.totalUsd;
  return {
    totalInput: stats.totalInput,
    totalOutput: stats.totalOutput,
    totalCached: stats.totalCached,
    totalCacheMiss: stats.totalCacheMiss,
    cacheHitRate,
    totalDurationMs: stats.totalDurationMs,
    totalUsd,
    hasUnknownPricing: stats.hasUnknownPricing,
    isFullyFree: stats.isFullyFree,
  };
}

function finalizeSingleEntry(
  entry: OperationLogEntry,
  usage: EntryUsage,
  pricingOverrides: Pricing,
): OperationLogStats {
  const stats = emptyStats();
  accumulate(stats, entry, usage, pricingOverrides);
  return finalize(stats);
}

function accumulate(
  stats: MutableStats,
  entry: OperationLogEntry,
  usage: EntryUsage,
  pricingOverrides: Pricing,
): void {
  if (usage.inputTokens != null) stats.totalInput += usage.inputTokens;
  if (usage.outputTokens != null) stats.totalOutput += usage.outputTokens;
  if (usage.cachedInputTokens != null) stats.totalCached += usage.cachedInputTokens;
  if (usage.cacheMissInputTokens != null) stats.totalCacheMiss += usage.cacheMissInputTokens;
  if (entry.durationMs != null && entry.phase === 'end') {
    stats.totalDurationMs += entry.durationMs;
  }
  if (usage.provider && usage.model) {
    if (usage.provider !== 'ollama') stats.isFullyFree = false;
    const cost = costForEntry(usage, pricingOverrides);
    if (cost == null) stats.hasUnknownPricing = true;
    else stats.totalUsd += cost;
  }
}

/**
 * Aggregate token usage, cache stats, durations and costs from a stream of
 * operation log entries. Pure function — pass pricing overrides explicitly.
 *
 * Entries that don't carry usage in their meta are ignored for accounting.
 * Entries without a chunkId/stageId are excluded from the relative bucket
 * map but still contribute to the totals.
 */
export function aggregateEntries(
  entries: OperationLogEntry[],
  pricingOverrides: Pricing = {},
): OperationLogStatsBuckets {
  const total = emptyStats();
  const byChunk = new Map<string, MutableStats>();

  for (const entry of entries) {
    const usage = readUsage(entry);
    accumulate(total, entry, usage, pricingOverrides);

    if (entry.chunkId) {
      const bucket = byChunk.get(entry.chunkId) ?? emptyStats();
      accumulate(bucket, entry, usage, pricingOverrides);
      byChunk.set(entry.chunkId, bucket);
    }
  }

  const finalizedByChunk = new Map<string, OperationLogStats>();
  for (const [k, v] of byChunk) finalizedByChunk.set(k, finalize(v));

  return {
    ...finalize(total),
    byChunk: finalizedByChunk,
  };
}

export function summarizeGlobalUsage(
  entries: OperationLogEntry[],
  pricingOverrides: Pricing = {},
): GlobalUsageSummary {
  const overall = aggregateEntries(entries, pricingOverrides);
  const translationEntries: OperationLogEntry[] = [];
  const auditEntries: OperationLogEntry[] = [];
  const coherenceEntries: OperationLogEntry[] = [];
  const modelNames = new Set<string>();
  const entriesByModel = new Map<string, OperationLogEntry[]>();
  let translationRuns = 0;
  let auditRuns = 0;
  let coherenceRuns = 0;

  for (const entry of entries) {
    const usage = readUsage(entry);
    if (usage.provider && usage.model) {
      const modelName = `${usage.provider} / ${usage.model}`;
      modelNames.add(modelName);
      const bucket = entriesByModel.get(modelName) ?? [];
      bucket.push(entry);
      entriesByModel.set(modelName, bucket);
    }
    const category = categoryForEntry(entry);
    if (!category || entry.phase !== 'end' || !hasUsage(usage)) continue;
    if (category === 'translation') {
      translationEntries.push(entry);
      translationRuns += 1;
    } else if (category === 'audit') {
      auditEntries.push(entry);
      auditRuns += 1;
    } else {
      coherenceEntries.push(entry);
      coherenceRuns += 1;
    }
  }

  return {
    overall,
    translation: aggregateEntries(translationEntries, pricingOverrides),
    audit: aggregateEntries(auditEntries, pricingOverrides),
    coherence: aggregateEntries(coherenceEntries, pricingOverrides),
    modelNames: Array.from(modelNames),
    modelBreakdown: Array.from(entriesByModel.entries())
      .map(([modelName, modelEntries]) => ({
        modelName,
        stats: aggregateEntries(modelEntries, pricingOverrides),
      }))
      .sort((a, b) => b.stats.totalInput + b.stats.totalOutput - (a.stats.totalInput + a.stats.totalOutput)),
    translationRuns,
    auditRuns,
    coherenceRuns,
  };
}

function lastRunForCategory(
  entries: OperationLogEntry[],
  category: OperationUsageCategory,
  pricingOverrides: Pricing,
): OperationLogRunSummary | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    const usage = readUsage(entry);
    if (entry.phase !== 'end' || !hasUsage(usage)) continue;
    if (categoryForEntry(entry) !== category) continue;
    return {
      category,
      at: entry.at,
      chunkId: entry.chunkId,
      stageId: entry.stageId,
      stageName: category === 'translation' ? stageNameFromEntry(entry) : undefined,
      provider: usage.provider,
      model: usage.model,
      stats: finalizeSingleEntry(entry, usage, pricingOverrides),
    };
  }
  return null;
}

export function summarizeChunkUsage(
  entries: OperationLogEntry[],
  chunkId: string,
  pricingOverrides: Pricing = {},
): ChunkUsageSummary {
  const chunkEntries = entries.filter((entry) => entry.chunkId === chunkId);
  let translationRuns = 0;
  let auditRuns = 0;
  let coherenceRuns = 0;

  for (const entry of chunkEntries) {
    const usage = readUsage(entry);
    if (entry.phase !== 'end' || !hasUsage(usage)) continue;
    const category = categoryForEntry(entry);
    if (category === 'translation') translationRuns += 1;
    else if (category === 'audit') auditRuns += 1;
    else if (category === 'coherence') coherenceRuns += 1;
  }

  return {
    total: aggregateEntries(chunkEntries, pricingOverrides),
    translationRuns,
    auditRuns,
    coherenceRuns,
    lastTranslationRun: lastRunForCategory(chunkEntries, 'translation', pricingOverrides),
    lastAuditRun: lastRunForCategory(chunkEntries, 'audit', pricingOverrides),
    lastCoherenceRun: lastRunForCategory(chunkEntries, 'coherence', pricingOverrides),
  };
}

export function formatCacheHitRate(rate: number | null): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function formatUsd(usd: number | null): string {
  if (usd == null) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}
