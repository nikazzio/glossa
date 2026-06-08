import { invoke } from '@tauri-apps/api/core';
import { select } from './dbService';
import { logOperation } from '../stores/operationLogStore';
import { logger } from '../utils/logger';
import type { EmbeddingModel, ModelProvider, PhraseMatch } from '../types';
import { fetchEmbeddings } from './embeddingService';
import { useConfigStore } from '../stores/configStore';

type RawPhraseMatch = {
  phrase_memory_id: string;
  source_phrase: string;
  target_phrase: string;
  distance: number;
  confidence: number | null;
};

type RawPhraseMemoryEntry = {
  id: string;
  workspace_id: string;
  source_phrase: string;
  target_phrase: string;
  confidence: number | null;
  source_language: string;
  target_language: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunk_id: string | null;
  project_id: string | null;
  embedding_model: string | null;
  created_at: string;
};

type ExtractedPhrasePair = {
  sourcePhrase: string;
  targetPhrase: string;
  confidence: number;
};

type RawExtractedPairs = {
  pairs: ExtractedPhrasePair[];
};

export interface PhraseMemoryEntry {
  id: string;
  workspaceId: string;
  sourcePhrase: string;
  targetPhrase: string;
  confidence: number;
  sourceLanguage: string;
  targetLanguage: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunkId: string | null;
  projectId: string | null;
  embeddingModel: string | null;
  createdAt: string;
}

export interface SearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  queryText: string;
  threshold: number;
  maxResults: number;
}

export interface BatchSearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  chunks: Array<{ id: string; text: string }>;
  threshold: number;
  maxResults: number;
}

export interface SaveSelectedPhrasesOptions {
  workspaceId: string;
  projectId: string;
  embeddingModel: EmbeddingModel;
  extractorProvider: ModelProvider;
  extractorModel: string;
  extractorPrompt: string;
  sourceLanguage: string;
  targetLanguage: string;
  chunks: Array<{ id: string; sourceText: string; targetText: string }>;
  onProgress?: (done: number, total: number) => void;
}

export interface SavePhrasePairsOptions {
  workspaceId: string;
  projectId: string;
  chunkId: string;
  embeddingModel: EmbeddingModel;
  extractorProvider: ModelProvider;
  extractorModel: string;
  extractorPrompt: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

function toPhraseMatch(raw: RawPhraseMatch): PhraseMatch {
  return {
    phraseMemoryId: raw.phrase_memory_id,
    sourcePhrase: raw.source_phrase,
    targetPhrase: raw.target_phrase,
    distance: raw.distance,
    confidence: raw.confidence ?? 1,
  };
}

function toPhraseMemoryEntry(raw: RawPhraseMemoryEntry): PhraseMemoryEntry {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    sourcePhrase: raw.source_phrase,
    targetPhrase: raw.target_phrase,
    confidence: raw.confidence ?? 1,
    sourceLanguage: raw.source_language,
    targetLanguage: raw.target_language,
    author: raw.author,
    work: raw.work,
    domain: raw.domain,
    tags: raw.tags,
    notes: raw.notes,
    chunkId: raw.chunk_id,
    projectId: raw.project_id,
    embeddingModel: raw.embedding_model,
    createdAt: raw.created_at,
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function similarityToDistanceThreshold(similarityThreshold: number): number {
  const clamped = Math.max(0, Math.min(1, similarityThreshold));
  return 1 - clamped;
}

function validateExtractedPairs(
  pairs: ExtractedPhrasePair[],
  sourceText: string,
  targetText: string,
): ExtractedPhrasePair[] {
  const seen = new Set<string>();
  return pairs.flatMap((pair) => {
    const sourcePhrase = pair.sourcePhrase.trim();
    const targetPhrase = pair.targetPhrase.trim();
    if (!sourcePhrase || !targetPhrase) return [];
    if (!sourceText.includes(sourcePhrase) || !targetText.includes(targetPhrase)) return [];

    const key = `${sourcePhrase}\u001f${targetPhrase}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      sourcePhrase,
      targetPhrase,
      confidence: clampConfidence(pair.confidence),
    }];
  });
}

export async function extractPhraseMemoryPairs(options: {
  provider: ModelProvider;
  model: string;
  prompt: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  chunkId?: string;
}): Promise<ExtractedPhrasePair[]> {
  logOperation({
    level: 'info',
    scope: 'memory',
    phase: 'start',
    chunkId: options.chunkId,
    message: 'Memory extractor started',
    meta: {
      provider: options.provider,
      model: options.model,
      sourceChars: options.sourceText.length,
      targetChars: options.targetText.length,
    },
  });

  try {
    const raw = await invoke<RawExtractedPairs>('extract_phrase_memory_pairs', {
      provider: options.provider,
      model: options.model,
      prompt: options.prompt,
      sourceText: options.sourceText,
      targetText: options.targetText,
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      ollamaBaseUrl: useConfigStore.getState().ollamaBaseUrl,
    });

    const rawCount = raw.pairs?.length ?? 0;
    const validated = validateExtractedPairs(raw.pairs ?? [], options.sourceText, options.targetText);

    logOperation({
      level: validated.length > 0 ? 'success' : 'warn',
      scope: 'memory',
      phase: 'end',
      chunkId: options.chunkId,
      message: validated.length > 0
        ? 'Memory extractor returned aligned pairs'
        : 'Memory extractor returned no usable pairs',
      meta: {
        provider: options.provider,
        model: options.model,
        rawPairCount: rawCount,
        acceptedPairCount: validated.length,
        discardedPairCount: rawCount - validated.length,
      },
    });

    return validated;
  } catch (error: unknown) {
    logOperation({
      level: 'error',
      scope: 'memory',
      phase: 'end',
      chunkId: options.chunkId,
      message: 'Memory extractor failed',
      meta: {
        provider: options.provider,
        model: options.model,
        error: String(error),
      },
      detail: String(error),
      detailKind: 'error',
    });
    throw error;
  }
}

export async function searchPhraseMemory(options: SearchOptions): Promise<PhraseMatch[]> {
  const { workspaceId, embeddingModel, queryText, threshold, maxResults } = options;
  logOperation({
    level: 'info',
    scope: 'memory',
    phase: 'start',
    message: 'Phrase memory search started',
    meta: {
      workspaceId,
      embeddingModel,
      threshold,
      maxResults,
      queryChars: queryText.length,
    },
  });
  const [queryEmbedding] = await fetchEmbeddings([queryText], embeddingModel);
  if (!queryEmbedding) {
    logOperation({
      level: 'warn',
      scope: 'memory',
      phase: 'end',
      message: 'Phrase memory search skipped because embedding generation failed',
      meta: { workspaceId, embeddingModel },
    });
    return [];
  }

  const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
    workspaceId,
    queryEmbedding,
    threshold: similarityToDistanceThreshold(threshold),
    maxResults,
    embeddingModel,
  });

  const results = raw.map(toPhraseMatch);
  logOperation({
    level: 'success',
    scope: 'memory',
    phase: 'end',
    message: 'Phrase memory search completed',
    meta: {
      workspaceId,
      embeddingModel,
      resultCount: results.length,
      threshold,
      maxResults,
    },
  });
  return results;
}

export async function searchPhraseMemoryBatch(
  options: BatchSearchOptions,
): Promise<Map<string, PhraseMatch[]>> {
  const { workspaceId, embeddingModel, chunks, threshold, maxResults } = options;
  if (chunks.length === 0) return new Map();

  logOperation({
    level: 'info',
    scope: 'memory',
    phase: 'start',
    message: 'Batch phrase memory search started',
    meta: {
      workspaceId,
      embeddingModel,
      chunkCount: chunks.length,
      threshold,
      maxResults,
    },
  });

  const texts = chunks.map((c) => c.text);
  let embeddings: number[][];
  try {
    embeddings = await fetchEmbeddings(texts, embeddingModel);
  } catch (err) {
    logOperation({
      level: 'error',
      scope: 'memory',
      phase: 'end',
      message: 'Batch phrase memory search failed during embedding',
      meta: { workspaceId, embeddingModel, chunkCount: chunks.length, error: String(err) },
    });
    throw err;
  }

  const result = new Map<string, PhraseMatch[]>();
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue;
    try {
      const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
        workspaceId,
        queryEmbedding: embedding,
        threshold: similarityToDistanceThreshold(threshold),
        maxResults,
        embeddingModel,
      });
      result.set(chunks[i].id, raw.map(toPhraseMatch));
    } catch (err) {
      logOperation({
        level: 'error',
        scope: 'memory',
        phase: 'end',
        message: 'Batch phrase memory search failed during vec_search',
        meta: { workspaceId, embeddingModel, chunkId: chunks[i].id, error: String(err) },
      });
      throw err;
    }
  }
  logOperation({
    level: 'success',
    scope: 'memory',
    phase: 'end',
    message: 'Batch phrase memory search completed',
    meta: {
      workspaceId,
      embeddingModel,
      chunkCount: chunks.length,
      matchedChunkCount: result.size,
      threshold,
      maxResults,
    },
  });
  return result;
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

export async function saveSelectedPhrases(options: SaveSelectedPhrasesOptions): Promise<number> {
  const {
    workspaceId, projectId, embeddingModel, extractorProvider, extractorModel, extractorPrompt,
    sourceLanguage, targetLanguage, chunks, onProgress,
  } = options;
  const singleChunkId = chunks.length === 1 ? chunks[0].id : undefined;
  logger.debug('phrase_memory.save_selected.start', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    embeddingModel,
    extractorProvider,
    extractorModel,
    sourceLanguage,
    targetLanguage,
  });
  logOperation({
    level: 'info',
    scope: 'memory',
    phase: 'start',
    chunkId: singleChunkId,
    message: 'Phrase memory save started',
    meta: {
      workspaceId,
      projectId,
      chunkCount: chunks.length,
      embeddingModel,
      extractorProvider,
      extractorModel,
      sourceLanguage,
      targetLanguage,
    },
  });

  const total = chunks.length;
  let savedTotal = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const savedForChunk = await savePhrasePairs({
      workspaceId,
      projectId,
      chunkId: chunk.id,
      embeddingModel,
      extractorProvider,
      extractorModel,
      extractorPrompt,
      sourceText: chunk.sourceText,
      targetText: chunk.targetText,
      sourceLanguage,
      targetLanguage,
    });
    savedTotal += savedForChunk;
    logger.debug('phrase_memory.save_selected.chunk_done', {
      workspaceId,
      projectId,
      chunkId: chunk.id,
      savedForChunk,
      savedTotal,
    });
    logOperation({
      level: savedForChunk > 0 ? 'success' : 'warn',
      scope: 'memory',
      chunkId: chunk.id,
      message: savedForChunk > 0
        ? 'Phrase memory chunk saved'
        : 'Phrase memory chunk produced no saved pairs',
      meta: {
        workspaceId,
        projectId,
        savedForChunk,
        savedTotal,
      },
    });
    onProgress?.(i + 1, total);
  }

  logger.info('phrase_memory.save_selected.done', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    savedTotal,
  });
  logOperation({
    level: savedTotal > 0 ? 'success' : 'warn',
    scope: 'memory',
    phase: 'end',
    chunkId: singleChunkId,
    message: savedTotal > 0
      ? 'Phrase memory save completed'
      : 'Phrase memory save completed without saved pairs',
    meta: {
      workspaceId,
      projectId,
      chunkCount: chunks.length,
      savedTotal,
    },
  });
  return savedTotal;
}

export async function savePhrasePairs(options: SavePhrasePairsOptions): Promise<number> {
  const {
    workspaceId, projectId, chunkId, embeddingModel, extractorProvider, extractorModel,
    extractorPrompt, sourceText, targetText, sourceLanguage, targetLanguage,
  } = options;

  const extractedPairs = await extractPhraseMemoryPairs({
    provider: extractorProvider,
    model: extractorModel,
    prompt: extractorPrompt,
    sourceText,
    targetText,
    sourceLanguage,
    targetLanguage,
    chunkId,
  });

  logger.debug('phrase_memory.save_pairs.extracted', {
    workspaceId,
    projectId,
    chunkId,
    extractedPairCount: extractedPairs.length,
    extractorProvider,
    extractorModel,
  });
  logOperation({
    level: extractedPairs.length > 0 ? 'success' : 'warn',
    scope: 'memory',
    chunkId,
    message: extractedPairs.length > 0
      ? 'Phrase memory extractor produced usable pairs'
      : 'Phrase memory extractor produced no usable pairs',
    meta: {
      workspaceId,
      projectId,
      candidatePairCount: extractedPairs.length,
      extractorProvider,
      extractorModel,
    },
  });

  if (extractedPairs.length === 0) return 0;

  const sourceVectors = await fetchEmbeddings(
    extractedPairs.map((pair) => pair.sourcePhrase),
    embeddingModel,
  );

  const pairs = extractedPairs.flatMap((pair, i) => {
    const sourceEmbedding = sourceVectors[i];
    return sourceEmbedding?.length
      ? [{ ...pair, sourceEmbedding }]
      : [];
  });

  const droppedCount = extractedPairs.length - pairs.length;
  if (droppedCount > 0 && pairs.length > 0) {
    logger.warn('phrase_memory.save_pairs.partial_embedding_drop', {
      workspaceId,
      projectId,
      chunkId,
      candidatePairCount: extractedPairs.length,
      droppedCount,
    });
    logOperation({
      level: 'warn',
      scope: 'memory',
      chunkId,
      message: `${droppedCount} pair(s) discarded — embedding unavailable`,
      meta: { workspaceId, projectId, candidatePairCount: extractedPairs.length, droppedCount },
    });
  }

  if (pairs.length === 0) {
    logger.warn('phrase_memory.save_pairs.no_valid_embeddings', {
      workspaceId,
      projectId,
      chunkId,
      candidatePairCount: extractedPairs.length,
      embeddingCount: sourceVectors.length,
    });
    logOperation({
      level: 'warn',
      scope: 'memory',
      chunkId,
      message: 'Phrase memory save skipped because embeddings could not be generated',
      meta: {
        workspaceId,
        projectId,
        candidatePairCount: extractedPairs.length,
        embeddingCount: sourceVectors.length,
      },
    });
    return 0;
  }

  const savedCount = await invoke<number>('vec_save_locked_phrases', {
    workspaceId,
    projectId,
    chunkId,
    pairs,
    sourceLanguage,
    targetLanguage,
    embeddingModel,
  });
  logger.info('phrase_memory.save_pairs.insert_done', {
    workspaceId,
    projectId,
    chunkId,
    candidatePairCount: extractedPairs.length,
    embeddingCount: sourceVectors.length,
    savedCount,
  });
  logOperation({
    level: savedCount > 0 ? 'success' : 'warn',
    scope: 'memory',
    chunkId,
    phase: 'end',
    message: savedCount > 0
      ? 'Phrase memory pairs inserted'
      : 'Phrase memory insert finished without saved rows',
    meta: {
      workspaceId,
      projectId,
      candidatePairCount: extractedPairs.length,
      embeddingCount: sourceVectors.length,
      savedCount,
    },
  });
  return savedCount;
}

export async function regenerateAllEmbeddings(
  workspaceId: string,
  model: EmbeddingModel,
): Promise<number> {
  return invoke<number>('vec_regenerate_all_embeddings', { workspaceId, model });
}

export async function getChunkPositions(chunkIds: string[]): Promise<Record<string, number>> {
  if (chunkIds.length === 0) return {};
  const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await select<{ id: string; position: number | null }>(
    `SELECT id, position FROM translations WHERE id IN (${placeholders})`,
    chunkIds,
  );
  const map: Record<string, number> = {};
  rows.forEach((row) => {
    if (row.position !== null) map[row.id] = row.position;
  });
  return map;
}
