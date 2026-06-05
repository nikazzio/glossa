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

type RawPhraseMemoryEntry = {
  id: string;
  workspace_id: string;
  source_phrase: string;
  target_phrase: string;
  source_language: string;
  target_language: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunk_id: string | null;
  project_id: string | null;
  created_at: string;
};

export interface PhraseMemoryEntry {
  id: string;
  workspaceId: string;
  sourcePhrase: string;
  targetPhrase: string;
  sourceLanguage: string;
  targetLanguage: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunkId: string | null;
  projectId: string | null;
  createdAt: string;
}

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

function toPhraseMemoryEntry(raw: RawPhraseMemoryEntry): PhraseMemoryEntry {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    sourcePhrase: raw.source_phrase,
    targetPhrase: raw.target_phrase,
    sourceLanguage: raw.source_language,
    targetLanguage: raw.target_language,
    author: raw.author,
    work: raw.work,
    domain: raw.domain,
    tags: raw.tags,
    notes: raw.notes,
    chunkId: raw.chunk_id,
    projectId: raw.project_id,
    createdAt: raw.created_at,
  };
}

export async function listPhraseMemoryEntries(workspaceId: string): Promise<PhraseMemoryEntry[]> {
  const raw = await invoke<RawPhraseMemoryEntry[]>('vec_list_phrase_memory', { workspaceId });
  return raw.map(toPhraseMemoryEntry);
}

export async function deletePhraseMemoryEntry(
  workspaceId: string,
  phraseMemoryId: string,
): Promise<void> {
  await invoke('vec_delete_phrase_memory', { workspaceId, phraseMemoryId });
}

export async function updatePhraseMemoryEntry(options: {
  workspaceId: string;
  phraseMemoryId: string;
  embeddingModel: EmbeddingModel;
  sourcePhrase: string;
  targetPhrase: string;
}): Promise<void> {
  const sourcePhrase = options.sourcePhrase.trim();
  const targetPhrase = options.targetPhrase.trim();
  if (!sourcePhrase || !targetPhrase) {
    throw new Error('Source and target phrases are required.');
  }

  const [embedding] = await fetchEmbeddings([sourcePhrase], options.embeddingModel);
  if (!embedding) {
    throw new Error('Embedding generation failed.');
  }

  await invoke('vec_update_phrase_memory', {
    workspaceId: options.workspaceId,
    phraseMemoryId: options.phraseMemoryId,
    sourcePhrase,
    targetPhrase,
    embedding,
  });
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

// ── Explicit phrase memory save ───────────────────────────────────────

export interface SaveSelectedPhrasesOptions {
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

export async function saveSelectedPhrases(options: SaveSelectedPhrasesOptions): Promise<number> {
  const {
    workspaceId, projectId, embeddingModel, splitter, minPhraseLength,
    sourceLanguage, targetLanguage, chunks, onProgress,
  } = options;
  logger.debug('phrase_memory.save_selected.start', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    embeddingModel,
    splitter,
    minPhraseLength,
    sourceLanguage,
    targetLanguage,
  });
  const total = chunks.length;
  let savedTotal = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const savedForChunk = await savePhrasePairs({
      workspaceId, projectId, chunkId: chunk.id, embeddingModel,
      splitter, sourceText: chunk.sourceText, targetText: chunk.targetText,
      minPhraseLength, sourceLanguage, targetLanguage,
    });
    savedTotal += savedForChunk;
    logger.debug('phrase_memory.save_selected.chunk_done', {
      workspaceId,
      projectId,
      chunkId: chunk.id,
      savedForChunk,
      savedTotal,
    });
    onProgress?.(i + 1, total);
  }
  logger.info('phrase_memory.save_selected.done', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    savedTotal,
  });
  return savedTotal;
}

// ── Save phrase pairs ────────────────────────────────────────────────

export interface SavePhrasePairsOptions {
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

export async function savePhrasePairs(options: SavePhrasePairsOptions): Promise<number> {
  const {
    workspaceId, projectId, chunkId, embeddingModel, splitter,
    sourceText, targetText, minPhraseLength, sourceLanguage, targetLanguage,
  } = options;

  const sourcePhrases = await splitPhrases(sourceText, splitter);
  const targetPhrases = await splitPhrases(targetText, splitter);
  const pairCount = Math.min(sourcePhrases.length, targetPhrases.length);
  logger.debug('phrase_memory.save_pairs.split', {
    workspaceId,
    projectId,
    chunkId,
    splitter,
    sourcePhraseCount: sourcePhrases.length,
    targetPhraseCount: targetPhrases.length,
    pairCount,
  });
  if (pairCount === 0) return 0;

  const paired = sourcePhrases
    .slice(0, pairCount)
    .map((sp, i) => ({ sourcePhrase: sp, targetPhrase: targetPhrases[i] }))
    .filter((p) => p.sourcePhrase.length >= minPhraseLength);

  logger.debug('phrase_memory.save_pairs.filtered', {
    workspaceId,
    projectId,
    chunkId,
    candidatePairCount: paired.length,
    minPhraseLength,
  });

  if (paired.length === 0) return 0;

  logger.debug('phrase_memory.save_pairs.embedding_start', {
    workspaceId,
    projectId,
    chunkId,
    embeddingModel,
    candidatePairCount: paired.length,
  });
  const sourceVectors = await fetchEmbeddings(paired.map((p) => p.sourcePhrase), embeddingModel);
  if (sourceVectors.length !== paired.length) {
    logger.warn('phrase_memory.save_pairs.embedding_count_mismatch', {
      workspaceId,
      projectId,
      chunkId,
      expected: paired.length,
      received: sourceVectors.length,
    });
  }
  const pairs = paired.flatMap((p, i) => {
    const sourceEmbedding = sourceVectors[i];
    return sourceEmbedding?.length
      ? [{ sourcePhrase: p.sourcePhrase, targetPhrase: p.targetPhrase, sourceEmbedding }]
      : [];
  });

  if (pairs.length === 0) {
    logger.warn('phrase_memory.save_pairs.no_valid_embeddings', {
      workspaceId,
      projectId,
      chunkId,
      candidatePairCount: paired.length,
      embeddingCount: sourceVectors.length,
    });
    return 0;
  }

  const savedCount = await invoke<number>('vec_save_locked_phrases', {
    workspaceId, projectId, chunkId, pairs, minPhraseLength, sourceLanguage, targetLanguage,
  });
  logger.info('phrase_memory.save_pairs.insert_done', {
    workspaceId,
    projectId,
    chunkId,
    candidatePairCount: paired.length,
    embeddingCount: sourceVectors.length,
    savedCount,
  });
  return savedCount;
}
