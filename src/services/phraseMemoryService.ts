import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { EmbeddingModel, PhraseMatch, PhraseMemorySplitter } from '../types';
import { fetchEmbeddings, estimateEmbeddingCostUsd, estimateTokenCount } from './embeddingService';

const MIN_PHRASE_CHARS = 3;
const EMBEDDING_BATCH_SIZE = 20;

// ── Sentence Splitter ────────────────────────────────────────────────

function splitByRegex(text: string): string[] {
  return text
    .split(/[.;:]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_PHRASE_CHARS);
}

export async function splitPhrases(sourceText: string, splitter: PhraseMemorySplitter): Promise<string[]> {
  switch (splitter) {
    case 'none':
      return [sourceText];
    case 'regex':
      return splitByRegex(sourceText);
    case 'llm': {
      try {
        return await invoke<string[]>('split_phrases_llm', { sourceText });
      } catch (err) {
        logger.warn('split_phrases_llm failed, fallback a regex', { error: String(err) });
        return splitByRegex(sourceText);
      }
    }
  }
}

// ── Job pre-generazione embedding ───────────────────────────────────

export interface EmbeddingJobOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  chunks: Array<{ id: string; text: string }>;
  onProgress: (processed: number, total: number, estimatedCostUsd: number) => void;
}

export async function runEmbeddingJob(options: EmbeddingJobOptions): Promise<void> {
  const { workspaceId, embeddingModel, splitter, chunks, onProgress } = options;

  const allPhrases: Array<{ chunkId: string; phrase: string }> = [];
  for (const chunk of chunks) {
    const phrases = await splitPhrases(chunk.text, splitter);
    for (const phrase of phrases) {
      allPhrases.push({ chunkId: chunk.id, phrase });
    }
  }

  const total = allPhrases.length;
  let processed = 0;
  let totalTokens = 0;

  for (let i = 0; i < allPhrases.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = allPhrases.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vectors = await fetchEmbeddings(batch.map((p) => p.phrase), embeddingModel);

    for (let j = 0; j < batch.length; j++) {
      const embedding = vectors[j];
      if (!embedding) continue;
      const { chunkId, phrase } = batch[j];
      await invoke('vec_upsert_source_phrase', { workspaceId, chunkId, phrase, embedding });
      totalTokens += estimateTokenCount(phrase);
    }

    processed += batch.length;
    onProgress(Math.min(processed, total), total, estimateEmbeddingCostUsd(totalTokens, embeddingModel));
  }
}

// ── Search pre-pipeline ──────────────────────────────────────────────

export interface SearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  queryText: string;
  threshold: number;
  maxResults: number;
}

type RawPhraseMatch = {
  phrase_memory_id: string;
  source_phrase: string;
  target_phrase: string;
  distance: number;
};

export async function searchPhraseMemory(options: SearchOptions): Promise<PhraseMatch[]> {
  const { workspaceId, embeddingModel, queryText, threshold, maxResults } = options;
  const [queryEmbedding] = await fetchEmbeddings([queryText], embeddingModel);
  if (!queryEmbedding) return [];

  const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
    workspaceId, queryEmbedding, threshold, maxResults,
  });

  return raw.map((r) => ({
    phraseMemoryId: r.phrase_memory_id,
    sourcePhrase: r.source_phrase,
    targetPhrase: r.target_phrase,
    distance: r.distance,
  }));
}

// ── Save on lock ─────────────────────────────────────────────────────

export interface SaveLockedPhrasesOptions {
  workspaceId: string;
  chunkId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  sourceText: string;
  targetText: string;
  minPhraseLength: number;
}

export async function saveLockedPhrases(options: SaveLockedPhrasesOptions): Promise<void> {
  const { workspaceId, chunkId, embeddingModel, splitter, sourceText, targetText, minPhraseLength } = options;

  const sourcePhrases = await splitPhrases(sourceText, splitter);
  const targetPhrases = await splitPhrases(targetText, splitter);
  const pairCount = Math.min(sourcePhrases.length, targetPhrases.length);
  if (pairCount === 0) return;

  const paired = sourcePhrases.slice(0, pairCount).map((sp, i) => ({
    sourcePhrase: sp,
    targetPhrase: targetPhrases[i],
  }));

  const sourceVectors = await fetchEmbeddings(paired.map((p) => p.sourcePhrase), embeddingModel);
  const pairs = paired.map((p, i) => ({
    sourcePhrase: p.sourcePhrase,
    targetPhrase: p.targetPhrase,
    sourceEmbedding: sourceVectors[i] ?? [],
  }));

  await invoke('vec_save_locked_phrases', { workspaceId, chunkId, pairs, minPhraseLength });
}
