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
  projectId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  chunks: Array<{ id: string; text: string }>;
  onProgress: (processed: number, total: number, estimatedCostUsd: number) => void;
}

export async function runEmbeddingJob(options: EmbeddingJobOptions): Promise<void> {
  const { projectId, embeddingModel, splitter, chunks, onProgress } = options;

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
      await invoke('vec_upsert_source_phrase', { projectId, chunkId, phrase, embedding });
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

// ── Batch search pre-pipeline ────────────────────────────────────────

export interface BatchSearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  chunks: Array<{ id: string; text: string }>;
  threshold: number;
  maxResults: number;
}

export async function searchPhraseMemoryBatch(
  options: BatchSearchOptions,
): Promise<Map<string, PhraseMatch[]>> {
  const { workspaceId, embeddingModel, chunks, threshold, maxResults } = options;
  if (chunks.length === 0) return new Map();

  const texts = chunks.map((c) => c.text);
  const embeddings = await fetchEmbeddings(texts, embeddingModel);

  const result = new Map<string, PhraseMatch[]>();
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue;
    const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
      workspaceId,
      queryEmbedding: embedding,
      threshold,
      maxResults,
    });
    result.set(chunks[i].id, raw.map((r) => ({
      phraseMemoryId: r.phrase_memory_id,
      sourcePhrase: r.source_phrase,
      targetPhrase: r.target_phrase,
      distance: r.distance,
    })));
  }
  return result;
}

// ── Bulk save completed phrases ───────────────────────────────────────

export interface SaveAllCompletedOptions {
  workspaceId: string;
  projectId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  minPhraseLength: number;
  sourceLanguage: string;
  targetLanguage: string;
  chunks: Array<{ id: string; sourceText: string; targetText: string }>;
  onProgress?: (done: number, total: number) => void;
}

export async function saveAllCompletedPhrases(options: SaveAllCompletedOptions): Promise<void> {
  const {
    workspaceId, projectId, embeddingModel, splitter, minPhraseLength,
    sourceLanguage, targetLanguage, chunks, onProgress,
  } = options;
  const total = chunks.length;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await saveLockedPhrases({
      workspaceId, projectId, chunkId: chunk.id, embeddingModel,
      splitter, sourceText: chunk.sourceText, targetText: chunk.targetText,
      minPhraseLength, sourceLanguage, targetLanguage,
    });
    onProgress?.(i + 1, total);
  }
}

// ── Save on lock ─────────────────────────────────────────────────────

export interface SaveLockedPhrasesOptions {
  workspaceId: string;
  projectId: string;
  chunkId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  sourceText: string;
  targetText: string;
  minPhraseLength: number;
  sourceLanguage: string;
  targetLanguage: string;
}

export async function saveLockedPhrases(options: SaveLockedPhrasesOptions): Promise<void> {
  const {
    workspaceId, projectId, chunkId, embeddingModel, splitter,
    sourceText, targetText, minPhraseLength, sourceLanguage, targetLanguage,
  } = options;

  const sourcePhrases = await splitPhrases(sourceText, splitter);
  const targetPhrases = await splitPhrases(targetText, splitter);
  const pairCount = Math.min(sourcePhrases.length, targetPhrases.length);
  if (pairCount === 0) return;

  const paired = sourcePhrases
    .slice(0, pairCount)
    .map((sp, i) => ({ sourcePhrase: sp, targetPhrase: targetPhrases[i] }))
    .filter((p) => p.sourcePhrase.length >= minPhraseLength);

  if (paired.length === 0) return;

  const sourceVectors = await fetchEmbeddings(paired.map((p) => p.sourcePhrase), embeddingModel);
  const pairs = paired.map((p, i) => ({
    sourcePhrase: p.sourcePhrase,
    targetPhrase: p.targetPhrase,
    sourceEmbedding: sourceVectors[i] ?? [],
  }));

  await invoke('vec_save_locked_phrases', {
    workspaceId, projectId, chunkId, pairs, minPhraseLength, sourceLanguage, targetLanguage,
  });
}
